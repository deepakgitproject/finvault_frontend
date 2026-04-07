import { Injectable, signal, computed } from '@angular/core';

export interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

/**
 * GlobalUiService - Unified UI feedback manager.
 *
 * Toast Queue Rules:
 *   - FIFO auto-dismissal: each toast displays for 3 seconds.
 *   - Manual dismissal: next toast appears immediately.
 *   - Queue cap: maximum 5 queued toasts. Overflow discards oldest.
 *   - Methods: success(), error(), info() - user-friendly messages only.
 */
@Injectable({
  providedIn: 'root'
})
export class GlobalUiService {
  // -- Coming Soon (wallet) ----------------------------------------
  private _comingSoonVisible = signal(false);
  public comingSoonVisible = this._comingSoonVisible.asReadonly();

  showComingSoon() {
    this._comingSoonVisible.set(true);
    setTimeout(() => this._comingSoonVisible.set(false), 3000);
  }

  hideComingSoon() {
    this._comingSoonVisible.set(false);
  }

  // -- Toast Queue -------------------------------------------------
  private static readonly MAX_QUEUE = 5;
  private static readonly DISPLAY_MS = 3000;
  private nextId = 0;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  private _toasts = signal<ToastMessage[]>([]);
  public readonly toasts = this._toasts.asReadonly();

  /** The currently displayed toast (top of queue). */
  public readonly currentToast = computed(() => {
    const queue = this._toasts();
    return queue.length > 0 ? queue[0] : null;
  });

  success(message: string): void {
    this.enqueue(message, 'success');
  }

  error(message: string): void {
    this.enqueue(message, 'error');
  }

  info(message: string): void {
    this.enqueue(message, 'info');
  }

  /**
   * Manual dismissal - removes the current toast and
   * immediately shows the next one (if any).
   */
  dismiss(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
    this.dequeue();
  }

  // -- Private Queue Logic -----------------------------------------

  private enqueue(message: string, type: ToastMessage['type']): void {
    const toast: ToastMessage = { id: this.nextId++, message, type };

    this._toasts.update(queue => {
      const next = [...queue, toast];
      // Cap at MAX_QUEUE - discard oldest overflow
      if (next.length > GlobalUiService.MAX_QUEUE) {
        return next.slice(next.length - GlobalUiService.MAX_QUEUE);
      }
      return next;
    });

    // If this is the only toast (queue was empty), start the auto-dismiss timer
    if (this._toasts().length === 1) {
      this.startDismissTimer();
    }
  }

  private dequeue(): void {
    this._toasts.update(queue => queue.slice(1));

    // If there are more toasts, start timer for the next one
    if (this._toasts().length > 0) {
      this.startDismissTimer();
    }
  }

  private startDismissTimer(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
    }
    this.dismissTimer = setTimeout(() => {
      this.dismissTimer = null;
      this.dequeue();
    }, GlobalUiService.DISPLAY_MS);
  }
}

