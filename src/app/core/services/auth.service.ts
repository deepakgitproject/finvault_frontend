import { Injectable, inject, signal, computed } from '@angular/core';
import { tap, catchError, finalize } from 'rxjs/operators';
import { EMPTY } from 'rxjs';
import { ApiService } from './api.service';
import { TokenService } from './token.service';
import { ResetBusService } from './reset-bus.service';
import {
  RegisterRequest,
  LoginRequest,
  VerifyEmailRequest,
  SendOTPCommand,
  ResetPasswordCommand,
  RefreshTokenRequest,
  AuthResponse,
  ApiResponse,
  UserProfile,
} from '../models/auth.models';

/**
 * AuthService - Identity authority for FinVault.
 *
 * Identity extraction priority (getUserId):
 *   1. Stored session userId (from AuthResponse body - avoids JWT decode)
 *   2. JWT claim fallback: sub -> nameid -> unique_name -> userId
 *
 * Session lifecycle:
 *   - On login/register/refresh: store userId + tokens.
 *   - On logout/expiry: clear everything and emit resetBus.reset$.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiService = inject(ApiService);
  private readonly tokenService = inject(TokenService);
  private readonly resetBus = inject(ResetBusService);

  private static readonly USER_ID_KEY = 'fv_user_id';
  private static readonly USER_NAME_KEY = 'fv_user_name';

  readonly currentUser = signal<UserProfile | null>(null);
  readonly isLoggedIn = computed(() => !!this.currentUser());
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  // -- Identity Extraction -----------------------------------------

  /**
   * Primary source: stored session userId from AuthResponse.
   * Fallback: JWT claim parsing with documented priority.
   */
  getUserId(): string | null {
    // 1. Check stored session value first (avoids JWT decode)
    const stored = localStorage.getItem(AuthService.USER_ID_KEY);
    if (stored) return stored;

    // 2. Fallback to JWT claim parsing
    const token = this.tokenService.getAccessToken();
    if (!token) return null;

    // Validate token is not expired before extracting identity
    if (this.isTokenExpired(token)) {
      console.warn('[AuthService] Token is expired. getUserId() returning null.');
      return null;
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      // Claim priority: sub -> nameid -> unique_name -> userId
      const id = payload.sub || payload.nameid || payload.unique_name || payload.userId;
      if (id) {
        // Cache for future calls
        localStorage.setItem(AuthService.USER_ID_KEY, id);
        return id;
      }
      console.warn('[AuthService] No valid user ID claim found in JWT. Claims:', Object.keys(payload));
      return null;
    } catch (e) {
      console.warn('[AuthService] Failed to decode JWT for userId.', e);
      return null;
    }
  }

  /**
   * Extracts the user's display name.
   * Primary source: stored session value.
   * Fallback: JWT claim parsing.
   */
  getUserName(): string {
    const stored = localStorage.getItem(AuthService.USER_NAME_KEY);
    if (stored) return stored;

    const token = this.tokenService.getAccessToken();
    if (!token) return 'User';

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.firstName || payload.name || payload.unique_name || 'User';
    } catch {
      return 'User';
    }
  }

  /**
   * Standalone token expiry check.
   * Separated from getUserId() for single responsibility and testability.
   */
  isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (!payload.exp) return false; // No exp claim = assume valid
      const expiryMs = payload.exp * 1000;
      return Date.now() >= expiryMs;
    } catch {
      return true; // Malformed token = treat as expired
    }
  }

  // -- Auth Actions ------------------------------------------------

  register(req: RegisterRequest) {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    return this.apiService
      .post<ApiResponse<AuthResponse>>('/api/identity/auth/register', req)
      .pipe(
        tap((res) => {
          if (res && res.success) {
            if (res.data?.accessToken && res.data?.refreshToken) {
              this.tokenService.setTokens(res.data.accessToken, res.data.refreshToken);
              this.storeUserSession(res.data);
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
            if (res.data.accessToken && res.data.refreshToken) {
              this.tokenService.setTokens(
                res.data.accessToken,
                res.data.refreshToken
              );
              this.storeUserSession(res.data);
            }
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

  forgotPassword(email: string, purpose: string = 'PasswordReset') {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const req: SendOTPCommand = { email, purpose };
    return this.apiService
      .post<ApiResponse<null>>('/api/identity/auth/forgot-password', req)
      .pipe(
        tap((res) => {
          if (!res.success) {
            this.errorMessage.set(res.message ?? 'Failed to send OTP.');
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

  resetPassword(req: ResetPasswordCommand) {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    return this.apiService
      .post<ApiResponse<null>>('/api/identity/auth/reset-password', req)
      .pipe(
        tap((res) => {
          if (!res.success) {
            this.errorMessage.set(res.message ?? 'Failed to reset password.');
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

  refresh(refreshToken: string) {
    const req: RefreshTokenRequest = { refreshToken };
    return this.apiService
      .post<ApiResponse<AuthResponse>>('/api/identity/auth/refresh', req)
      .pipe(
        tap((res) => {
          if (res.success && res.data) {
            if (res.data.accessToken && res.data.refreshToken) {
              this.tokenService.setTokens(
                res.data.accessToken,
                res.data.refreshToken
              );
              this.storeUserSession(res.data);
            }
          }
        })
      );
  }

  /**
   * Full session teardown:
   *   1. Clear tokens and stored user data.
   *   2. Reset component-level signals.
   *   3. Broadcast reset$ so all feature services purge their state.
   */
  logout(): void {
    this.tokenService.clearTokens();
    localStorage.removeItem(AuthService.USER_ID_KEY);
    localStorage.removeItem(AuthService.USER_NAME_KEY);
    this.currentUser.set(null);
    this.errorMessage.set(null);
    // Broadcast to all feature services
    this.resetBus.reset$.next();
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

  // -- Private Helpers ---------------------------------------------

  /**
   * Stores userId and firstName from the AuthResponse body.
   * This is the primary source for getUserId() - avoids JWT decoding.
   */
  private storeUserSession(data: AuthResponse): void {
    if (data.userId) {
      localStorage.setItem(AuthService.USER_ID_KEY, data.userId);
    }
    if (data.firstName) {
      localStorage.setItem(AuthService.USER_NAME_KEY, data.firstName);
    }
  }
}

