import { Component, signal, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { SidebarComponent } from '../../../shared/components/sidebar/sidebar.component';
import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle.component';
import { GlobalUiService } from '../../../core/services/global-ui.service';
import { ComingSoonComponent } from '../../../shared/components/coming-soon/coming-soon.component';
import { AuthService } from '../../../core/services/auth.service';

export interface Bill {
    id: number;
    title: string;
    subtitle: string;
    icon: string;
    iconBg: string;
    totalDue: string;
    secondaryAmount: string;
    secondaryLabel: string;
    status: 'OVERDUE' | 'PENDING' | 'PAID' | 'PARTIALLYPAID';
    actionIcon: string;
    actionStyle: 'primary' | 'muted';
}

export interface BillGroup {
    month: string;
    badgeLabel: string;
    badgeType: 'error' | 'muted';
    faded: boolean;
    bills: Bill[];
}

export interface QuickPayCategory {
    label: string;
    icon: string;
    bg: string;
    iconColor: string;
}

interface ApiBill {
    id: number;
    totalAmount: number;
    minimumDue: number;
    amountPaid: number;
    remainingBalance: number;
    dueDate: string;
    billingMonth: string;
    status: string;
    cardId?: number;
}

@Component({
    selector: 'app-bills',
    standalone: true,
    imports: [CommonModule, RouterLink, SidebarComponent, ThemeToggleComponent, ComingSoonComponent],
    templateUrl: './bills.html',
    styleUrls: ['./bills.scss'],
})
export class BillsComponent implements OnInit {
    activeFilter = signal<string>('All Status');

    // Missing template properties
    userName = signal<string>('Vault User');
    upcomingBills = signal<any[]>([]);
    billingSummary = signal<{ totalOutstanding: number; pendingCount: number }>({ totalOutstanding: 0, pendingCount: 0 });

    filters = ['All Status', 'Pending', 'Paid'];

    quickPayCategories = [
        { id: 'electricity', label: 'Electricity', icon: 'bolt' },
        { id: 'water', label: 'Water', icon: 'water_drop' },
        { id: 'internet', label: 'Internet', icon: 'wifi' },
        { id: 'recharge', label: 'Recharge', icon: 'phone_iphone' },
        { id: 'rent', label: 'Pay Rent', icon: 'apartment' },
        { id: 'gas', label: 'Pay Gas', icon: 'local_gas_station' },
        { id: 'insurance', label: 'Insurance', icon: 'health_and_safety' },
        { id: 'metro', label: 'Pay Metro', icon: 'train' },
    ];

    billGroups: BillGroup[] = [];
    private readonly globalUiService = inject(GlobalUiService);
    private readonly authService = inject(AuthService);

    constructor(private router: Router, private http: HttpClient) {}

    ngOnInit(): void {
        this.userName.set(this.authService.getUserName());
        const userId = this.authService.getUserId();
        if (userId) {
            this.loadBillsFromApi(userId);
        }
    }

    onWalletClick(): void {
        this.globalUiService.showComingSoon();
    }

    // Used Auth Service instead of legacy check

    private loadBillsFromApi(userId: string): void {
        this.http
            .get<any>(`/api/billing/bills/user/${userId}`)
            .subscribe({
                next: (res) => {
                    // Handle both ApiResponse<T> wrapper and raw array
                    const apiBills = Array.isArray(res) ? res : (res?.data ?? []);
                    if (apiBills && apiBills.length > 0) {
                        this.billGroups = this.mapApiBillsToGroups(apiBills);
                    }
                },
                error: () => {
                    // Silently fallback to demo data already loaded
                },
            });
    }

    private mapApiBillsToGroups(apiBills: ApiBill[]): BillGroup[] {
        // Group by billingMonth
        const groupMap = new Map<string, ApiBill[]>();
        for (const b of apiBills) {
            const key = b.billingMonth ?? 'Unknown';
            if (!groupMap.has(key)) groupMap.set(key, []);
            groupMap.get(key)!.push(b);
        }

        const groups: BillGroup[] = [];
        groupMap.forEach((bills, monthString) => {
            let userFriendlyMonth = monthString;
            try {
                 const [year, m] = monthString.split('-');
                 const d = new Date(Number(year), Number(m) - 1);
                 userFriendlyMonth = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
            } catch { }

            const pendingCount = bills.filter(
                (b) => b.status?.toUpperCase() !== 'PAID'
            ).length;
            const allPaid = bills.every((b) => b.status?.toUpperCase() === 'PAID');

            groups.push({
                month: userFriendlyMonth,
                badgeLabel: allPaid ? 'COMPLETED' : `${pendingCount} PENDING`,
                badgeType: allPaid ? 'muted' : 'error',
                faded: allPaid,
                bills: bills.map((b) => this.mapApiBill(b)).sort((a,b) => b.id - a.id),
            });
        });

        const totalOutstanding = apiBills
             .filter(b => b.status?.toUpperCase() !== 'PAID')
             .reduce((sum, b) => sum + (b.remainingBalance || 0), 0);
        
        const overallPendingCount = apiBills.filter(b => b.status?.toUpperCase() !== 'PAID').length;

        this.billingSummary.set({
             totalOutstanding: totalOutstanding,
             pendingCount: overallPendingCount
        });

        return groups.sort((a, b) => b.month.localeCompare(a.month));
    }

    private mapApiBill(b: ApiBill): Bill {
        const rawStatus = (b.status ?? 'PENDING');
        const statusUpper = rawStatus.toUpperCase() as Bill['status'];
        const isPaid = statusUpper === 'PAID';

        return {
            id: b.id,
            title: `Bill #${String(b.id).substring(0, 8)}`,
            subtitle: `DUE: ${b.dueDate ? new Date(b.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}`,
            icon: 'receipt_long',
            iconBg: isPaid ? 'green' : (statusUpper === 'OVERDUE' ? 'red' : 'purple'),
            totalDue: this.formatCurrency(b.totalAmount),
            secondaryAmount: isPaid
                ? this.formatCurrency(b.amountPaid)
                : this.formatCurrency(b.remainingBalance),
            secondaryLabel: isPaid ? 'AMOUNT PAID' : 'REMAINING',
            status: statusUpper,
            actionIcon: isPaid ? 'check_circle' : 'account_balance_wallet',
            actionStyle: isPaid ? 'muted' : 'primary',
        };
    }

    private formatCurrency(value: number): string {
        if (value == null) return 'Rs.0.00';
        return 'Rs.' + value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    setFilter(filter: string) {
        this.activeFilter.set(filter);
    }

    navigateToPayments(): void {
        this.router.navigate(['/payments']);
    }

    onBillAction(bill: any): void {
        const routeData = {
           queryParams: {
               billId: bill.id,
               amount: bill.secondaryAmount.replace(/[^0-9.]/g, ''),
               totalAmount: bill.totalDue.replace(/[^0-9.]/g, '')
           }
        };
        this.router.navigate(['/payments'], routeData);
    }
}
