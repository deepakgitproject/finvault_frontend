import {
    Component,
    OnInit,
    signal,
    computed,
    inject,
    ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { catchError, finalize, tap } from 'rxjs/operators';
import { of } from 'rxjs';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface NotificationResponse {
    id: string;
    userId: string;
    type: string; // 'PAYMENT' | 'SECURITY' | 'SYSTEM'
    title: string;
    message: string;
    channel: string;
    priority: string;
    isRead: boolean;
    readAt: string | null;
    referenceId: string | null;
    createdAt: string;
}

export interface NotificationResponseListApiResponse {
    success: boolean;
    message: string | null;
    data: NotificationResponse[];
    errors: string[];
}

export interface UnreadCountApiResponse {
    success: boolean;
    message: string | null;
    data: number;
    errors: string[];
}

export interface MarkReadApiResponse {
    success: boolean;
    message: string | null;
    data: NotificationResponse | null;
    errors: string[];
}

// ─── Component ─────────────────────────────────────────────────────────────────

@Component({
    selector: 'app-notifications',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './notifications.html',
    styleUrls: ['./notifications.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsComponent implements OnInit {
    private readonly http = inject(HttpClient);
    private readonly BASE_URL = '/api/notifications';
    readonly userId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

    // ── Signals ──────────────────────────────────────────────────────────────────
    notifications = signal<NotificationResponse[]>([]);
    unreadCount = signal<number>(0);
    isLoading = signal<boolean>(false);
    isMarkingAll = signal<boolean>(false);
    markingIds = signal<Set<string>>(new Set());
    errorMessage = signal<string | null>(null);
    filterUnread = signal<boolean>(false);

    // ── Computed ─────────────────────────────────────────────────────────────────
    displayedNotifications = computed(() => {
        const all = this.notifications();
        return this.filterUnread() ? all.filter(n => !n.isRead) : all;
    });

    hasUnread = computed(() => this.unreadCount() > 0);

    // ─── Lifecycle ────────────────────────────────────────────────────────────────
    ngOnInit(): void {
        this.fetchNotifications();
        this.fetchUnreadCount();
    }

    // ─── API Calls ────────────────────────────────────────────────────────────────

    fetchNotifications(): void {
        this.isLoading.set(true);
        this.errorMessage.set(null);

        const params = new HttpParams()
            .set('page', '1')
            .set('pageSize', '20')
            .set('isRead', 'false');

        this.http
            .get<NotificationResponseListApiResponse>(
                `${this.BASE_URL}/user/${this.userId}`,
                { params }
            )
            .pipe(
                tap(res => {
                    if (res.success) {
                        this.notifications.set(res.data ?? []);
                    } else {
                        this.errorMessage.set(res.message ?? 'Failed to load notifications.');
                    }
                }),
                catchError(err => {
                    console.error('fetchNotifications error:', err);
                    this.errorMessage.set('Unable to reach the notification service. Please try again.');
                    return of(null);
                }),
                finalize(() => this.isLoading.set(false))
            )
            .subscribe();
    }

    fetchUnreadCount(): void {
        this.http
            .get<UnreadCountApiResponse>(
                `${this.BASE_URL}/user/${this.userId}/unread-count`
            )
            .pipe(
                tap(res => {
                    if (res.success) {
                        this.unreadCount.set(res.data ?? 0);
                    }
                }),
                catchError(err => {
                    console.error('fetchUnreadCount error:', err);
                    return of(null);
                })
            )
            .subscribe();
    }

    markAsRead(notificationId: string): void {
        const current = new Set(this.markingIds());
        current.add(notificationId);
        this.markingIds.set(current);

        this.http
            .put<MarkReadApiResponse>(
                `${this.BASE_URL}/${notificationId}/read`,
                {}
            )
            .pipe(
                tap(res => {
                    if (res.success) {
                        // Optimistic update: flip isRead on the signal array
                        this.notifications.update(list =>
                            list.map(n =>
                                n.id === notificationId
                                    ? { ...n, isRead: true, readAt: new Date().toISOString() }
                                    : n
                            )
                        );
                        this.unreadCount.update(c => Math.max(0, c - 1));
                    }
                }),
                catchError(err => {
                    console.error('markAsRead error:', err);
                    return of(null);
                }),
                finalize(() => {
                    const updated = new Set(this.markingIds());
                    updated.delete(notificationId);
                    this.markingIds.set(updated);
                })
            )
            .subscribe();
    }

    markAllAsRead(): void {
        this.isMarkingAll.set(true);

        this.http
            .put<MarkReadApiResponse>(
                `${this.BASE_URL}/user/${this.userId}/read-all`,
                {}
            )
            .pipe(
                tap(res => {
                    if (res.success) {
                        this.notifications.update(list =>
                            list.map(n => ({
                                ...n,
                                isRead: true,
                                readAt: new Date().toISOString(),
                            }))
                        );
                        this.unreadCount.set(0);
                    }
                }),
                catchError(err => {
                    console.error('markAllAsRead error:', err);
                    return of(null);
                }),
                finalize(() => this.isMarkingAll.set(false))
            )
            .subscribe();
    }

    // ─── UI Helpers ───────────────────────────────────────────────────────────────

    toggleFilter(): void {
        this.filterUnread.update(v => !v);
    }

    isBeingMarked(id: string): boolean {
        return this.markingIds().has(id);
    }

    getTypeIcon(type: string): string {
        switch (type?.toUpperCase()) {
            case 'PAYMENT': return 'payments';
            case 'SECURITY': return 'shield';
            case 'SYSTEM': return 'settings';
            default: return 'notifications';
        }
    }

    getTypeIconClass(type: string): string {
        switch (type?.toUpperCase()) {
            case 'PAYMENT': return 'icon--payment';
            case 'SECURITY': return 'icon--security';
            case 'SYSTEM': return 'icon--system';
            default: return 'icon--default';
        }
    }

    getPriorityClass(priority: string): string {
        switch (priority?.toUpperCase()) {
            case 'HIGH': return 'priority--high';
            case 'MEDIUM': return 'priority--medium';
            case 'LOW': return 'priority--low';
            default: return '';
        }
    }

    formatDate(dateString: string): string {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        });
    }

    trackById(_: number, item: NotificationResponse): string {
        return item.id;
    }
}