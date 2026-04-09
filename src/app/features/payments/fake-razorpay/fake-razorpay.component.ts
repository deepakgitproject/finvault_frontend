import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PaymentService } from '../services/payment.service';
import { timeout, catchError, of, finalize } from 'rxjs';

@Component({
  selector: 'app-fake-razorpay',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fake-razorpay.component.html',
  styleUrls: ['./fake-razorpay.component.scss']
})
export class FakeRazorpayComponent {
  @Input() cardId: string = '';
  @Input() amount: number = 0;
  @Input() cardLastFour: string = '';
  @Input() paymentType: string = 'card';

  @Output() paymentSuccess = new EventEmitter<any>();
  @Output() paymentCancelled = new EventEmitter<void>();

  private paymentService = inject(PaymentService);

  selectedMethod: string = '';
  upiId: string = '';
  isProcessing: boolean = false;
  errorMessage: string = '';

  onPay(): void {
    if ((!this.selectedMethod && !this.upiId) || this.isProcessing) return;

    console.log('[FakeRazorpay] Payment initiated for amount:', this.amount, 'type:', this.paymentType);
    this.isProcessing = true;
    this.errorMessage = '';

    // -- SAFETY RESET (BRUTE FORCE) --
    // This will forcefully kill the loading screen if the observable hangs
    const safetyTimer = setTimeout(() => {
      if (this.isProcessing) {
        console.warn('[FakeRazorpay] CRITICAL: Hard safety timer triggered. Forcing isProcessing to false.');
        this.isProcessing = false;
        this.errorMessage = "Payment is taking too long. Please check your transaction history or try again.";
      }
    }, 4500); // 4.5 seconds (0.5s delay + 4s buffer)

    // Simulate gateway delay (reduced for snappier experience)
    setTimeout(() => {
      this.paymentService.makePayment(this.cardId, this.amount, this.paymentType)
        .pipe(
          timeout(3500), // Strict UI-level timeout
          catchError(err => {
            console.error('[FakeRazorpay] Observable error/timeout:', err);
            const msg = err.name === 'TimeoutError' 
              ? "Payment processing timed out. Please check your connection." 
              : (err.error?.message || "Payment failed. Please try again.");
            return of({ error: true, message: msg });
          }),
          finalize(() => {
            clearTimeout(safetyTimer); // Clear safety timer if observable resolves
            this.isProcessing = false;
          })
        )
        .subscribe({
          next: (response: any) => {
            console.log('[FakeRazorpay] Received response:', response);
            if (response?.error) {
              this.errorMessage = response.message;
            } else {
              this.paymentSuccess.emit(response);
            }
          },
          error: (err) => {
            this.errorMessage = "An unexpected error occurred. Please try again.";
          }
        });
    }, 500);
  }

  onCancel(): void {
    // Escalate cancel: clear processing if user manually closes
    this.isProcessing = false;
    this.paymentCancelled.emit();
  }
}


