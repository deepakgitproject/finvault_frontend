import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/home/home').then(m => m.HomeComponent)
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard').then(m => m.DashboardComponent)
  },
  {
    path: 'auth/login',
    loadComponent: () =>
      import('./features/auth/login/login').then(m => m.LoginComponent)
  },
  {
    path: 'auth/register',
    loadComponent: () =>
      import('./features/auth/register/register').then(m => m.RegisterComponent)
  },

  {
    path: 'cards',
    loadComponent: () =>
      import('./features/cards/cards').then(m => m.CardsComponent)
  },
  {
    path: 'bills',
    loadComponent: () =>
      import('./features/billing/bills-list/bills').then(m => m.BillsComponent)
  },
  {
    path: 'payments',
    loadComponent: () =>
      import('./features/payments/pay-bill/pay-bill').then(m => m.PayBillComponent)
  },
  {
    path: 'notifications',
    loadComponent: () =>
      import('./features/notifications/notifications').then(m => m.NotificationsComponent)
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./features/profile/profile').then(m => m.ProfileComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];