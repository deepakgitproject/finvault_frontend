import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap, timeout, catchError, throwError, map, of } from 'rxjs';
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
   * If NO bills exist at all, auto-generate one and return its ID.
   */
  private fetchBillIdForCard(userId: string, cardId: string, amount: number): Observable<string> {
    return this.http.get<any>(`${this.apiUrl}/api/billing/bills/user/${userId}`).pipe(
      switchMap(res => {
        const bills = Array.isArray(res) ? res : (res?.data ?? []);
        console.log('[PaymentService] Bills fetched for user:', bills.length);

        // Case-insensitive GUID matching
        const normalize = (id: string) => (id || '').toLowerCase().replace(/-/g, '');
        const normalizedCardId = normalize(cardId);

        // Try to find a bill matching this cardId
        const cardBills = bills.filter((b: any) => normalize(b.cardId) === normalizedCardId);
        // Prefer unpaid/pending bills
        const unpaid = cardBills.find((b: any) =>
          b.status?.toLowerCase() !== 'paid'
        );
        const fallback = cardBills[0] || bills[0];
        const bill = unpaid || fallback;

        if (bill?.id) {
          console.log('[PaymentService] Using existing billId:', bill.id, 'status:', bill.status);
          return of(bill.id as string);
        }

        // No bills found -> auto-generate one
        console.log('[PaymentService] No bills found. Auto-generating bill for card:', cardId);
        return this.autoGenerateBill(userId, cardId, amount);
      }),
      timeout(8000)
    );
  }

  /**
   * Auto-generate a bill for the card so the payment flow can proceed.
   * This creates a billing cycle entry and returns the new bill's ID.
   */
  private autoGenerateBill(userId: string, cardId: string, amount: number): Observable<string> {
    const now = new Date();
    const dueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    const payload = {
      UserId: userId,
      CardId: cardId,
      TotalAmount: amount,
      MinimumDue: Math.max(100, Math.round(amount * 0.05)),
      DueDate: dueDate.toISOString(),
      BillingMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    };

    console.log('[PaymentService] Auto-generating bill with payload:', payload);

    return this.http.post<any>(`${this.apiUrl}/api/billing/bills`, payload).pipe(
      map(res => {
        const billData = res?.data ?? res;
        const billId = billData?.id || billData?.Id;
        if (!billId) {
          throw new Error('Bill was created but no ID was returned.');
        }
        console.log('[PaymentService] Auto-generated billId:', billId);
        return billId;
      }),
      catchError(err => {
        console.error('[PaymentService] Failed to auto-generate bill:', err);
        return throwError(() => new Error('Could not generate a billing cycle. Please try again.'));
      })
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
   *   1. Fetch (or auto-create) a valid billId for the card
   *   2. Initiate payment with the real billId
   *   3. Backend completes payment in the POST step itself
   */
  makePayment(cardId: string, amount: number, paymentType: string = 'card', billId: string | null = null): Observable<any> {
    console.log('[PaymentService] makePayment called with:', { cardId, amount, paymentType, billId });
    const userId = this.authService.getUserId() || '';

    // If billId is provided, use it directly; otherwise fetch/create one
    const billId$ = billId
      ? new Observable<string>(sub => { sub.next(billId); sub.complete(); })
      : this.fetchBillIdForCard(userId, cardId, amount);

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
