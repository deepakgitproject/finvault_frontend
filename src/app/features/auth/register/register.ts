import { Component, inject, signal, OnDestroy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { Subscription, timer, interval } from 'rxjs';
import { take, finalize } from 'rxjs/operators';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: '../login/login.scss'
})
export class RegisterComponent implements OnDestroy {
  private fb = inject(FormBuilder);
  public authService = inject(AuthService);
  private router = inject(Router);

  registerForm = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  otpForm = this.fb.group({
    otpCode: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]]
  });

  showOtpModal = false;
  registeredUserId = '';
  registeredEmail = '';
  
  // OTP Countdown
  otpTimer = signal(0);
  private timerSub?: Subscription;

  onSubmit() {
    if (this.registerForm.valid) {
      const email = this.registerForm.value.email!;
      this.authService.register({
        firstName: this.registerForm.value.firstName!,
        lastName: this.registerForm.value.lastName!,
        email: email,
        password: this.registerForm.value.password!
      }).subscribe((res: any) => {
        if (res && res.success) {
          // If isEmailVerified is true (unlikely for new reg, but possible for some systems)
          if (res.data?.isEmailVerified) {
            this.router.navigate(['/dashboard']);
          } else {
            // Requires OTP
            this.registeredUserId = res.data?.userId || 'unknown-user';
            this.registeredEmail = email;
            this.startOtpCountdown();
            this.showOtpModal = true;
          }
        }
      });
    }
  }

  onVerifyOtp() {
    if (this.otpForm.valid) {
      this.authService.verifyEmail({
        userId: this.registeredUserId || 'dummy-if-missing',
        otpCode: this.otpForm.value.otpCode!
      }).subscribe((res: any) => {
        if (res && res.success) {
          // Per user request: redirect to login after OTP for new users
          this.router.navigate(['/auth/login'], { 
            queryParams: { verified: 'true', email: this.registeredEmail } 
          });
        }
      });
    }
  }

  startOtpCountdown() {
    this.stopOtpCountdown();
    this.otpTimer.set(60);
    this.timerSub = interval(1000)
      .pipe(take(60))
      .subscribe({
        next: () => this.otpTimer.update(v => v - 1),
        complete: () => this.otpTimer.set(0)
      });
  }

  stopOtpCountdown() {
    if (this.timerSub) {
      this.timerSub.unsubscribe();
    }
  }

  ngOnDestroy() {
    this.stopOtpCountdown();
  }
}

