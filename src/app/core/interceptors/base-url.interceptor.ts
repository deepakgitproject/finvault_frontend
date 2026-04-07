import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * BaseUrlInterceptor - Prepends the Gateway URL to all requests starting with '/api/'.
 * This ensures consistency across the app, including direct HttpClient calls.
 */
export const baseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  const apiUrl = environment.apiUrl;

  // Only prepend if the URL starts with /api/ and is relative
  if (req.url.startsWith('/api/') && !req.url.startsWith('http')) {
    const cleanBase = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    const clonedReq = req.clone({
      url: `${cleanBase}${req.url}`
    });
    return next(clonedReq);
  }

  return next(req);
};

