import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';

/**
 * Functional auth guard - redirects to /auth/login if no access token is found
 * in localStorage. Used by all protected feature routes.
 */
export const authGuard: CanActivateFn = () => {
  const token = localStorage.getItem('fv_access_token');
  if (!token) {
    inject(Router).navigate(['/auth/login']);
    return false;
  }
  return true;
};

