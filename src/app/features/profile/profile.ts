import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { CardService } from '../../core/services/card.service';
import { AuthService } from '../../core/services/auth.service';

interface UserProfile {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  initials: string;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, SidebarComponent],
  templateUrl: './profile.html',
  styleUrl: './profile.scss'
})
export class ProfileComponent implements OnInit {

  // -- Edit / UI state ------------------------------------------------
  editMode = signal(false);
  showCurrentPassword = signal(false);
  showSaveSuccess = signal(false);

  // -- Modal state --------------------------------------------------
  deleteConfirmModal = signal(false);
  deleteConfirmInput = signal('');

  // -- Toggle signals -------------------------------------------------
  darkMode = signal(false);
  emailNotifications = signal(true);
  twoFactorAuth = signal(true);
  autoPay = signal(false);
  billReminders = signal(true);

  // -- Password change signals ----------------------------------------
  passwordChangeMessage = signal<string | null>(null);
  passwordChangeError = signal<string | null>(null);

  // -- User profile ---------------------------------------------------
  userProfile = signal<UserProfile>({
    fullName: '',
    email: '',
    phone: 'Not set',
    dateOfBirth: 'Not set',
    address: 'Not set',
    initials: '',
  });

  // Edit form model
  profileForm = {
    fullName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    address: ''
  };

  private originalForm = { ...this.profileForm };

  constructor(
    private http: HttpClient, 
    public cardService: CardService,
    private router: Router,
    private authService: AuthService
  ) { }

  totalManaged = computed(() => {
    return this.cardService.cards().reduce((sum, c) => sum + (c.creditLimit - (c.currentBalance || 0)), 0).toLocaleString('en-US');
  });

  ngOnInit(): void {
    // Restore persisted theme
    const savedTheme = localStorage.getItem('fv_theme');
    if (savedTheme === 'dark') {
      this.darkMode.set(true);
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    // Restore notification preference
    this.emailNotifications.set(localStorage.getItem('fv_email_notif') !== 'off');
    this.twoFactorAuth.set(localStorage.getItem('fv_2fa') !== 'off');
    this.autoPay.set(localStorage.getItem('fv_autopay') === 'on');
    this.billReminders.set(localStorage.getItem('fv_reminders') !== 'off');

    // Load real user from API
    this.loadUserProfile();
  }

  // -- Toggle handlers ------------------------------------------------
  toggleEditMode(): void {
    if (!this.editMode()) {
      // Entering edit mode - copy current values to form
      const current = this.userProfile();
      this.profileForm = {
        fullName: current.fullName,
        email: current.email,
        phone: current.phone,
        dateOfBirth: current.dateOfBirth,
        address: current.address
      };
      this.originalForm = { ...this.profileForm };
    } else {
      // Canceling - restore original values
      this.profileForm = { ...this.originalForm };
    }
    this.editMode.update(v => !v);
  }

  saveProfile(): void {
    const updatedProfile = {
      ...this.profileForm,
      initials: this.profileForm.fullName
        .split(' ')
        .slice(0, 2)
        .map(w => w[0]?.toUpperCase() ?? '')
        .join('')
    };

    // Try to save to the backend
    const [firstName, ...lastParts] = this.profileForm.fullName.split(' ');
    const apiPayload = {
      firstName: firstName || '',
      lastName: lastParts.join(' ') || '',
      email: this.profileForm.email,
      phone: this.profileForm.phone,
      dateOfBirth: this.profileForm.dateOfBirth,
      address: this.profileForm.address,
    };

    this.http.put<any>('/api/identity/users/me', apiPayload).subscribe({
      next: () => {
        this.userProfile.update(profile => ({ ...profile, ...updatedProfile }));
        this.editMode.set(false);
        this.showSaveSuccess.set(true);
        setTimeout(() => this.showSaveSuccess.set(false), 3000);
      },
      error: () => {
        // Fall back to local-only update
        this.userProfile.update(profile => ({ ...profile, ...updatedProfile }));
        this.editMode.set(false);
        this.showSaveSuccess.set(true);
        setTimeout(() => this.showSaveSuccess.set(false), 3000);
      }
    });
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
          this.showCurrentPassword.set(false);
        } else {
          this.passwordChangeError.set(res?.message ?? 'Failed to update password.');
        }
      },
      error: (err) => {
        this.passwordChangeError.set(err?.error?.message ?? 'Failed to update password.');
      }
    });
  }

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

  toggleTwoFactor(): void {
    this.twoFactorAuth.update(v => !v);
    localStorage.setItem('fv_2fa', this.twoFactorAuth() ? 'on' : 'off');
  }

  toggleAutoPay(): void {
    this.autoPay.update(v => !v);
    localStorage.setItem('fv_autopay', this.autoPay() ? 'on' : 'off');
  }

  toggleBillReminders(): void {
    this.billReminders.update(v => !v);
    localStorage.setItem('fv_reminders', this.billReminders() ? 'on' : 'off');
  }

  // -- Account Deletion ------------------------------------------
  openDeleteModal(): void {
    this.deleteConfirmInput.set('');
    this.deleteConfirmModal.set(true);
  }

  closeDeleteModal(): void {
    this.deleteConfirmModal.set(false);
  }

  confirmDelete(): void {
    if (this.deleteConfirmInput() === 'DELETE') {
      console.log('Account Deletion Requested');
      alert('Account deleted successfully (Demo)');
      this.closeDeleteModal();
    }
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
        // Handle ApiResponse wrapper or raw object
        const user = data?.data ?? data;
        if (!user) return;
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ')
          || user.fullName || user.name || this.userProfile().fullName;
        const initials = fullName
          .split(' ')
          .slice(0, 2)
          .map((w: string) => w[0]?.toUpperCase() ?? '')
          .join('');
        this.userProfile.set({
          fullName,
          email: user.email ?? this.userProfile().email,
          phone: user.phone || user.phoneNumber || 'Not set',
          dateOfBirth: user.dateOfBirth || user.dob || 'Not set',
          address: user.address || 'Not set',
          initials: initials || this.userProfile().initials,
        });
      },
      error: () => {
        // Fallback to demo data
      },
    });
  }
}

