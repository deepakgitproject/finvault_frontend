import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

/**
 * Error interceptor - handles non-401 HTTP errors.
 * 401 handling is now fully managed by authInterceptor (silent refresh + retry).
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((err) => {
      // 401 is handled by authInterceptor - do not duplicate here
      if (err.status !== 401) {
        // Log non-auth errors for debugging
        if (err.status === 0) {
          console.warn('[ErrorInterceptor] Network error or CORS issue:', req.url);
        } else if (err.status >= 500) {
          console.error('[ErrorInterceptor] Server error:', err.status, req.url);
        }
      }
      return throwError(() => err);
    })
  );
};

