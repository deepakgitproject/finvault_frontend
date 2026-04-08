import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { GlobalUiService } from './global-ui.service';
import { CardService } from './card.service';

export interface Transaction {
  id: string;
  paymentId: string;
  cardId: string;
  amount: number;
  type: 'Payment' | 'Reversal' | string;
  category: string;
  description: string;
  createdAt: string;
  // UI enrichment
  categoryLabel?: string;
  categoryIcon?: string;
  categoryColor?: string;
  cardDisplay?: string;
  riskBadge?: { score: number; label: string; colorClass: string };
  isLoadingRisk?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class TransactionService {
  private readonly api = inject(ApiService);
  private readonly ui = inject(GlobalUiService);
  private readonly cardService = inject(CardService);

  private readonly _transactions = signal<Transaction[]>([]);
  public readonly transactions = this._transactions.asReadonly();

  private readonly _isSyncing = signal(false);
  public readonly isSyncing = this._isSyncing.asReadonly();

  /**
   * Fetch transactions with optional card filtering.
   * Uses the optimized backend endpoint: /api/transactions?cardId={id}
   */
  getTransactions(cardId?: string): Observable<Transaction[]> {
    let url = '/api/transactions';
    if (cardId) {
      url += `?cardId=${cardId}`;
    }

    return this.api.get<any>(url).pipe(
      map(res => {
        const data = res?.data ?? res;
        if (!Array.isArray(data)) return [];
        
        return data.map(t => this.enrichTransaction(t))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }),
      tap(txns => {
        if (!cardId) {
          this._transactions.set(txns);
        }
      }),
      catchError(err => {
        console.error('Failed to fetch transactions', err);
        return of([]);
      })
    );
  }

  /**
   * Trigger the idempotnent sync process for legacy data.
   */
  syncTransactions(): Observable<any> {
    this._isSyncing.set(true);
    this.ui.info('Refreshing your financial history...');

    return this.api.post<any>('/api/transactions/sync', {}).pipe(
      tap(() => {
        this.ui.success('Transaction history synchronized.');
        this.getTransactions().subscribe(); // Refresh global list
      }),
      catchError(err => {
        this.ui.error('Failed to sync transactions.');
        return of(null);
      }),
      tap(() => this._isSyncing.set(false))
    );
  }

  /**
   * Centralized enrichment logic for iconography and labels.
   */
  enrichTransaction(txn: any): Transaction {
    const category = (txn.category || '').toLowerCase();
    const description = (txn.description || '').toLowerCase();
    
    const enriched: Transaction = {
      ...txn,
      categoryLabel: txn.category || txn.type || 'Payment',
      categoryIcon: 'payments',
      categoryColor: 'bg-indigo'
    };

    // Map Card Info if available
    const rawCardId = txn.cardId || txn.CardId || txn.CardID;
    if (rawCardId) {
      const tid = String(rawCardId).toLowerCase().replace(/-/g, '');
      const card = this.cardService.cards().find(c => 
        (c.id || '').toLowerCase().replace(/-/g, '') === tid
      );
      if (card) {
        enriched.cardDisplay = `${card.issuerName} •••• ${card.maskedNumber.slice(-4)}`;
      }
    }

    // Reversal Special Case
    if (txn.type === 'Reversal') {
      enriched.categoryLabel = 'Refund';
      enriched.categoryIcon = 'undo';
      enriched.categoryColor = 'bg-green';
      return enriched;
    }

    // Biller/External Category Logic
    if (category.includes('elect')) { 
      enriched.categoryIcon = 'bolt'; 
      enriched.categoryColor = 'bg-orange'; 
    }
    else if (category.includes('water')) { 
      enriched.categoryIcon = 'water_drop'; 
      enriched.categoryColor = 'bg-blue'; 
    }
    else if (category.includes('gas')) { 
      enriched.categoryIcon = 'local_gas_station'; 
      enriched.categoryColor = 'bg-red'; 
    }
    else if (category.includes('internet')) { 
      enriched.categoryIcon = 'wifi'; 
      enriched.categoryColor = 'bg-cyan'; 
    }
    else if (category.includes('mobile')) { 
      enriched.categoryIcon = 'phone_iphone'; 
      enriched.categoryColor = 'bg-purple'; 
    }
    else if (category.includes('dth')) { 
      enriched.categoryIcon = 'settings_input_antenna'; 
      enriched.categoryColor = 'bg-pink'; 
    }
    else if (category.includes('card bill') || description.includes('card bill')) { 
      enriched.categoryLabel = 'Card Bill Payment';
      enriched.categoryIcon = 'account_balance'; 
      enriched.categoryColor = 'bg-indigo'; 
    }
    else if (category.includes('utility') || description.includes('bill')) {
      enriched.categoryIcon = 'receipt_long';
      enriched.categoryColor = 'bg-amber';
    }

    return enriched;
  }

  /**
   * Fetch risk score for a single transaction.
   * Note: Backend optimized this, but we keep it for per-item detail if needed.
   */
  getRiskScore(paymentId: string): Observable<any> {
    return this.api.get<any>(`/api/transactions/risk/${paymentId}`).pipe(
      map(res => res?.data ?? res),
      catchError(() => of(null))
    );
  }
}
