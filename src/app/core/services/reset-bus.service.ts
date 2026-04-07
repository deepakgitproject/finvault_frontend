import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * ResetBusService - Neutral singleton broadcast channel.
 *
 * Neither AuthService nor any feature service owns this bus.
 * Both sides inject it independently to maintain zero coupling.
 *
 * Usage:
 *   - AuthService calls `resetBus.reset$.next()` on logout or token expiry.
 *   - Feature services (CardService, BillingService, etc.) subscribe
 *     to `resetBus.reset$` to purge their internal state.
 *
 * Design decision: Subject<void> (not ReplaySubject) because all
 * services are initialized at app bootstrap - no late subscribers.
 */
@Injectable({ providedIn: 'root' })
export class ResetBusService {
  readonly reset$ = new Subject<void>();
}

