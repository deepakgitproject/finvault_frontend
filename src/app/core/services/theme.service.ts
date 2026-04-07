import { Injectable, signal, effect } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly STORAGE_KEY = 'fv_theme';
  
  // Initialize from localStorage immediately
  darkMode = signal<boolean>(localStorage.getItem(this.STORAGE_KEY) === 'dark');

  constructor() {
    // Apply theme on instantiation to sync signal with DOM
    this.applyTheme(this.darkMode());
    
    // Auto-persist changes using an effect
    effect(() => {
      const isDark = this.darkMode();
      this.applyTheme(isDark);
      localStorage.setItem(this.STORAGE_KEY, isDark ? 'dark' : 'light');
    });
  }

  toggleTheme(): void {
    this.darkMode.update(v => !v);
  }

  private applyTheme(isDark: boolean): void {
    const html = document.documentElement;
    if (isDark) {
      html.setAttribute('data-theme', 'dark');
    } else {
      html.removeAttribute('data-theme');
    }
  }
}

