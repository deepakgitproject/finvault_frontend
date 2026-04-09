import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { CardService } from '../../core/services/card.service';
import { AuthService } from '../../core/services/auth.service';
import { TransactionService } from '../../core/services/transaction.service';

interface UserProfile {
  fullName: string;
  email: string;
  phone: string;
  initials: string;
  memberSince: string;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, SidebarComponent],
  templateUrl: './profile.html',
  styleUrl: './profile.scss'
})
export class ProfileComponent implements OnInit {

  // -- UI state -------------------------------------------------------
  showCurrentPassword = signal(false);

  // -- Preference toggles (localStorage-backed) -----------------------
  darkMode = signal(false);
  emailNotifications = signal(true);
  autoPay = signal(false);
  billReminders = signal(true);

  // -- Password change ------------------------------------------------
  passwordChangeMessage = signal<string | null>(null);
  passwordChangeError = signal<string | null>(null);
  showPasswordSuccess = signal(false);

  // -- User profile ---------------------------------------------------
  userProfile = signal<UserProfile>({
    fullName: '',
    email: '',
    phone: 'Not set',
    initials: '',
    memberSince: '',
  });

  // -- Services -------------------------------------------------------
  private http = inject(HttpClient);
  public cardService = inject(CardService);
  private router = inject(Router);
  private authService = inject(AuthService);
  private transactionService = inject(TransactionService);

  // -- Quick Stats (computed) -----------------------------------------
  totalManaged = computed(() => {
    return this.cardService.cards().reduce(
      (sum, c) => sum + (c.creditLimit - (c.currentBalance || 0)), 0
    ).toLocaleString('en-US');
  });

  totalOutstanding = computed(() => {
    return this.cardService.cards().reduce(
      (sum, c) => sum + (c.currentBalance || 0), 0
    ).toLocaleString('en-US');
  });

  totalCreditLimit = computed(() => {
    return this.cardService.cards().reduce(
      (sum, c) => sum + (c.creditLimit || 0), 0
    ).toLocaleString('en-US');
  });

  avgUtilization = computed(() => {
    const cards = this.cardService.cards();
    if (cards.length === 0) return 0;
    const totalUsage = cards.reduce((sum, c) => sum + (c.usagePercent || 0), 0);
    return Math.round(totalUsage / cards.length);
  });

  // -- Security Score (frontend-computed) -----------------------------
  securityScore = computed(() => {
    let score = 0;
    // +30 for having an account
    score += 30;
    // +20 for email notifications enabled
    if (this.emailNotifications()) score += 20;
    // +15 for bill reminders enabled
    if (this.billReminders()) score += 15;
    // +20 for having cards verified
    const cards = this.cardService.cards();
    if (cards.length > 0) score += 20;
    // +15 for having at least 2 cards (diversification)
    if (cards.length >= 2) score += 15;
    return Math.min(score, 100);
  });

  securityLabel = computed(() => {
    const s = this.securityScore();
    if (s >= 85) return 'Excellent';
    if (s >= 65) return 'Good';
    if (s >= 40) return 'Fair';
    return 'Needs Attention';
  });

  securityColor = computed(() => {
    const s = this.securityScore();
    if (s >= 85) return '#10b981';
    if (s >= 65) return '#6b6ef9';
    if (s >= 40) return '#f59e0b';
    return '#ef4444';
  });

  // -- Session Info (client-side) -------------------------------------
  currentBrowser = '';
  currentOS = '';

  // -- Transaction count ----------------------------------------------
  totalTransactions = signal(0);

  constructor() {}

  ngOnInit(): void {
    // Restore persisted preferences
    const savedTheme = localStorage.getItem('fv_theme');
    if (savedTheme === 'dark') {
      this.darkMode.set(true);
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    this.emailNotifications.set(localStorage.getItem('fv_email_notif') !== 'off');
    this.autoPay.set(localStorage.getItem('fv_autopay') === 'on');
    this.billReminders.set(localStorage.getItem('fv_reminders') !== 'off');

    // Detect browser/OS
    this.detectSession();

    // Load real user from API
    this.loadUserProfile();

    // Load transaction count
    this.transactionService.getTransactions().subscribe({
      next: (txns) => this.totalTransactions.set(txns.length),
      error: () => {}
    });
  }

  // -- Session Detection -----------------------------------------------
  private detectSession(): void {
    const ua = navigator.userAgent;
    // Browser
    if (ua.includes('Edg/')) this.currentBrowser = 'Microsoft Edge';
    else if (ua.includes('Chrome/')) this.currentBrowser = 'Google Chrome';
    else if (ua.includes('Firefox/')) this.currentBrowser = 'Mozilla Firefox';
    else if (ua.includes('Safari/')) this.currentBrowser = 'Safari';
    else this.currentBrowser = 'Unknown Browser';

    // OS
    if (ua.includes('Windows')) this.currentOS = 'Windows';
    else if (ua.includes('Mac')) this.currentOS = 'macOS';
    else if (ua.includes('Linux')) this.currentOS = 'Linux';
    else if (ua.includes('Android')) this.currentOS = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) this.currentOS = 'iOS';
    else this.currentOS = 'Unknown OS';
  }

  // -- Toggle handlers ------------------------------------------------
  togglePasswords(): void {
    this.showCurrentPassword.update(v => !v);
  }

  toggleDarkMode(): void {
    this.darkMode.update(v => !v);
    const html = document.documentElement;
    if (this.darkMode()) {
      html.setAttribute('data-theme', 'dark');
      localStorage.setItem('fv_theme', 'dark');
    } else {
      html.removeAttribute('data-theme');
      localStorage.setItem('fv_theme', 'light');
    }
  }

  toggleEmailNotifications(): void {
    this.emailNotifications.update(v => !v);
    localStorage.setItem('fv_email_notif', this.emailNotifications() ? 'on' : 'off');
  }

  toggleAutoPay(): void {
    this.autoPay.update(v => !v);
    localStorage.setItem('fv_autopay', this.autoPay() ? 'on' : 'off');
  }

  toggleBillReminders(): void {
    this.billReminders.update(v => !v);
    localStorage.setItem('fv_reminders', this.billReminders() ? 'on' : 'off');
  }

  // -- Password Change -----------------------------------------------
  changePassword(currentPassword: string, newPassword: string, confirmPassword: string): void {
    this.passwordChangeMessage.set(null);
    this.passwordChangeError.set(null);

    if (newPassword !== confirmPassword) {
      this.passwordChangeError.set('New passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      this.passwordChangeError.set('Password must be at least 6 characters.');
      return;
    }

    const email = this.userProfile().email;
    this.http.post<any>('/api/identity/auth/reset-password', {
      email,
      otpCode: currentPassword,
      newPassword
    }).subscribe({
      next: (res) => {
        if (res?.success !== false) {
          this.passwordChangeMessage.set('Password updated successfully.');
          this.showPasswordSuccess.set(true);
          this.showCurrentPassword.set(false);
          setTimeout(() => this.showPasswordSuccess.set(false), 3000);
        } else {
          this.passwordChangeError.set(res?.message ?? 'Failed to update password.');
        }
      },
      error: (err) => {
        this.passwordChangeError.set(err?.error?.message ?? 'Failed to update password.');
      }
    });
  }

  // -- Sign Out -------------------------------------------------------
  onSignOut(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }

  // -- API ------------------------------------------------------------
  private loadUserProfile(): void {
    this.http.get<any>('/api/identity/users/me').subscribe({
      next: (data) => {
        const user = data?.data ?? data;
        if (!user) return;
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ')
          || user.fullName || user.name || '';
        const initials = fullName
          .split(' ')
          .slice(0, 2)
          .map((w: string) => w[0]?.toUpperCase() ?? '')
          .join('');
        
        // Calculate member since from createdAt or fallback
        let memberSince = '';
        if (user.createdAt) {
          const d = new Date(user.createdAt);
          memberSince = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }

        this.userProfile.set({
          fullName,
          email: user.email ?? '',
          phone: user.phone || user.phoneNumber || 'Not set',
          initials: initials || 'FV',
          memberSince: memberSince || 'FinVault Member',
        });
      },
      error: () => {
        // Fallback: try to extract from JWT
        try {
          const token = localStorage.getItem('fv_access_token');
          if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const email = payload.email || '';
            const name = payload.name || payload.given_name || email.split('@')[0] || 'Vault User';
            const initials = name.split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join('');
            this.userProfile.set({
              fullName: name,
              email: email,
              phone: 'Not set',
              initials: initials || 'FV',
              memberSince: 'FinVault Member',
            });
          }
        } catch { /* keep defaults */ }
      },
    });
  }
}
