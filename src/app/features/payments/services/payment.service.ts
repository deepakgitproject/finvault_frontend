import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap, timeout, catchError, throwError, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = environment.apiUrl;

  /**
   * Fetch the first unpaid/pending bill for the given card.
   * Falls back to the first bill of any status if no pending bills exist.
   */
  private fetchBillIdForCard(userId: string, cardId: string): Observable<string> {
    return this.http.get<any>(`${this.apiUrl}/api/billing/bills/user/${userId}`).pipe(
      map(res => {
        const bills = Array.isArray(res) ? res : (res?.data ?? []);
        console.log('[PaymentService] Bills fetched for user:', bills.length);

        // Try to find a bill matching this cardId
        const cardBills = bills.filter((b: any) => b.cardId === cardId);
        // Prefer unpaid/pending bills
        const unpaid = cardBills.find((b: any) =>
          b.status?.toLowerCase() !== 'paid'
        );
        const fallback = cardBills[0] || bills[0];
        const bill = unpaid || fallback;

        if (!bill?.id) {
          console.warn('[PaymentService] No bill found for card:', cardId);
          throw new Error('No bill found for this card. Please ensure a billing cycle exists.');
        }

        console.log('[PaymentService] Using billId:', bill.id, 'status:', bill.status);
        return bill.id;
      }),
      timeout(5000)
    );
  }

  initiatePayment(cardId: string, amount: number, paymentType: string = 'card', billId: string = ''): Observable<any> {
    const userId = this.authService.getUserId();

    const payload = {
      userId: userId,
      cardId: cardId,
      billId: billId,
      amount: amount,
      paymentType: paymentType
    };

    console.log('[PaymentService] Initiating payment with payload:', payload);

    return this.http.post<any>(`${this.apiUrl}/api/payments`, payload).pipe(
      timeout(5000),
      catchError(err => {
        console.error('[PaymentService] initiatePayment ERROR:', err);
        return throwError(() => err);
      })
    );
  }

  completePayment(paymentId: string): Observable<any> {
    if (!paymentId) {
      return throwError(() => new Error("Invalid Payment ID"));
    }
    console.log('[PaymentService] Completing payment ID:', paymentId);
    return this.http.put<any>(`${this.apiUrl}/api/payments/${paymentId}/complete`, {}).pipe(
      timeout(5000),
      catchError(err => {
        console.error('[PaymentService] completePayment ERROR:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Full payment flow:
   *   1. Fetch a valid billId for the card
   *   2. Initiate payment with the real billId
   *   3. Complete the payment
   */
  makePayment(cardId: string, amount: number, paymentType: string = 'card', billId: string | null = null): Observable<any> {
    console.log('[PaymentService] makePayment called with:', { cardId, amount, paymentType, billId });
    const userId = this.authService.getUserId() || '';

    // If billId is provided, use it directly; otherwise fetch one
    const billId$ = billId
      ? new Observable<string>(sub => { sub.next(billId); sub.complete(); })
      : this.fetchBillIdForCard(userId, cardId);

    return billId$.pipe(
      switchMap(resolvedBillId => {
        return this.initiatePayment(cardId, amount, paymentType, resolvedBillId);
      }),
      map(res => {
        console.log('[PaymentService] initiatePayment response:', res);
        // Backend completes payment in the POST step itself.
        // No need to call PUT /complete separately.
        return res?.data || res;
      }),
      timeout(10000),
      catchError(err => {
        console.error('[PaymentService] Payment flow error:', err);
        return throwError(() => err);
      })
    );
  }
}
