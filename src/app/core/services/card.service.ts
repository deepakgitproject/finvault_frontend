import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ResetBusService } from './reset-bus.service';
import { GlobalUiService } from './global-ui.service';
import { Observable, EMPTY } from 'rxjs';
import { tap, catchError, finalize } from 'rxjs/operators';
import { Card, AddCardCommand, UpdateLimitRequest, RevealCardResponse } from '../models/card.models';

/**
 * DisplayCard - UI-ready card representation.
 * All components bind to this shape via cardService.cards().
 */
export interface DisplayCard {
  id: string;
  network: 'visa' | 'mastercard' | 'rupay' | 'amex';
  cardholderName: string;
  maskedNumber: string;
  fullNumber: string;
  expiryMonth: number;
  expiryYear: number;
  issuerName: string;
  creditLimit: number;
  currentBalance: number;
  usagePercent: number;
  showDetails: boolean;
}

/**
 * CardService - Single source of truth for card state.
 *
 * Architecture:
 *   - All components read from `cards()` signal. No local card arrays.
 *   - Mutations (add/delete/updateLimit/setDefault/verify) follow
 *     pessimistic (add) or optimistic (delete) strategies.
 *   - Mutation guard: loadCards() is blocked while any mutation is in flight.
 *   - Cache: 30-second window with userId verification.
 *   - ResetBus subscription: full state purge on logout.
 *
 * Signal immutability rule:
 *   Collection signals (deletingIds) must always be updated with a NEW reference.
 *   Calling .add()/.delete() on the existing Set silently breaks reactivity.
 *   Example: this._deletingIds.set(new Set([...current, id]))
 */
@Injectable({
  providedIn: 'root'
})
export class CardService {
  private readonly apiService = inject(ApiService);
  private readonly authService = inject(AuthService);
  private readonly resetBus = inject(ResetBusService);
  private readonly globalUi = inject(GlobalUiService);

  // --- Signal Store ----------------------------------------------
  private readonly _cards = signal<DisplayCard[]>([]);
  public readonly cards = this._cards.asReadonly();

  // --- Loading State --------------------------------------------
  private readonly _isLoading = signal(false);
  public readonly isLoading = this._isLoading.asReadonly();

  // --- Add Lock (pessimistic) ------------------------------------
  private readonly _isAdding = signal(false);
  public readonly isAdding = this._isAdding.asReadonly();

  // --- Delete Locks (optimistic, multi-ID) -----------------------
  //    IMMUTABILITY RULE: Always assign a new Set reference!
  private readonly _deletingIds = signal<Set<string>>(new Set());
  public readonly deletingIds = this._deletingIds.asReadonly();

  // --- Mutation in-flight tracking (for mutation guard) ----------
  private readonly _mutationsInFlight = signal(0);
  public readonly hasMutationsInFlight = computed(() => this._mutationsInFlight() > 0);

  // --- Mutation versioning (for rollback race prevention) --------
  //    Plain class field - no UI reactivity needed.
  private mutationVersion = 0;

  // --- Security-aware cache --------------------------------------
  private cacheTimestamp = 0;
  private cacheUserId = '';
  private static readonly CACHE_DURATION_MS = 30_000; // 30 seconds

  // --- Deferred refresh flag -------------------------------------
  private deferredRefreshNeeded = false;

  constructor() {
    // Subscribe to ResetBus - purge all state on logout
    this.resetBus.reset$.subscribe(() => {
      this.purgeState();
    });
  }

  // --------------------------------------------------------------*
  // PUBLIC API
  // --------------------------------------------------------------*

  /**
   * Refresh cards from the server.
   * @param force - If true, bypasses the 30-second cache window.
   *
   * MUTATION GUARD: This method is blocked while any mutation is in flight.
   * After a mutation completes, it automatically calls this method.
   */
  refreshCards(force = false): void {
    // Mutation guard - defer the refresh until all mutations complete
    if (this._mutationsInFlight() > 0) {
      this.deferredRefreshNeeded = true;
      return;
    }

    const userId = this.authService.getUserId();
    if (!userId) {
      console.warn('[CardService] Cannot refresh cards - no userId available.');
      this._cards.set([]);
      return;
    }

    // Cache check
    if (!force) {
      const now = Date.now();
      const cacheValid =
        this.cacheUserId === userId &&
        (now - this.cacheTimestamp) < CardService.CACHE_DURATION_MS;
      if (cacheValid && this._cards().length > 0) {
        return; // Serve cached data
      }
    }

    this._isLoading.set(true);
    this.apiService.get<any>('/api/cards').subscribe({
      next: (res) => {
        // Double-check mutation guard - a mutation may have started while fetch was in flight
        if (this._mutationsInFlight() > 0) {
          this.deferredRefreshNeeded = true;
          this._isLoading.set(false);
          return;
        }

        const data = Array.isArray(res) ? res : (res?.data ?? []);
        this._cards.set(data.map((c: any) => this.mapApiCard(c)));
        this.cacheTimestamp = Date.now();
        this.cacheUserId = userId;
        this._isLoading.set(false);
      },
      error: () => {
        // Don't wipe existing cards on fetch failure - show stale data
        this._isLoading.set(false);
      }
    });
  }

  /**
   * Pessimistic add: Wait for server response before updating the signal.
   * If the server returns the full card, use it. Otherwise, fetch it.
   */
  addCard(card: AddCardCommand): Observable<any> {
    this._isAdding.set(true);
    this.incrementMutation();

    return this.apiService.post<any>('/api/cards', card).pipe(
      tap((res) => {
        const returnedCard = res?.data ?? res;

        if (returnedCard?.id) {
          // Server returned the enriched card - add directly
          this._cards.update(list => [...list, this.mapApiCard(returnedCard)]);
          this.invalidateCache();
        } else {
          // Server only returned success/ID - force refresh to get enriched data
          this.invalidateCache();
          this.deferredRefreshNeeded = true;
        }

        this.globalUi.success('Card linked successfully!');
      }),
      catchError((err) => {
        // No signal mutation on failure - pessimistic strategy
        this.globalUi.error('Failed to link card. Please try again.');
        return throwSafe(err);
      }),
      finalize(() => {
        this._isAdding.set(false);
        this.decrementMutation();
      })
    );
  }

  /**
   * Optimistic delete:
   *   1. Add to deletingIds (LOCK FIRST)
   *   2. Capture mutationVersion
   *   3. Optimistic remove from signal
   *   4. Call API
   *   5. On success: remove from deletingIds + refresh
   *   6. On failure: check version match -> rollback -> error toast
   */
  deleteCard(id: string): Observable<any> {
    // 1. Lock first - prevents rapid double-click race
    const currentIds = this._deletingIds();
    this._deletingIds.set(new Set([...currentIds, id]));
    this.incrementMutation();

    // 2. Capture version for rollback safety
    const capturedVersion = this.mutationVersion;

    // 3. Optimistic remove - save snapshot for rollback
    const snapshot = this._cards();
    this._cards.update(list => list.filter(c => c.id !== id));

    // 4. Call API
    return this.apiService.delete<any>(`/api/cards/${id}`).pipe(
      tap(() => {
        this.invalidateCache();
        this.globalUi.success('Card deleted successfully.');
      }),
      catchError((err) => {
        // 6. Rollback - only if version still matches (no newer mutation overwrote)
        if (this.mutationVersion === capturedVersion) {
          this._cards.set(snapshot);
        }
        this.globalUi.error('Failed to delete card.');
        return throwSafe(err);
      }),
      finalize(() => {
        // Remove from deletingIds (immutable update!)
        const updated = this._deletingIds();
        const next = new Set(updated);
        next.delete(id);
        this._deletingIds.set(next);
        this.decrementMutation();
      })
    );
  }

  setDefault(id: string): Observable<any> {
    this.incrementMutation();
    return this.apiService.put<any>(`/api/cards/${id}/default`, {}).pipe(
      tap(() => {
        this.invalidateCache();
        this.globalUi.success('Default card updated.');
      }),
      catchError((err) => {
        this.globalUi.error('Failed to set default card.');
        return throwSafe(err);
      }),
      finalize(() => this.decrementMutation())
    );
  }

  verifyCard(id: string): Observable<any> {
    this.incrementMutation();
    return this.apiService.put<any>(`/api/cards/${id}/verify`, {}).pipe(
      tap(() => {
        this.invalidateCache();
        this.globalUi.success('Card verified.');
      }),
      catchError((err) => {
        this.globalUi.error('Failed to verify card.');
        return throwSafe(err);
      }),
      finalize(() => this.decrementMutation())
    );
  }

  updateLimit(id: string, request: UpdateLimitRequest): Observable<any> {
    this.incrementMutation();
    return this.apiService.put<any>(`/api/cards/${id}/limit`, request).pipe(
      tap(() => {
        // Update local signal optimistically for limit changes
        this._cards.update(list =>
          list.map(c => c.id === id
            ? {
                ...c,
                creditLimit: request.newLimit,
                usagePercent: request.newLimit > 0 ? Math.round((c.currentBalance / request.newLimit) * 100) : 0
              }
            : c
          )
        );
        this.invalidateCache();
        this.globalUi.success('Credit limit updated.');
      }),
      catchError((err) => {
        this.globalUi.error('Failed to update credit limit.');
        return throwSafe(err);
      }),
      finalize(() => this.decrementMutation())
    );
  }

  getUtilization(): Observable<any> {
    return this.apiService.get<any>('/api/cards/utilization');
  }

  getCardById(id: string): Observable<any> {
    return this.apiService.get<any>(`/api/cards/${id}`);
  }

  /**
   * REVEAL: Call backend for real decrypted card data.
   */
  revealCard(cardId: string): Observable<RevealCardResponse> {
    return this.apiService.get<any>(`/api/cards/${cardId}/reveal`).pipe(
      tap((res) => {
        const data = res?.data ?? res;
        // Update local signal to show details
        this._cards.update(list =>
          list.map(c => c.id === cardId
            ? { ...c, fullNumber: data.cardNumber, showDetails: true }
            : c
          )
        );
      }),
      catchError((err) => {
        this.globalUi.error('Failed to decrypt card details.');
        return throwSafe(err);
      })
    );
  }

  /**
   * Toggle card detail visibility.
   * Local-only UI state - no API call needed.
   */
  toggleCardDetails(index: number): void {
    this._cards.update(list => {
      const updated = [...list];
      if (updated[index]) {
        updated[index] = { ...updated[index], showDetails: !updated[index].showDetails };
      }
      return updated;
    });
  }

  // --------------------------------------------------------------*
  // PRIVATE HELPERS
  // --------------------------------------------------------------*

  private mapApiCard(c: any): DisplayCard {
    const masked = c.maskedNumber || '****0000';
    const last4 = masked.replace(/[^0-9]/g, '').slice(-4);
    const network = this.guessNetwork(masked);
    const limit = c.creditLimit || 100000;
    const balance = c.currentBalance || 0;

    return {
      id: c.id || '',
      network,
      cardholderName: (c.cardholderName || 'CARD HOLDER').toUpperCase(),
      maskedNumber: c.maskedNumber || `****${last4}`,
      fullNumber: `${this.networkPrefix(network)}XX XXXX XXXX ${last4}`,
      expiryMonth: c.expiryMonth || 12,
      expiryYear: c.expiryYear || 2028,
      issuerName: c.issuerName || 'Bank',
      creditLimit: limit,
      currentBalance: balance,
      usagePercent: limit > 0 ? Math.round((balance / limit) * 100) : 0,
      showDetails: false
    };
  }

  private guessNetwork(masked: string): DisplayCard['network'] {
    const digits = masked?.replace(/[^0-9]/g, '') || '';
    const first = digits.charAt(0) || '4';
    if (first === '4') return 'visa';
    if (first === '5') return 'mastercard';
    if (first === '6') return 'rupay';
    if (first === '3') return 'amex';
    return 'visa';
  }

  private networkPrefix(n: DisplayCard['network']): string {
    switch (n) {
      case 'visa': return '4XXX';
      case 'mastercard': return '5XXX';
      case 'rupay': return '6XXX';
      case 'amex': return '3XXX';
    }
  }

  private incrementMutation(): void {
    this.mutationVersion++;
    this._mutationsInFlight.update(n => n + 1);
  }

  private decrementMutation(): void {
    this._mutationsInFlight.update(n => Math.max(0, n - 1));

    // After the last mutation completes, execute any deferred refresh
    if (this._mutationsInFlight() === 0 && this.deferredRefreshNeeded) {
      this.deferredRefreshNeeded = false;
      this.refreshCards(true);
    }
  }

  private invalidateCache(): void {
    this.cacheTimestamp = 0;
  }

  /**
   * Full state purge - called by ResetBus on logout.
   * Clears cards, locks, cache, and version counter.
   */
  private purgeState(): void {
    this._cards.set([]);
    this._isLoading.set(false);
    this._isAdding.set(false);
    this._deletingIds.set(new Set());
    this._mutationsInFlight.set(0);
    this.mutationVersion = 0;
    this.cacheTimestamp = 0;
    this.cacheUserId = '';
    this.deferredRefreshNeeded = false;
  }
}

/** Safe error rethrow helper */
function throwSafe(err: any): Observable<never> {
  return new Observable(subscriber => subscriber.error(err));
}

