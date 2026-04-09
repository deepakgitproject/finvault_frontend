import { Component, OnInit, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardService, CardResponse } from '../../../core/services/card.service';
import { PaymentService } from '../services/payment.service';
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

  ngOnInit(): void {
    this.extractUserInfo();
    this.cardService.refreshCards(true);
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
  }
}
