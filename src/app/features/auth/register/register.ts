import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: '../login/login.scss' // Reusing login layout styles
})
export class RegisterComponent {
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

  onSubmit() {
    if (this.registerForm.valid) {
      this.authService.register({
        firstName: this.registerForm.value.firstName!,
        lastName: this.registerForm.value.lastName!,
        email: this.registerForm.value.email!,
        password: this.registerForm.value.password!
      }).subscribe((res: any) => {
        // HTTP 2xx means success. If your backend doesn't explicitly return {success: true}, we just check if response exists.
        if (res) {
           const userId = res.data?.userId || res.userId || 'unknown-user';
           this.registeredUserId = userId;
           this.showOtpModal = true;
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
        if (res && res.success !== false) {
          this.router.navigate(['/dashboard']);
        }
      });
    }
  }
}
