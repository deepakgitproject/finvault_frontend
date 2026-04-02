import {
    Component,
    signal,
    computed,
    ViewChildren,
    QueryList,
    ElementRef,
    inject,
    OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Subscription, interval } from 'rxjs';
import { take } from 'rxjs/operators';

// ── Swagger-aligned types ────────────────────────────────────────────

export interface InitiatePaymentCommand {
    userId: string;
    cardId: string;
    billId: string;
    amount: number;
    paymentType: string;
    email: string;
}

export interface CompletePaymentCommand {
    otpCode: string;
}

export interface PaymentResponse {
    id: string;
    userId: string;
    cardId: string;
    billId: string;
    amount: number;
    paymentType: string;
    email: string;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    createdAt: string;
}

export interface PaymentFormModel {
    userId: string;
    cardId: string;
    billId: string;
    amount: number | null;
    paymentType: string;
    email: string;
}

// ── Component ────────────────────────────────────────────────────────

@Component({
    selector: 'app-pay-bill',
    standalone: true,
    imports: [CommonModule, RouterLink, FormsModule],
    templateUrl: './pay-bill.html',
    styleUrls: ['./pay-bill.scss'],
})
export class PayBillComponent implements OnDestroy {
    private http = inject(HttpClient);
    private router = inject(Router);

    // ── Form model ───────────────────────────────────────────────────
    form: PaymentFormModel = {
        userId: '',
        cardId: '',
        billId: '',
        amount: null,
        paymentType: 'CARD',
        email: '',
    };

    paymentTypes = ['CARD', 'BANK_TRANSFER', 'WALLET'];

    // ── State signals ────────────────────────────────────────────────
    isLoading = signal(false);
    isModalOpen = signal(false);
    isConfirming = signal(false);
    paymentId = signal<string | null>(null);
    errorMessage = signal<string | null>(null);
    successMessage = signal<string | null>(null);
    otpDigits = signal<string[]>(['', '', '', '', '', '']);

    // OTP resend countdown
    resendCountdown = signal(45);
    canResend = computed(() => this.resendCountdown() === 0);
    private countdownSub: Subscription | null = null;

    // OTP input refs
    @ViewChildren('otpInput') otpInputs!: QueryList<ElementRef<HTMLInputElement>>;

    // Computed OTP string
    otpCode = computed(() => this.otpDigits().join(''));
    isOtpComplete = computed(() => this.otpCode().length === 6 && this.otpDigits().every(d => d !== ''));

    // ── Step 1: Initiate Payment ─────────────────────────────────────
    initiatePayment(): void {
        if (!this.isFormValid()) return;

        this.errorMessage.set(null);
        this.isLoading.set(true);

        const payload: InitiatePaymentCommand = {
            userId: this.form.userId.trim(),
            cardId: this.form.cardId.trim(),
            billId: this.form.billId.trim(),
            amount: Number(this.form.amount),
            paymentType: this.form.paymentType,
            email: this.form.email.trim(),
        };

        this.http.post<PaymentResponse>('/api/payments', payload).subscribe({
            next: (res) => {
                this.isLoading.set(false);
                this.paymentId.set(res.id);
                this.openModal();
            },
            error: (err: HttpErrorResponse) => {
                this.isLoading.set(false);
                this.errorMessage.set(err.error?.message ?? 'Failed to initiate payment. Please try again.');
            },
        });
    }

    // ── Step 2: Confirm OTP ──────────────────────────────────────────
    confirmPayment(): void {
        if (!this.isOtpComplete()) return;

        const id = this.paymentId();
        if (!id) return;

        this.isConfirming.set(true);
        this.errorMessage.set(null);

        const payload: CompletePaymentCommand = { otpCode: this.otpCode() };

        this.http.put<PaymentResponse>(`/api/payments/${id}/complete`, payload).subscribe({
            next: () => {
                this.isConfirming.set(false);
                this.closeModal();
                this.successMessage.set('Payment completed successfully!');
                setTimeout(() => this.router.navigate(['/bills']), 2000);
            },
            error: (err: HttpErrorResponse) => {
                this.isConfirming.set(false);
                this.errorMessage.set(err.error?.message ?? 'Invalid OTP. Please try again.');
            },
        });
    }

    // ── OTP input handling ───────────────────────────────────────────
    onOtpInput(event: Event, index: number): void {
        const input = event.target as HTMLInputElement;
        const val = input.value.replace(/\D/g, '').slice(-1);

        const digits = [...this.otpDigits()];
        digits[index] = val;
        this.otpDigits.set(digits);

        if (val && index < 5) {
            const inputs = this.otpInputs.toArray();
            inputs[index + 1]?.nativeElement.focus();
        }
    }

    onOtpKeydown(event: KeyboardEvent, index: number): void {
        if (event.key === 'Backspace') {
            const digits = [...this.otpDigits()];
            if (!digits[index] && index > 0) {
                digits[index - 1] = '';
                this.otpDigits.set(digits);
                const inputs = this.otpInputs.toArray();
                inputs[index - 1]?.nativeElement.focus();
            } else {
                digits[index] = '';
                this.otpDigits.set(digits);
            }
        }
    }

    onOtpPaste(event: ClipboardEvent): void {
        event.preventDefault();
        const pasted = event.clipboardData?.getData('text') ?? '';
        const cleaned = pasted.replace(/\D/g, '').slice(0, 6).split('');
        const digits = ['', '', '', '', '', ''];
        cleaned.forEach((d, i) => (digits[i] = d));
        this.otpDigits.set(digits);

        const inputs = this.otpInputs.toArray();
        const focusIdx = Math.min(cleaned.length, 5);
        inputs[focusIdx]?.nativeElement.focus();
    }

    // ── Modal helpers ────────────────────────────────────────────────
    openModal(): void {
        this.otpDigits.set(['', '', '', '', '', '']);
        this.errorMessage.set(null);
        this.isModalOpen.set(true);
        this.startCountdown();
        setTimeout(() => {
            this.otpInputs.toArray()[0]?.nativeElement.focus();
        }, 100);
    }

    closeModal(): void {
        this.isModalOpen.set(false);
        this.otpDigits.set(['', '', '', '', '', '']);
        this.stopCountdown();
    }

    resendCode(): void {
        if (!this.canResend()) return;
        this.otpDigits.set(['', '', '', '', '', '']);
        this.errorMessage.set(null);
        this.startCountdown();
        // In real usage, call the resend API here
        setTimeout(() => this.otpInputs.toArray()[0]?.nativeElement.focus(), 50);
    }

    private startCountdown(): void {
        this.stopCountdown();
        this.resendCountdown.set(45);
        this.countdownSub = interval(1000)
            .pipe(take(45))
            .subscribe(() => {
                this.resendCountdown.update(v => Math.max(0, v - 1));
            });
    }

    private stopCountdown(): void {
        this.countdownSub?.unsubscribe();
        this.countdownSub = null;
    }

    // ── Validation ───────────────────────────────────────────────────
    isFormValid(): boolean {
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return (
            uuidRe.test(this.form.userId) &&
            uuidRe.test(this.form.cardId) &&
            uuidRe.test(this.form.billId) &&
            Number(this.form.amount) > 0 &&
            emailRe.test(this.form.email) &&
            !!this.form.paymentType
        );
    }

    ngOnDestroy(): void {
        this.stopCountdown();
    }
}