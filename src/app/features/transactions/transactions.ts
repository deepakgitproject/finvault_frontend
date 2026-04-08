import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle/theme-toggle.component';
import { CardService } from '../../core/services/card.service';
import { TransactionService, Transaction } from '../../core/services/transaction.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [CommonModule, SidebarComponent, ThemeToggleComponent],
  templateUrl: './transactions.html',
  styleUrl: './transactions.scss'
})
export class TransactionsComponent implements OnInit {
  private readonly transactionService = inject(TransactionService);
  public readonly cardService = inject(CardService);
  public readonly authService = inject(AuthService);
  
  public rawTransactions = signal<Transaction[]>([]);
  isLoading = signal<boolean>(true);
  isSyncing = this.transactionService.isSyncing;
  selectedCategory = signal<string>('all');

  // Derived filtered transactions
  transactions = computed(() => {
    const list = this.rawTransactions();
    const cat = this.selectedCategory();
    
    if (cat === 'all') return list;
    
    if (cat === 'bills') {
      return list.filter(t => 
        (t.categoryLabel || '').toLowerCase().includes('bill') || 
        (t.description || '').toLowerCase().includes('bill')
      );
    }
    
    if (cat === 'payments') {
      return list.filter(t => 
        !(t.categoryLabel || '').toLowerCase().includes('bill') && 
        !(t.description || '').toLowerCase().includes('bill')
      );
    }

    return list;
  });

  ngOnInit(): void {
    this.cardService.refreshCards();
    this.refreshTransactions();
  }

  setCategory(cat: string): void {
    this.selectedCategory.set(cat);
  }

  refreshTransactions(): void {
    this.isLoading.set(true);
    this.transactionService.getTransactions().subscribe({
      next: (data) => {
        this.rawTransactions.set(data);
        this.isLoading.set(false);

        // Hybrid Sync Strategy: Auto-sync only if transaction list is empty
        if (data.length === 0) {
          this.triggerSync();
        } else {
          // Fetch risk scores for each payment transaction in the background
          this.loadRiskScores(data);
        }
      },
      error: () => {
        this.rawTransactions.set([]);
        this.isLoading.set(false);
      }
    });
  }

  triggerSync(): void {
    this.transactionService.syncTransactions().subscribe({
      next: () => {
        // Reload transactions after success
        this.refreshTransactions();
      }
    });
  }

  private loadRiskScores(txns: Transaction[]): void {
    const paymentTxns = txns.filter(t => t.type === 'Payment' && t.paymentId && !t.riskBadge);
    
    if (paymentTxns.length === 0) return;

    // Fetch risk scores in chunks or all at once (since it's background logic)
    paymentTxns.forEach(txn => {
      txn.isLoadingRisk = true;
      this.transactionService.getRiskScore(txn.paymentId).subscribe({
        next: (risk) => {
          if (risk && risk.score !== undefined) {
            txn.riskBadge = this.calculateRiskBadge(risk.score);
          }
          txn.isLoadingRisk = false;
          // Update the signal to trigger UI refresh
          this.rawTransactions.set([...this.rawTransactions()]);
        },
        error: () => {
          txn.isLoadingRisk = false;
        }
      });
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
