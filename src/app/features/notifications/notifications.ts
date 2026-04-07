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
import { Router, RouterLink } from '@angular/router';
import { catchError, finalize, tap } from 'rxjs/operators';
import { of } from 'rxjs';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { NotificationService } from '../../core/services/notification.service';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle/theme-toggle.component';


// --- Interfaces ----------------------------------------------------------------

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

// --- Component -----------------------------------------------------------------

@Component({
    selector: 'app-notifications',
    standalone: true,
    imports: [CommonModule, RouterLink, SidebarComponent, ThemeToggleComponent],
    templateUrl: './notifications.html',
    styleUrls: ['./notifications.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsComponent implements OnInit {
    private readonly http = inject(HttpClient);
    private readonly router = inject(Router);
    private readonly BASE_URL = '/api/notifications';
    public readonly notificationService = inject(NotificationService);

    // -- Signals ------------------------------------------------------------------
    notifications = signal<NotificationResponse[]>([]);
    unreadCount = signal<number>(0);
    isLoading = signal<boolean>(false);
    isMarkingAll = signal<boolean>(false);
    markingIds = signal<Set<string>>(new Set());
    errorMessage = signal<string | null>(null);
    filterUnread = signal<boolean>(false);

    // -- Computed -----------------------------------------------------------------
    displayedNotifications = computed(() => {
        const all = this.notifications();
        return this.filterUnread() ? all.filter(n => !n.isRead) : all;
    });

    hasUnread = computed(() => this.unreadCount() > 0);

    // --- Lifecycle ----------------------------------------------------------------
    ngOnInit(): void {
        this.fetchNotifications();
        this.fetchUnreadCount();
    }

    // --- JWT userId helper --------------------------------------------------------
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

    // --- API Calls ----------------------------------------------------------------

    fetchNotifications(): void {
        const userId = this.getUserId();
        this.isLoading.set(true);
        this.errorMessage.set(null);

        const params = new HttpParams()
            .set('page', '1')
            .set('pageSize', '20');

        const url = userId
            ? `${this.BASE_URL}/user/${userId}`
            : null;

        if (!url) {
            this.isLoading.set(false);
            return;
        }

        this.http
            .get<NotificationResponseListApiResponse>(url, { params })
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
        const userId = this.getUserId();
        if (!userId) return;

        this.http
            .get<UnreadCountApiResponse>(
                `${this.BASE_URL}/user/${userId}/unread-count`
            )
            .pipe(
                tap(res => {
                    if (res.success) {
                        this.unreadCount.set(res.data ?? 0);
                        this.notificationService.setUnreadCount(res.data ?? 0);
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
                        this.notifications.update(list =>
                            list.map(n =>
                                n.id === notificationId
                                    ? { ...n, isRead: true, readAt: new Date().toISOString() }
                                    : n
                            )
                        );
                        this.unreadCount.update(c => Math.max(0, c - 1));
                        this.notificationService.decrementUnreadCount();
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
        const userId = this.getUserId();
        if (!userId) return;

        this.isMarkingAll.set(true);

        this.http
            .put<MarkReadApiResponse>(
                `${this.BASE_URL}/user/${userId}/read-all`,
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
                        this.notificationService.setUnreadCount(0);
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

    // --- Notification click -> navigate by type ------------------------------------
    onNotificationClick(notif: NotificationResponse): void {
        // Mark as read if unread
        if (!notif.isRead) {
            this.markAsRead(notif.id);
        }
        // Route based on notification type
        switch (notif.type?.toUpperCase()) {
            case 'PAYMENT':
                this.router.navigate(['/payments']);
                break;
            case 'SECURITY':
                this.router.navigate(['/profile']);
                break;
            default:
                // No navigation for SYSTEM or unknown types
                break;
        }
    }

    // --- UI Helpers ---------------------------------------------------------------

    toggleFilter(): void {
        this.filterUnread.update(v => !v);
    }

    isBeingMarked(id: string): boolean {
        return this.markingIds().has(id);
    }

    getTypeIcon(type: string): string {
        switch (type?.toUpperCase()) {
            case 'PAYMENT':  return 'payments';
            case 'SECURITY': return 'shield';
            case 'SYSTEM':   return 'settings';
            default:         return 'notifications';
        }
    }

    getTypeIconClass(type: string): string {
        switch (type?.toUpperCase()) {
            case 'PAYMENT':  return 'notif-icon-wrap icon--payment';
            case 'SECURITY': return 'notif-icon-wrap icon--security';
            case 'SYSTEM':   return 'notif-icon-wrap icon--system';
            default:         return 'notif-icon-wrap icon--default';
        }
    }

    getPriorityClass(priority: string): string {
        switch (priority?.toUpperCase()) {
            case 'HIGH':   return 'tag priority--high';
            case 'MEDIUM': return 'tag priority--medium';
            case 'LOW':    return 'tag priority--low';
            default:       return 'tag';
        }
    }

    isActionable(type: string): boolean {
        const t = type?.toUpperCase();
        return t === 'PAYMENT' || t === 'SECURITY';
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

        return date.toLocaleDateString('en-IN', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        });
    }

    trackById(_: number, item: NotificationResponse): string {
        return item.id;
    }
}

