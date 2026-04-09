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
  
  networkConfig: any = {
    visa: { gradient: 'linear-gradient(135deg, #1a1f71, #0a0e3a)', label: 'Visa' },
    mastercard: { gradient: 'linear-gradient(135deg, #eb001b, #f79e1b)', label: 'MasterCard' },
    rupay: { gradient: 'linear-gradient(135deg, #004d40, #00695c)', label: 'RuPay' },
    amex: { gradient: 'linear-gradient(135deg, #006fcf, #004a8f)', label: 'Amex' }
  };

  transactions: any[] = [];
  
  // Analytics State
  weeklyTrend = signal<number[]>([]);
  maxTrendValue = signal<number>(1);
  graphPath = computed(() => this.generateSmoothPath(this.weeklyTrend(), 400, 160));
  analyticsTotal = computed(() => this.weeklyTrend().reduce((a, b) => a + b, 0));
  
  ngOnInit(): void {
    // Refresh cards (Force true to ensure we bypass cache when explicitly navigating)
    this.cardService.refreshCards(true);

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
      this.loadAnalytics();
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

  // --- API: Analytics ----------------------------------------------
  private loadAnalytics(): void {
    this.http.get<any>('/api/transactions').subscribe({
      next: (res) => {
        const data = res?.data ?? res;
        if (Array.isArray(data)) {
          // Process 3 weeks of daily spending
          const now = new Date();
          const dailySpend = new Array(21).fill(0);
          
          data.forEach(t => {
            if (t.type === 'Reversal') return; // Don't count reversals as spending
            const tDate = new Date(t.createdAt);
            const diffDays = Math.floor((now.getTime() - tDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (diffDays >= 0 && diffDays < 21) {
              dailySpend[20 - diffDays] += t.amount;
            }
          });

          this.weeklyTrend.set(dailySpend);
          const maxValue = Math.max(...dailySpend);
          this.maxTrendValue.set(maxValue > 0 ? maxValue : 1000); // Default to Rs.1000 scale if empty
        }
      },
      error: () => { 
        this.weeklyTrend.set(new Array(21).fill(0)); 
      }
    });
  }

  /**
   * Generates a "premium" smooth SVG path for the trend data using bezier curves.
   */
  private generateSmoothPath(data: number[], width: number, height: number): string {
    if (!data.length || data.every(v => v === 0)) return `M 0 ${height} L ${width} ${height}`;
    
    const max = this.maxTrendValue();
    const padding = 10;
    const availableHeight = height - padding * 2;
    const stepX = width / (data.length - 1);

    const points = data.map((val, i) => ({
      x: i * stepX,
      y: height - padding - (val / max) * availableHeight
    }));

    if (points.length < 2) return `M 0 ${height} L ${width} ${height}`;

    // Drawing the smooth curve
    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? i : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 === points.length ? i + 1 : i + 2];

      // Catmull-Rom to Bezier conversion
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    return d;
  }

  private enrichTransaction(txn: any): any {
    const category = (txn.category || '').toLowerCase();
    const result = {
      categoryLabel: txn.category || txn.type || 'Payment',
      categoryIcon: 'payments',
      categoryColor: 'bg-indigo'
    };

    if (txn.type === 'Reversal') {
      result.categoryLabel = 'Refund';
      result.categoryIcon = 'undo';
      result.categoryColor = 'bg-green';
      return result;
    }

    if (category.includes('elect')) { result.categoryIcon = 'bolt'; result.categoryColor = 'bg-orange'; }
    else if (category.includes('water')) { result.categoryIcon = 'water_drop'; result.categoryColor = 'bg-blue'; }
    else if (category.includes('gas')) { result.categoryIcon = 'local_gas_station'; result.categoryColor = 'bg-red'; }
    else if (category.includes('internet')) { result.categoryIcon = 'wifi'; result.categoryColor = 'bg-cyan'; }
    else if (category.includes('mobile')) { result.categoryIcon = 'phone_iphone'; result.categoryColor = 'bg-purple'; }
    else if (category.includes('dth')) { result.categoryIcon = 'settings_input_antenna'; result.categoryColor = 'bg-pink'; }
    else if (category.includes('card bill')) { result.categoryIcon = 'credit_card'; result.categoryColor = 'bg-indigo'; }

    return result;
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

  getDisplayCvv(card: DisplayCard): string {
    return card.showDetails ? card.fullCvv : card.cvv;
  }

  getGradient(card: DisplayCard): string {
    return this.networkConfig[card.network]?.gradient || this.networkConfig['visa'].gradient;
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

