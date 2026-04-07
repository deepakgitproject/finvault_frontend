import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GlobalUiService } from '../../../core/services/global-ui.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (globalUi.currentToast(); as toast) {
      <div class="toast-wrapper" [class]="'toast-wrapper--' + toast.type" (click)="globalUi.dismiss()">
        <span class="material-symbols-outlined toast-icon">
          {{ toast.type === 'success' ? 'check_circle' : toast.type === 'error' ? 'error' : 'info' }}
        </span>
        <span class="toast-msg">{{ toast.message }}</span>
        <button class="toast-close" (click)="$event.stopPropagation(); globalUi.dismiss()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    }
  `,
  styles: [`
    .toast-wrapper {
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 20px;
      min-width: 320px;
      max-width: 480px;
      border-radius: 12px;
      backdrop-filter: blur(16px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
      cursor: pointer;
      animation: toastSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      color: #fff;
    }

    .toast-wrapper--success {
      background: linear-gradient(135deg, rgba(34, 197, 94, 0.92), rgba(22, 163, 74, 0.92));
      border: 1px solid rgba(34, 197, 94, 0.3);
    }

    .toast-wrapper--error {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.92), rgba(220, 38, 38, 0.92));
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .toast-wrapper--info {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.92), rgba(37, 99, 235, 0.92));
      border: 1px solid rgba(59, 130, 246, 0.3);
    }

    .toast-icon {
      font-size: 22px;
      flex-shrink: 0;
    }

    .toast-msg {
      flex: 1;
      font-weight: 500;
      line-height: 1.35;
    }

    .toast-close {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.7);
      cursor: pointer;
      padding: 2px;
      display: flex;
      transition: color 0.2s;
    }

    .toast-close:hover {
      color: #fff;
    }

    .toast-close .material-symbols-outlined {
      font-size: 18px;
    }

    @keyframes toastSlideIn {
      from {
        opacity: 0;
        transform: translateX(40px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
    }
  `]
})
export class ToastComponent {
  public readonly globalUi = inject(GlobalUiService);
}

