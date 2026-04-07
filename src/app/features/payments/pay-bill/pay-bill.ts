import {
    Component,
    OnInit,
    signal,
    computed,
    ViewChildren,
    QueryList,
    ElementRef,
    inject,
    OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Subscription, interval } from 'rxjs';
import { take } from 'rxjs/operators';
import { SidebarComponent } from '../../../shared/components/sidebar/sidebar.component';
import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle.component';

// -- Swagger-aligned types --------------------------------------------

export interface InitiatePaymentCommand {
    userId?: string;
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

export interface RecentTransaction {
    id: string;
    amount: number;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    date: string;
    description: string;
    paymentType: string;
}

export interface PaymentFormModel {
    userId?: string;
    cardId: string;
    billId: string;
    amount: number | null;
    paymentType: string;
    email: string;
}

// -- Component --------------------------------------------------------

@Component({
    selector: 'app-pay-bill',
    standalone: true,
    imports: [CommonModule, RouterLink, FormsModule, SidebarComponent, ThemeToggleComponent],
    templateUrl: './pay-bill.html',
    styleUrls: ['./pay-bill.scss'],
})
export class PayBillComponent implements OnInit, OnDestroy {
    private http = inject(HttpClient);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    // -- Form model ---------------------------------------------------
    form: PaymentFormModel = {
        userId: '',
        cardId: '',
        billId: '',
        amount: null,
        paymentType: 'Full',
        email: '',
    };

    paymentTypes = ['Full', 'Partial', 'Scheduled'];

    // -- State signals ------------------------------------------------
    isLoading = signal(false);
    isModalOpen = signal(false);
    isConfirming = signal(false);
    paymentId = signal<string | null>(null);
    errorMessage = signal<string | null>(null);
    successMessage = signal<string | null>(null);
    recentTransactions = signal<RecentTransaction[]>([]);
    isHistoryLoading = signal(false);
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

    ngOnInit(): void {
        this.autoFillFromToken();
        this.handleQueryParams();
        this.fetchRecentTransactions();
    }

    private handleQueryParams(): void {
        this.route.queryParams.subscribe(params => {
            if (params['billId']) this.form.billId = params['billId'];
            if (params['cardId']) this.form.cardId = params['cardId'];
            if (params['amount']) this.form.amount = Number(params['amount']);
            if (params['paymentType']) this.form.paymentType = params['paymentType'];
        });
    }

    // -- Auto-fill userId and email from JWT --------------------------
    private autoFillFromToken(): void {
        try {
            const token = localStorage.getItem('fv_access_token');
            if (!token) return;
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.sub) this.form.userId = payload.sub;
            if (payload.email) this.form.email = payload.email;
        } catch { /* ignore */ }
    }

    // -- Pre-fill helper ----------------------------------------------
    prefillFromTransaction(tx: RecentTransaction): void {
        this.form.amount = tx.amount;
        this.form.paymentType = tx.paymentType;
        // Scroll to form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // -- Step 1: Initiate Payment -------------------------------------
    initiatePayment(): void {
        if (!this.isFormValid()) return;

        this.errorMessage.set(null);
        this.isLoading.set(true);

        const payload: InitiatePaymentCommand = {
            userId: this.getUserIdFromToken() || '00000000-0000-0000-0000-000000000000',
            cardId: this.form.cardId.trim(),
            billId: this.form.billId.trim(),
            amount: Number(this.form.amount),
            paymentType: this.form.paymentType,
            email: this.form.email.trim(),
        };

        this.http.post<any>('/api/payments/initiate', payload).subscribe({
            next: (res) => {
                this.isLoading.set(false);
                const paymentId = res?.data?.id || res?.id;
                this.paymentId.set(paymentId);
                this.openModal();
            },
            error: (err: HttpErrorResponse) => {
                this.isLoading.set(false);
                this.errorMessage.set(err.error?.message ?? 'Failed to initiate payment. Please try again.');
            },
        });
    }

    // -- Step 2: Confirm OTP ------------------------------------------
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
                this.fetchRecentTransactions(); // Refresh the list
                setTimeout(() => this.successMessage.set(null), 4000);
            },
            error: (err: HttpErrorResponse) => {
                this.isConfirming.set(false);
                this.errorMessage.set(err.error?.message ?? 'Invalid OTP. Please try again.');
            },
        });
    }

    reversePayment(id: string): void {
        if (!id) return;
        this.isLoading.set(true);
        this.http.put(`/api/payments/${id}/reverse`, {}).subscribe({
            next: () => {
                this.isLoading.set(false);
                this.successMessage.set('Payment reversed successfully!');
                this.fetchRecentTransactions();
                setTimeout(() => this.successMessage.set(null), 3000);
            },
            error: (err) => {
                this.isLoading.set(false);
                this.errorMessage.set(err.error?.message ?? 'Failed to reverse payment.');
            }
        });
    }

    // -- OTP input handling -------------------------------------------
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

    // -- Modal helpers ------------------------------------------------
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

    // -- Validation ---------------------------------------------------
    isFormValid(): boolean {
        const isValidId = (id: string) => !!id && id.length >= 1;
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+?/;
        return (
            isValidId(this.form.cardId) &&
            isValidId(this.form.billId) &&
            Number(this.form.amount) > 0 &&
            emailRe.test(this.form.email) &&
            !!this.form.paymentType
        );
    }

    // -- Recent Transactions ------------------------------------------
    fetchRecentTransactions(): void {
        this.isHistoryLoading.set(true);

        // Use GET /api/payments (lists all payments for the authenticated user)
        this.http.get<any>('/api/payments').subscribe({
            next: (res) => {
                const payments: PaymentResponse[] = Array.isArray(res) ? res : (res?.data ?? []);
                this.recentTransactions.set(payments.map(p => ({
                    id: p.id,
                    amount: p.amount,
                    status: p.status,
                    date: p.createdAt,
                    description: `Payment for Bill ${p.billId ? '#' + p.billId.slice(-4) : 'General'}`,
                    paymentType: p.paymentType
                })).slice(0, 5));
                this.isHistoryLoading.set(false);
            },
            error: () => {
                this.recentTransactions.set([]);
                this.isHistoryLoading.set(false);
            }
        });
    }

    private setDemoTransactions(): void {
        this.recentTransactions.set([
            { id: '1', amount: 345.00, status: 'COMPLETED', date: new Date().toISOString(), description: 'Rent Payment: October', paymentType: 'BANK_TRANSFER' },
            { id: '2', amount: 89.99, status: 'COMPLETED', date: new Date(Date.now() - 86400000).toISOString(), description: 'Fiber Optic Pro', paymentType: 'CARD' },
            { id: '3', amount: 1240.25, status: 'FAILED', date: new Date(Date.now() - 172800000).toISOString(), description: 'Sapphire Reserve', paymentType: 'CARD' },
            { id: '4', amount: 24.50, status: 'COMPLETED', date: new Date(Date.now() - 259200000).toISOString(), description: 'Metro Recharge', paymentType: 'WALLET' }
        ]);
    }

    private getUserIdFromToken(): string | null {
        try {
            const token = localStorage.getItem('fv_access_token');
            if (!token) return null;
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.sub ?? null;
        } catch {
            return null;
        }
    }

    ngOnDestroy(): void {
        this.stopCountdown();
    }
}

