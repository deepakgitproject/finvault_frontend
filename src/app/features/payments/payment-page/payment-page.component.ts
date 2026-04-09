import { Component, OnInit, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardService, CardResponse } from '../../../core/services/card.service';
import { PaymentService } from '../services/payment.service';
import { TransactionService, Transaction } from '../../../core/services/transaction.service';
import { FakeRazorpayComponent } from '../fake-razorpay/fake-razorpay.component';
import { PaymentSuccessComponent } from '../payment-success/payment-success.component';
import { SidebarComponent } from '../../../shared/components/sidebar/sidebar.component';
import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-payment-page',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    FakeRazorpayComponent, 
    PaymentSuccessComponent,
    SidebarComponent,
    ThemeToggleComponent
  ],
  templateUrl: './payment-page.component.html',
  styleUrls: ['./payment-page.component.scss']
})
export class PaymentPageComponent implements OnInit {
  public cardService = inject(CardService);
  private paymentService = inject(PaymentService);
  private transactionService = inject(TransactionService);

  // Recent Transactions State
  recentTransactions = signal<Transaction[]>([]);
  txnPage = signal<number>(1);
  txnPageSize = 5;
  isLoadingTxns = signal<boolean>(false);

  paginatedTxns = computed(() => {
    const list = this.recentTransactions();
    const start = (this.txnPage() - 1) * this.txnPageSize;
    return list.slice(start, start + this.txnPageSize);
  });

  txnTotalPages = computed(() => Math.ceil(this.recentTransactions().length / this.txnPageSize));

  // User info
  userEmail = signal('User');
  userInitials = signal('U');

  // Computed cards mapped to CardResponse for consistency
  mappedCards = computed(() => {
    return this.cardService.cards().map(c => ({
      id: c.id,
      userId: '',
      maskedNumber: c.maskedNumber,
      cardholderName: c.cardholderName,
      expiryMonth: c.expiryMonth,
      expiryYear: c.expiryYear,
      issuerName: c.issuerName,
      cardNumberLastFour: c.maskedNumber.replace(/[^0-9]/g, '').slice(-4),
      creditLimit: c.creditLimit,
      outstandingBalance: c.currentBalance,
      currentBalance: c.currentBalance,
      availableCredit: c.creditLimit - c.currentBalance,
      utilization: c.usagePercent,
      billingCycleStartDay: 1,
      isDefault: false,
      isVerified: true,
      createdAt: new Date().toISOString()
    } as CardResponse));
  });

  // State
  currentStep: 1 | 2 = 1;
  selectedCard: CardResponse | null = null;
  paymentAmount: number = 0;
  showRazorpayModal: boolean = false;
  showSuccessModal: boolean = false;
  lastPaymentResponse: any = null;
  
  // Carousel State
  focusedCardIndex: number = 0;

  paymentType = computed(() => {
    if (!this.selectedCard) return 'card';
    const amt = this.paymentAmount;
    const outstanding = this.selectedCard.outstandingBalance;
    const minDue = this.getMinDue(outstanding);

    if (amt >= outstanding) return 'Full';
    if (amt <= minDue) return 'Minimum';
    return 'Partial';
  });

  constructor() {}

  // Carousel Logic
  nextCard(): void {
    const total = this.mappedCards().length;
    if (this.focusedCardIndex < total - 1) {
      this.focusedCardIndex++;
    }
  }

  prevCard(): void {
    if (this.focusedCardIndex > 0) {
      this.focusedCardIndex--;
    }
  }

  selectCard(card: CardResponse, index: number): void {
    this.selectedCard = card;
    this.focusedCardIndex = index;
  }

  getCarouselTransform(): string {
    // 340px card width + 24px gap = 364px per item step
    const cardStep = 364; 
    // We want the focused card to be in the center. We'll simply offset by index
    // and rely on a parent container with justify-content: center or a calc shift in CSS.
    // The easiest way is translating by -index * cardStep.
    return `translateX(${-this.focusedCardIndex * cardStep}px)`;
  }

  ngOnInit(): void {
    this.extractUserInfo();
    this.cardService.refreshCards(true);
    this.loadRecentTransactions();
  }

  loadRecentTransactions(): void {
    this.isLoadingTxns.set(true);
    this.transactionService.getTransactions().subscribe({
      next: (txns) => {
        // Filter to only "Card Bill Payment" transactions (not external bills)
        const paymentTxns = txns.filter(t => {
          const cat = (t.category || '').toLowerCase();
          const desc = (t.description || '').toLowerCase();
          return t.type === 'Payment' && (cat.includes('card bill') || desc.includes('card bill'));
        });
        this.recentTransactions.set(paymentTxns);
        this.isLoadingTxns.set(false);
      },
      error: () => {
        this.recentTransactions.set([]);
        this.isLoadingTxns.set(false);
      }
    });
  }

  txnNextPage(): void {
    if (this.txnPage() < this.txnTotalPages()) {
      this.txnPage.update(p => p + 1);
    }
  }

  txnPrevPage(): void {
    if (this.txnPage() > 1) {
      this.txnPage.update(p => p - 1);
    }
  }

  private extractUserInfo(): void {
    try {
      const token = localStorage.getItem('fv_access_token');
      if (!token) return;
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.email) {
        this.userEmail.set(payload.email.split('@')[0]);
        this.userInitials.set(payload.email.slice(0, 2).toUpperCase());
      }
    } catch { /* fallback to defaults */ }
  }

  getMinDue(outstanding: number): number {
    return Math.max(100, Math.round(outstanding * 0.05));
  }

  onPaymentSuccess(response: any): void {
    this.showRazorpayModal = false;
    this.lastPaymentResponse = response;
    this.showSuccessModal = true;
  }

  onPaymentDone(): void {
    this.showSuccessModal = false;
    this.currentStep = 1;
    this.selectedCard = null;
    this.paymentAmount = 0;
    this.cardService.refreshCards(true);
    this.loadRecentTransactions(); // Refresh transactions after payment
  }
}
