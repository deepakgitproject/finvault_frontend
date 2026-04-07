import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle/theme-toggle.component';
import { CardService, DisplayCard } from '../../core/services/card.service';
import { AuthService } from '../../core/services/auth.service';
import { GlobalUiService } from '../../core/services/global-ui.service';
import { ComingSoonComponent } from '../../shared/components/coming-soon/coming-soon.component';
import { ToastComponent } from '../../shared/components/toast/toast.component';
import { AddCardCommand } from '../../core/models/card.models';
import { HttpClient } from '@angular/common/http';

// --- Types -----------------------------------------------------------
type CardNetwork = 'visa' | 'mastercard' | 'rupay' | 'amex';

interface NewCardForm {
  cardholderName: string;
  cardNumber: string;
  cvv: string;
  expiryMonth: number;
  expiryYear: number;
  issuerName: string;
  creditLimit: number;
  billingCycleStartDay: number;
}

// --- Component -------------------------------------------------------
@Component({
  selector: 'app-cards',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, SidebarComponent, ThemeToggleComponent, ComingSoonComponent, ToastComponent],
  templateUrl: './cards.html',
  styleUrl: './cards.scss'
})
export class CardsComponent implements OnInit {
  // --- Service injection ------------------------------------------
  public readonly cardService = inject(CardService);
  private readonly authService = inject(AuthService);
  private readonly globalUiService = inject(GlobalUiService);
  private readonly http = inject(HttpClient);

  // --- Bind to CardService signal - NO local card state -----------
  public readonly cards = this.cardService.cards;

  // --- Modal state (local - only affects this page's UI) ----------
  modalOpen = signal(false);
  modalStep = signal<1 | 2 | 3>(1);
  selectedNetwork = signal<CardNetwork | null>(null);
  
  // Reveal tracking
  revealingIds = signal<Set<string>>(new Set());
  private revealTimers: Record<string, any> = {};

  newCard: NewCardForm = {
    cardholderName: '',
    cardNumber: '',
    cvv: '',
    expiryMonth: 1,
    expiryYear: new Date().getFullYear() + 1,
    issuerName: '',
    creditLimit: 100000,
    billingCycleStartDay: 1
  };

  // Dropdown options
  months = Array.from({ length: 12 }, (_, i) => i + 1);
  years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i);
  billingDays = Array.from({ length: 28 }, (_, i) => i + 1);

  transactions: any[] = [];

  // --- Network config --------------------------------------------
  networkConfig: Record<CardNetwork, { gradient: string; label: string }> = {
    visa: { gradient: 'linear-gradient(135deg, #1a1f71, #0a0e3a)', label: 'Visa' },
    mastercard: { gradient: 'linear-gradient(135deg, #1a1a2e, #2d2d44)', label: 'Mastercard' },
    rupay: { gradient: 'linear-gradient(135deg, #004d40, #00695c)', label: 'RuPay' },
    amex: { gradient: 'linear-gradient(135deg, #006fcf, #004a8f)', label: 'Amex' }
  };

  networks: CardNetwork[] = ['visa', 'mastercard', 'rupay', 'amex'];
  issuers: string[] = ['Visa', 'MasterCard', 'RuPay', 'Amex'];

  // --- Lifecycle -------------------------------------------------
  ngOnInit(): void {
    this.cardService.refreshCards();
    this.loadTransactions();
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

  onWalletClick(): void {
    this.globalUiService.showComingSoon();
  }

  // --- Card display helpers --------------------------------------
  toggleDetails(index: number): void {
    const card = this.cards()[index];
    if (!card) return;

    if (card.showDetails) {
      // Already showing? Hide it manually.
      this.cardService.toggleCardDetails(index);
      this.clearRevealTimer(card.id);
    } else {
      // Hidden? Call reveal API.
      this.revealCard(card.id, index);
    }
  }

  private revealCard(cardId: string, index: number): void {
    if (this.revealingIds().has(cardId)) return;

    this.revealingIds.update(ids => new Set(ids).add(cardId));
    
    this.cardService.revealCard(cardId).subscribe({
      next: (res) => {
        this.revealingIds.update(ids => {
          const next = new Set(ids);
          next.delete(cardId);
          return next;
        });

        // Set 30s auto-hide timer
        this.clearRevealTimer(cardId);
        this.revealTimers[cardId] = setTimeout(() => {
          // Check if still visible before hiding
          if (this.cards()[index]?.showDetails) {
            this.cardService.toggleCardDetails(index);
          }
        }, 30000);
      },
      error: () => {
        this.revealingIds.update(ids => {
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

  copyToClipboard(text: string): void {
    const clean = text.replace(/\s/g, '');
    navigator.clipboard.writeText(clean).then(() => {
      this.globalUiService.success('Card number copied to clipboard.');
    });
  }

  getDisplayNumber(card: DisplayCard): string {
    return card.showDetails
      ? card.fullNumber
      : `**** **** **** ${card.maskedNumber.replace(/\D/g, '').slice(-4)}`;
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

  formatLimit(amount: number): string {
    return 'Rs.' + amount.toLocaleString('en-IN');
  }

  formatExpiry(card: DisplayCard): string {
    return `${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(-2)}`;
  }

  // --- Modal -----------------------------------------------------
  openModal(): void {
    this.modalOpen.set(true);
    this.modalStep.set(1);
    this.selectedNetwork.set(null);
    this.resetForm();
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.modalStep.set(1);
    this.selectedNetwork.set(null);
    this.resetForm();
  }

  selectNetwork(n: CardNetwork): void {
    this.selectedNetwork.set(n);
    this.modalStep.set(2);
  }

  goToReview(): void {
    if (this.isStep2Valid()) {
      this.modalStep.set(3);
    }
  }

  goBackToStep(step: 1 | 2): void {
    this.modalStep.set(step);
  }

  isStep2Valid(): boolean {
    const cleanNum = this.newCard.cardNumber.replace(/\s/g, '');
    return !!(
      this.newCard.cardholderName.trim() &&
      cleanNum.length >= 13 && cleanNum.length <= 19 &&
      this.newCard.cvv.length >= 3 &&
      this.newCard.issuerName.trim() &&
      this.newCard.creditLimit > 0
    );
  }

  formatCardInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let val = input.value.replace(/\D/g, '').substring(0, 19);
    
    // Auto-detect network and issuer from first digits
    if (val.length >= 1) {
      if (val.startsWith('4')) {
        this.selectedNetwork.set('visa');
        this.newCard.issuerName = 'Visa';
      } else if (val.startsWith('5')) {
        this.selectedNetwork.set('mastercard');
        this.newCard.issuerName = 'MasterCard';
      } else if (val.startsWith('3')) {
        this.selectedNetwork.set('amex');
        this.newCard.issuerName = 'Amex';
      } else if (val.startsWith('6')) {
        this.selectedNetwork.set('rupay');
        this.newCard.issuerName = 'RuPay';
      }
    }

    val = val.replace(/(\d{4})(?=\d)/g, '$1 ');
    this.newCard.cardNumber = val;
    input.value = val;
  }

  getPreviewMasked(): string {
    const digits = this.newCard.cardNumber.replace(/\s/g, '');
    const last4 = digits.slice(-4) || '0000';
    return `**** **** **** ${last4}`;
  }

  // --- Submit Card (Pessimistic Add) ----------------------------
  submitCard(): void {
    if (!this.selectedNetwork()) return;
    if (this.cardService.isAdding()) return; // Prevent duplicate submissions

    const payload: AddCardCommand = {
      userId: this.authService.getUserId() || '00000000-0000-0000-0000-000000000000',
      cardNumber: this.newCard.cardNumber.replace(/\s/g, ''),
      cvv: this.newCard.cvv,
      cardholderName: this.newCard.cardholderName.toUpperCase(),
      expiryMonth: this.newCard.expiryMonth,
      expiryYear: this.newCard.expiryYear,
      issuerName: this.newCard.issuerName,
      creditLimit: this.newCard.creditLimit,
      billingCycleStartDay: this.newCard.billingCycleStartDay
    };

    this.cardService.addCard(payload).subscribe({
      next: () => {
        this.closeModal();
      },
      error: () => {
        // Error toast is already shown by CardService
      }
    });
  }

  isSubmitting = this.cardService.isAdding;

  // --- Card Management ------------------------------------------
  deleteCard(cardId: string): void {
    if (!cardId) return;
    if (this.cardService.deletingIds().has(cardId)) return; // Already in progress

    this.cardService.deleteCard(cardId).subscribe({
      error: () => { /* Error toast already shown by CardService */ }
    });
  }

  setDefaultCard(cardId: string): void {
    if (!cardId) return;
    this.cardService.setDefault(cardId).subscribe();
  }

  updateCardLimit(cardId: string, newLimit: number): void {
    if (!cardId || newLimit <= 0) return;
    this.cardService.updateLimit(cardId, { newLimit }).subscribe();
  }

  private resetForm(): void {
    this.newCard = {
      cardholderName: '',
      cardNumber: '',
      cvv: '',
      expiryMonth: 1,
      expiryYear: new Date().getFullYear() + 1,
      issuerName: '',
      creditLimit: 100000,
      billingCycleStartDay: 1
    };
  }
}

