import { Injectable, inject, signal, computed } from '@angular/core';
import { tap, catchError, finalize } from 'rxjs/operators';
import { EMPTY } from 'rxjs';
import { ApiService } from './api.service';
import { TokenService } from './token.service';
import {
  RegisterRequest,
  LoginRequest,
  VerifyEmailRequest,
  AuthResponse,
  ApiResponse,
  UserProfile,
} from '../models/auth.models';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiService = inject(ApiService);
  private readonly tokenService = inject(TokenService);

  readonly currentUser = signal<UserProfile | null>(null);
  readonly isLoggedIn = computed(() => !!this.currentUser());
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  register(req: RegisterRequest) {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    return this.apiService
      .post<ApiResponse<AuthResponse>>('/api/identity/auth/register', req)
      .pipe(
        tap((res: any) => {
          if (res && res.success !== false) {
            // Only store tokens if the backend actually returns them
            // (register may only return userId, tokens come after login)
            const accessToken = res.data?.accessToken || res.accessToken;
            const refreshToken = res.data?.refreshToken || res.refreshToken;
            
            if (accessToken && refreshToken) {
              this.tokenService.setTokens(accessToken, refreshToken);
            }
          } else {
            this.errorMessage.set(res.message ?? 'Registration failed.');
          }
        }),
        catchError((err) => {
          this.errorMessage.set(
            err?.error?.message ?? 'An unexpected error occurred.'
          );
          return EMPTY;
        }),
        finalize(() => this.isLoading.set(false))
      );
  }

  verifyEmail(req: VerifyEmailRequest) {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    return this.apiService
      .post<ApiResponse<null>>('/api/identity/auth/verify-email', req)
      .pipe(
        tap((res) => {
          if (!res.success) {
            this.errorMessage.set(res.message ?? 'Verification failed.');
          }
        }),
        catchError((err) => {
          this.errorMessage.set(
            err?.error?.message ?? 'An unexpected error occurred.'
          );
          return EMPTY;
        }),
        finalize(() => this.isLoading.set(false))
      );
  }

  login(req: LoginRequest) {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    return this.apiService
      .post<ApiResponse<AuthResponse>>('/api/identity/auth/login', req)
      .pipe(
        tap((res) => {
          if (res.success && res.data) {
            this.tokenService.setTokens(
              res.data.accessToken,
              res.data.refreshToken
            );
          } else {
            this.errorMessage.set(res.message ?? 'Login failed.');
          }
        }),
        catchError((err) => {
          this.errorMessage.set(
            err?.error?.message ?? 'An unexpected error occurred.'
          );
          return EMPTY;
        }),
        finalize(() => this.isLoading.set(false))
      );
  }

  logout(): void {
    this.tokenService.clearTokens();
    this.currentUser.set(null);
    this.errorMessage.set(null);
  }

  loadCurrentUser() {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    return this.apiService
      .get<ApiResponse<UserProfile>>('/api/identity/users/me')
      .pipe(
        tap((res) => {
          if (res.success && res.data) {
            this.currentUser.set(res.data);
          } else {
            this.errorMessage.set(res.message ?? 'Failed to load user.');
          }
        }),
        catchError((err) => {
          this.errorMessage.set(
            err?.error?.message ?? 'An unexpected error occurred.'
          );
          return EMPTY;
        }),
        finalize(() => this.isLoading.set(false))
      );
  }
}