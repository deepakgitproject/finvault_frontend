import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, throwError, Observable } from 'rxjs';
import { catchError, filter, switchMap, take, takeUntil } from 'rxjs/operators';
import { TokenService } from '../services/token.service';
import { ApiService } from '../services/api.service';
import { ResetBusService } from '../services/reset-bus.service';
import { environment } from '../../../environments/environment';

/**
 * Shared state for the concurrent 401 guard.
 * Only ONE refresh attempt runs at a time - all other 401s queue behind it.
 */
let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const apiService = inject(ApiService);
  const router = inject(Router);
  const resetBus = inject(ResetBusService);

  const isAuthEndpoint = req.url.includes('/auth/');
  // Check if it's a Gateway request (starts with apiUrl)
  const isGatewayRequest = req.url.startsWith(environment.apiUrl);
  // Skip the refresh call itself to prevent recursion/failures
  const isRefreshCall = req.url.includes('/auth/refresh');

  const token = tokenService.getAccessToken();
  let authReq = req;

  if (token && isGatewayRequest && !isRefreshCall) {
    authReq = addTokenHeader(req, token);
  }

  return next(authReq).pipe(
    // Cancel in-flight requests when the ResetBus fires (logout)
    takeUntil(resetBus.reset$),
    catchError((error) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !isAuthEndpoint) {
        return handle401Error(authReq, next, tokenService, apiService, router, resetBus);
      }
      return throwError(() => error);
    })
  );
};

function addTokenHeader(req: HttpRequest<any>, token: string): HttpRequest<any> {
  return req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Handles 401 errors with a concurrent guard:
 *   - If no refresh is in progress: start one.
 *   - If a refresh IS in progress: queue behind it.
 *   - On success: retry the original request with the new token.
 *   - On failure: hard redirect to /login.
 */
function handle401Error(
  req: HttpRequest<any>,
  next: HttpHandlerFn,
  tokenService: TokenService,
  apiService: ApiService,
  router: Router,
  resetBus: ResetBusService
): Observable<any> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    const refreshToken = tokenService.getRefreshToken();
    if (!refreshToken) {
      return forceLogout(tokenService, router, resetBus);
    }

    return apiService.post<any>('/api/identity/auth/refresh', { refreshToken }).pipe(
      switchMap((res) => {
        isRefreshing = false;

        const data = res?.data ?? res;
        if (data?.accessToken && data?.refreshToken) {
          tokenService.setTokens(data.accessToken, data.refreshToken);
          refreshTokenSubject.next(data.accessToken);

          // Store updated userId if present
          if (data.userId) {
            localStorage.setItem('fv_user_id', data.userId);
          }

          // Retry the original failed request with the new token
          return next(addTokenHeader(req, data.accessToken));
        }

        return forceLogout(tokenService, router, resetBus);
      }),
      catchError(() => {
        isRefreshing = false;
        return forceLogout(tokenService, router, resetBus);
      })
    );
  }

  // Another refresh is already in progress - queue this request
  return refreshTokenSubject.pipe(
    filter((token) => token !== null),
    take(1),
    switchMap((newToken) => {
      return next(addTokenHeader(req, newToken!));
    })
  );
}

function forceLogout(
  tokenService: TokenService,
  router: Router,
  resetBus: ResetBusService
): Observable<never> {
  tokenService.clearTokens();
  localStorage.removeItem('fv_user_id');
  localStorage.removeItem('fv_user_name');
  resetBus.reset$.next();
  router.navigate(['/auth/login']);
  return throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Session expired' }));
}

