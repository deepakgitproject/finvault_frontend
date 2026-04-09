import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-payment-success',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './payment-success.component.html',
  styleUrls: ['./payment-success.component.scss']
})
export class PaymentSuccessComponent {
  @Input() amount: number = 0;
  @Input() cardLastFour: string = '';
  @Input() issuerName: string = '';
  @Input() paymentResponse: any;
  @Input() oldOutstanding: number = 0;
  @Input() oldAvailableCredit: number = 0;

  @Output() done = new EventEmitter<void>();

  get newOutstanding() {
    return Math.max(0, this.oldOutstanding - this.amount);
  }

  get newAvailableCredit() {
    return this.oldAvailableCredit + this.amount;
  }

  get transactionId() {
    const id = this.paymentResponse?.id || this.paymentResponse?.data?.id || 'TXN-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    return id;
  }

  get transactionTime() {
    const t = this.paymentResponse?.createdAt || this.paymentResponse?.data?.createdAt;
    return t ? new Date(t).toLocaleString('en-IN') : new Date().toLocaleString('en-IN');
  }

  copyTxId() {
    navigator.clipboard.writeText(this.transactionId);
  }
}
