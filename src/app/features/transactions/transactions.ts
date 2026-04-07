import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle/theme-toggle.component';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';

export interface Transaction {
  id: string;
  paymentId: string;
  userId: string;
  amount: number;
  type: string;
  description: string;
  createdAt: string;
  // UI extended properties
  riskBadge?: { score: number; label: string; colorClass: string };
  isLoadingRisk?: boolean;
}

export interface RiskScore {
  id: string;
  userId: string;
  paymentId: string;
  score: number;
  decision: string;
  createdAt: string;
}

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [CommonModule, SidebarComponent, ThemeToggleComponent],
  templateUrl: './transactions.html',
  styleUrl: './transactions.scss'
})
export class TransactionsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  
  transactions = signal<Transaction[]>([]);
  isLoading = signal<boolean>(true);

  ngOnInit(): void {
    this.loadTransactions();
  }

  private loadTransactions(): void {
    this.isLoading.set(true);
    this.http.get<{ success: boolean; data: Transaction[] }>('/api/transactions').pipe(
      map(res => res?.data || []),
      mergeMap(txns => {
        if (!txns.length) return of([]);

        // Initiate parallel requests to fetch risk score for each transaction if it's a payment
        const txnsWithRisk$: Observable<Transaction>[] = txns.map(txn => {
          if (txn.type === 'Payment' && txn.paymentId) {
            txn.isLoadingRisk = true;
            return this.http.get<{ success: boolean; data: RiskScore }>(`/api/transactions/risk/${txn.paymentId}`).pipe(
              map(riskRes => {
                const risk = riskRes?.data;
                if (risk) {
                  txn.riskBadge = this.calculateRiskBadge(risk.score);
                }
                txn.isLoadingRisk = false;
                return txn;
              }),
              catchError(() => {
                txn.isLoadingRisk = false;
                return of(txn); // Ignore error, show without risk
              })
            );
          }
          return of(txn);
        });

        return forkJoin(txnsWithRisk$);
      }),
      catchError(() => {
        return of([]);
      })
    ).subscribe({
      next: (data) => {
        this.transactions.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.transactions.set([]);
        this.isLoading.set(false);
      }
    });
  }

  private calculateRiskBadge(score: number): { score: number; label: string; colorClass: string } {
    if (score <= 30) {
      return { score, label: 'Low', colorClass: 'badge-low' };
    } else if (score <= 60) {
      return { score, label: 'Medium', colorClass: 'badge-medium' };
    } else {
      return { score, label: 'High', colorClass: 'badge-high' };
    }
  }
}
