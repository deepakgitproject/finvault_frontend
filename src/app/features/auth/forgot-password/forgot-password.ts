import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.html',
  styleUrl: '../login/login.scss'
})
export class ForgotPasswordComponent {
  private fb = inject(FormBuilder);
  public authService = inject(AuthService);
  private router = inject(Router);

  forgotForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  onSubmit() {
    if (this.forgotForm.valid) {
      const email = this.forgotForm.value.email!;
      this.authService.forgotPassword(email, 'PasswordReset').subscribe((res: any) => {
        if (res && res.success) {
          // Redirect to reset password with email as query param
          this.router.navigate(['/auth/reset-password'], { 
            queryParams: { email: email } 
          });
        }
      });
    }
  }
}

