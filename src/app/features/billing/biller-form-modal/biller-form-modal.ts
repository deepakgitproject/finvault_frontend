import { Component, Input, Output, EventEmitter, OnInit, signal, computed, inject, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardService } from '../../../core/services/card.service';
import { AuthService } from '../../../core/services/auth.service';
import { ExternalBillService } from '../../../core/services/external-bill.service';

@Component({
    selector: 'app-biller-form-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './biller-form-modal.html',
    styleUrls: ['./biller-form-modal.scss']
})
export class BillerFormModalComponent implements OnInit {
    @Input() billerName: string = '';
    @Input() billerCategory: string = '';
    @Output() closed = new EventEmitter<void>();
    @Output() paymentSuccess = new EventEmitter<void>();

    private cardService = inject(CardService);
    private authService = inject(AuthService);
    private externalBillService = inject(ExternalBillService);

    step = signal<'form' | 'otp' | 'success'>('form');
    isLoading = signal(false);
    errorMsg = signal<string | null>(null);
    billId = signal<string | null>(null);

    // Form fields
    selectedCardId = signal<string>('');
    billNumber = signal<string>('');
    amount = signal<number | null>(null);

    // Auth details
    userId = '';
    email = '';

    // OTP
    otpDigits = signal<string[]>(['', '', '', '', '', '']);
    @ViewChildren('otpInput') otpInputs!: QueryList<ElementRef<HTMLInputElement>>;

    otpCode = computed(() => this.otpDigits().join(''));
    isOtpComplete = computed(() => this.otpCode().length === 6 && this.otpDigits().every(d => d !== ''));

    cards = computed(() => this.cardService.cards() || []);

    ngOnInit() {
        this.cardService.refreshCards();
        this.userId = this.authService.getUserId() || '';
        this.autoFillEmailFromToken();
        // Best fallback: email already in memory from login session
        if (!this.email && this.authService.currentUser()?.email) {
            this.email = this.authService.currentUser()!.email;
        }
        // Last resort: fetch profile from API
        if (!this.email) {
            this.authService.loadCurrentUser().subscribe({
                next: () => {
                    if (!this.email && this.authService.currentUser()?.email) {
                        this.email = this.authService.currentUser()!.email;
                    }
                }
            });
        }
    }

    private autoFillEmailFromToken(): void {
        try {
            const token = localStorage.getItem('fv_access_token');
            if (!token) return;
            const payload = JSON.parse(atob(token.split('.')[1]));
            
            this.email =
                payload['email'] ||
                payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ||
                payload['email_address'] ||
                payload['preferred_username'] ||
                '';

            if (!this.email) {
                console.warn('[BillerModal] Could not extract email from JWT. Claims available:', Object.keys(payload));
            }
        } catch {
            /* ignore malformed token */
        }
    }

    getCategoryIcon(cat: string): string {
        switch (cat) {
            case 'ELECTRICITY': return 'bolt';
            case 'WATER': return 'water_drop';
            case 'INTERNET': return 'wifi';
            case 'RECHARGE': return 'phone_iphone';
            case 'RENT': return 'apartment';
            case 'GAS': return 'local_gas_station';
            case 'INSURANCE': return 'health_and_safety';
            case 'METRO': return 'train';
            default: return 'receipt_long';
        }
    }

    getCategoryColor(cat: string): string {
        switch (cat) {
            case 'ELECTRICITY': return '#EAB308';
            case 'WATER': return '#3B82F6';
            case 'INTERNET': return '#F97316';
            case 'RECHARGE': return '#EC4899';
            case 'RENT': return '#A855F7';
            case 'GAS': return '#14B8A6';
            case 'INSURANCE': return '#6B7280';
            case 'METRO': return '#EF4444';
            default: return '#6B6EF9';
        }
    }

    getBillNumberLabel(cat: string): string {
        switch (cat) {
            case 'ELECTRICITY': return 'Consumer Number';
            case 'RENT': return 'Lease/Agreement Number';
            case 'INTERNET': return 'Account / Customer ID';
            case 'METRO': return 'Metro Card Number';
            case 'WATER': return 'Connection ID';
            case 'GAS': return 'BP Number';
            case 'RECHARGE': return 'Mobile Number';
            case 'INSURANCE': return 'Policy Number';
            default: return 'Bill / Reference Number';
        }
    }

    /** Maps frontend category constants to backend-accepted values.
     *  Backend enum: Electricity | Water | Gas | Internet | Mobile | DTH | Other
     */
    private mapCategory(cat: string): string {
        switch (cat) {
            case 'ELECTRICITY': return 'Electricity';
            case 'WATER':       return 'Water';
            case 'GAS':         return 'Gas';
            case 'INTERNET':    return 'Internet';
            case 'RECHARGE':    return 'Mobile';
            case 'RENT':        return 'Other';
            case 'INSURANCE':   return 'Other';
            case 'METRO':       return 'Other';
            default:            return 'Other';
        }
    }

    isFormValid(): boolean {
        const amt = this.amount();

        if (!this.email) {
            console.warn('[BillerModal] Email not available from JWT. Backend may extract it from token.');
        }

        return !!this.selectedCardId() && !!this.billNumber().trim() && amt !== null && amt >= 1;
    }

    onBackdropClick() {
        if (this.step() !== 'otp') {
            this.closed.emit();
        }
    }

    submitForm() {
        this.errorMsg.set(null);
        if (!this.isFormValid()) return;
        this.isLoading.set(true);

        const payload = {
            CardId: this.selectedCardId(),
            Email: this.email,
            BillerName: this.billerName,
            BillerCategory: this.mapCategory(this.billerCategory),
            BillNumber: this.billNumber(),
            Amount: Number(this.amount())
        };

        this.externalBillService.payBill(payload).subscribe({
            next: (res) => {
                this.isLoading.set(false);
                // ApiResponse<T> is camelCase: { success, message, data: { id, ... }, errors }
                const billId = res?.['data']?.id || res?.['data']?.['Id'] || res?.id;
                if (billId) {
                    this.billId.set(billId);
                    this.step.set('otp');
                    setTimeout(() => {
                        this.otpInputs.toArray()[0]?.nativeElement.focus();
                    }, 100);
                } else {
                    this.errorMsg.set('Server error: no payment ID returned.');
                }
            },
            error: (err) => {
                this.isLoading.set(false);
                // ApiResponse<T> camelCase: message, errors[]
                const errMsg =
                    err.error?.message ||
                    err.error?.['Message'] ||
                    (err.error?.errors?.length ? err.error.errors[0] : null) ||
                    'Failed to initiate payment.';
                this.errorMsg.set(errMsg);
            }
        });
    }

    resetToForm() {
        this.step.set('form');
        this.errorMsg.set(null);
        this.otpDigits.set(['', '', '', '', '', '']);
    }

    // -- OTP Handlers copied from pay-bill.ts -- \\
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

    verifyOtp() {
        if (!this.isOtpComplete()) return;
        const id = this.billId();
        if (!id) return;

        this.isLoading.set(true);
        this.errorMsg.set(null);

        this.externalBillService.verifyOtp(id, this.otpCode()).subscribe({
            next: () => {
                this.isLoading.set(false);
                this.step.set('success');
                // Delay refresh so backend has time to commit balance update
                setTimeout(() => this.cardService.refreshCards(true), 1000);
                // Do NOT emit paymentSuccess here — let success screen render first
            },
            error: (err) => {
                this.isLoading.set(false);
                this.errorMsg.set(err.error?.message || 'Invalid or expired OTP. Please try again.');
            }
        });
    }

    /** trackBy for OTP *ngFor — prevents DOM recreation on every signal update */
    trackByOtpIndex(index: number): number {
        return index;
    }

    closeSuccess() {
        this.paymentSuccess.emit(); // notify parent (refresh history, etc.)
        this.closed.emit();         // close the modal
    }
}
