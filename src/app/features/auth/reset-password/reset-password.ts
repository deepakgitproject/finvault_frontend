import { Component, inject, OnInit, signal, OnDestroy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { Subscription, interval } from 'rxjs';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.html',
  styleUrl: '../login/login.scss'
})
export class ResetPasswordComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  public authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  resetForm = this.fb.group({
    otpCode: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]],
    newPassword: ['', [Validators.required, Validators.minLength(8)]]
  });

  email = '';
  
  // OTP Countdown
  otpTimer = signal(60);
  private timerSub?: Subscription;

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.email = params['email'] || '';
      if (!this.email) {
        this.router.navigate(['/auth/forgot-password']);
      }
    });
    this.startOtpCountdown();
  }

  onSubmit() {
    if (this.resetForm.valid && this.email) {
      this.authService.resetPassword({
        email: this.email,
        otpCode: this.resetForm.value.otpCode!,
        newPassword: this.resetForm.value.newPassword!
      }).subscribe((res: any) => {
        if (res && res.success) {
          this.router.navigate(['/auth/login'], { 
            queryParams: { reset: 'true', email: this.email } 
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

