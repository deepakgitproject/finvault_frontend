import { Component, inject, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { CardService, DisplayCard } from '../../core/services/card.service';
import { GlobalUiService } from '../../core/services/global-ui.service';
import { ComingSoonComponent } from '../../shared/components/coming-soon/coming-soon.component';
import { ToastComponent } from '../../shared/components/toast/toast.component';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, SidebarComponent, ThemeToggleComponent, ComingSoonComponent, ToastComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  public readonly cardService = inject(CardService);
  private readonly globalUiService = inject(GlobalUiService);
  private readonly http = inject(HttpClient);

  // --- Reactive Greeting --------------------------------------------
  userName = computed(() => this.authService.getUserName());
  todayDate = '';

  // --- Stats (Future: Move to specific store) -----------------------
  totalBalance = computed(() => {
    const sum = this.cardService.cards().reduce((acc, c) => acc + (c.creditLimit - (c.currentBalance || 0)), 0);
    return 'Rs.' + sum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
  
  balanceChange = "No pending bills";
  
  upcomingBillTitle = "No upcoming bills";
  upcomingBillAmount = "Rs.0.00";
  upcomingBillDue = "All caught up";

  rewardPoints = "0";
  rewardValue = "Rs.0.00";

  // --- Computed Dashboard Cards -------------------------------------
  // Limit to 3 cards for dashboard view
  dashboardCards = computed(() => this.cardService.cards().slice(0, 3));
  
  barHeights = ['32px', '48px', '64px', '96px', '80px', '56px', '40px'];

  // Reveal tracking
  revealingIds = signal<Set<string>>(new Set());
  private revealTimers: Record<string, any> = {};

  transactions: any[] = [];

  ngOnInit(): void {
    // Refresh cards (CardService handles caching internally)
    this.cardService.refreshCards();

    // Today's date formatted
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: '2-digit'
    };
    this.todayDate = now.toLocaleDateString('en-US', options).toUpperCase();

    // Fetch other stats
    const userId = this.authService.getUserId();
    if (userId) {
      this.loadBillingSummary(userId);
      this.loadUpcomingBills(userId);
      this.loadTransactions();
    }
  }

  onWalletClick(): void {
    this.globalUiService.showComingSoon();
  }

  // --- API: Billing Summary ----------------------------------------
  private loadBillingSummary(userId: string): void {
    this.http.get<any>(`/api/billing/bills/user/${userId}/summary`).subscribe({
      next: (res) => {
        const data = res?.data ?? res;
        if (data) {
          if (data.pendingCount != null) {
            this.balanceChange = `${data.pendingCount} pending bill(s)`;
          }
        }
      },
      error: () => { /* keep defaults */ }
    });
  }

  // --- API: Transactions -------------------------------------------
  private loadTransactions(): void {
    this.http.get<any>('/api/transactions').subscribe({
      next: (res) => {
        const data = res?.data ?? res;
        if (Array.isArray(data)) {
          this.transactions = data.slice(0, 5).map(t => ({
            title: t.description,
            subtitle: new Date(t.createdAt).toLocaleDateString(),
            amount: t.type === 'Reversal' ? `+Rs.${t.amount.toFixed(2)}` : `-Rs.${t.amount.toFixed(2)}`,
            icon: t.type === 'Reversal' ? 'undo' : 'payment',
            bgClass: t.type === 'Reversal' ? 'bg-green' : 'bg-indigo',
            isNegative: t.type !== 'Reversal'
          }));
        }
      },
      error: () => { this.transactions = []; }
    });
  }

  // --- API: Upcoming Bills -----------------------------------------
  private loadUpcomingBills(userId: string): void {
    this.http.get<any>(`/api/billing/bills/user/${userId}/upcoming?days=7`).subscribe({
      next: (res) => {
        const data = Array.isArray(res) ? res : (res?.data ?? []);
        if (data.length > 0) {
          const next = data[0];
          this.upcomingBillTitle = next.billingMonth || 'Upcoming Bill';
          this.upcomingBillAmount = this.formatCurrency(next.totalAmount ?? 0);
          if (next.dueDate) {
            const due = new Date(next.dueDate);
            const now = new Date();
            const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86400000);
            this.upcomingBillDue = diffDays > 0
              ? `Due in ${diffDays} day${diffDays > 1 ? 's' : ''}`
              : diffDays === 0 ? 'Due today' : `Overdue by ${Math.abs(diffDays)} day(s)`;
          }
        }
      },
      error: () => { /* keep defaults */ }
    });
  }

  private formatCurrency(value: number): string {
    if (value == null) return 'Rs.0.00';
    return 'Rs.' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // --- UI Helpers --------------------------------------------------
  toggleCardDetails(index: number): void {
    const card = this.dashboardCards()[index];
    if (!card) return;

    if (card.showDetails) {
      this.cardService.toggleCardDetails(index);
      this.clearRevealTimer(card.id);
    } else {
      this.revealCard(card.id, index);
    }
  }

  private revealCard(cardId: string, index: number): void {
    if (this.revealingIds().has(cardId)) return;
    this.revealingIds.update((ids: Set<string>) => new Set(ids).add(cardId));

    this.cardService.revealCard(cardId).subscribe({
      next: () => {
        this.revealingIds.update((ids: Set<string>) => {
          const next = new Set(ids);
          next.delete(cardId);
          return next;
        });

        this.clearRevealTimer(cardId);
        this.revealTimers[cardId] = setTimeout(() => {
          if (this.dashboardCards()[index]?.showDetails) {
            this.cardService.toggleCardDetails(index);
          }
        }, 30000);
      },
      error: () => {
        this.revealingIds.update((ids: Set<string>) => {
          const next = new Set(ids);
          next.delete(cardId);
          return next;
        });
      }
    });
  }

  private clearRevealTimer(cardId: string): void {
    if (this.revealTimers[cardId]) {
      clearTimeout(this.revealTimers[cardId]);
      delete this.revealTimers[cardId];
    }
  }

  getDisplayNumber(card: DisplayCard): string {
    return card.showDetails 
      ? card.fullNumber 
      : `**** **** **** ${card.maskedNumber.slice(-4)}`;
  }

  getGradient(card: DisplayCard): string {
    const gradients: Record<string, string> = {
      visa: 'linear-gradient(135deg, #1a1f71 0%, #0a0e3a 100%)',
      mastercard: 'linear-gradient(135deg, #1a1a2e 0%, #0d0d1a 100%)',
      rupay: 'linear-gradient(135deg, #004d40 0%, #00251a 100%)',
      amex: 'linear-gradient(135deg, #006fcf 0%, #004a8f 100%)'
    };
    return gradients[card.network] || gradients['visa'];
  }

  getBarColor(card: DisplayCard): string {
    if (card.usagePercent >= 80) return '#EF4444';
    if (card.usagePercent >= 50) return '#FBBF24';
    return '#22C55E';
  }

  formatExpiry(card: DisplayCard): string {
    return `${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(-2)}`;
  }
}

