import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, tap } from 'rxjs/operators';
import { of } from 'rxjs';

export interface UnreadCountApiResponse {
  success: boolean;
  message: string | null;
  data: number;
  errors: string[];
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly BASE_URL = '/api/notifications';

  // --- Signals ---
  unreadCount = signal<number>(0);
  hasUnread = computed(() => this.unreadCount() > 0);

  constructor() {
    this.refreshUnreadCount();
  }

  // --- JWT userId helper ---
  private getUserId(): string {
    const token = localStorage.getItem('fv_access_token');
    if (!token) return '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.sub || '';
    } catch {
      return '';
    }
  }

  // --- API Methods ---
  refreshUnreadCount(): void {
    const userId = this.getUserId();
    if (!userId) return;

    this.http
      .get<UnreadCountApiResponse>(`${this.BASE_URL}/user/${userId}/unread-count`)
      .pipe(
        tap(res => {
          if (res.success) {
            this.unreadCount.set(res.data ?? 0);
          }
        }),
        catchError(err => {
          console.error('refreshUnreadCount error:', err);
          return of(null);
        })
      )
      .subscribe();
  }

  setUnreadCount(count: number): void {
    this.unreadCount.set(count);
  }

  decrementUnreadCount(): void {
    this.unreadCount.update(c => Math.max(0, c - 1));
  }
}

