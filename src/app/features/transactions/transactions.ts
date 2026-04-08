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
  searchTerm = signal<string>('');

  // Pagination State
  currentPage = signal<number>(1);
  pageSize = 25;

  // Header Statistics
  stats = computed(() => {
    const list = this.rawTransactions();
    const total = list.reduce((acc, t) => t.type !== 'Reversal' ? acc + t.amount : acc - t.amount, 0);
    const count = list.length;
    
    // Quick month stats
    const now = new Date();
    const monthTxns = list.filter(t => {
      const d = new Date(t.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthlySpending = monthTxns.reduce((acc, t) => t.type !== 'Reversal' ? acc + t.amount : acc - t.amount, 0);

    return { total, count, monthlySpending };
  });

  // Reactive enrichment: updates when cards or transactions change
  enrichedTransactions = computed(() => {
    const txns = this.rawTransactions();
    const cards = this.cardService.cards();
    
    return txns.map(txn => {
      const rawCardId = txn.cardId || (txn as any).CardId || (txn as any).CardID;
      const enriched = { ...txn };
      
      if (rawCardId) {
        const tid = String(rawCardId).toLowerCase().replace(/-/g, '');
        const cardMatch = cards.find(c => (c.id || '').toLowerCase().replace(/-/g, '') === tid);
        if (cardMatch) {
          enriched.cardDisplay = `${cardMatch.issuerName} •••• ${cardMatch.maskedNumber.slice(-4)}`;
        }
      }
      return enriched;
    });
  });

  // Derived filtered transactions (Category + Search Search)
  filteredTransactions = computed(() => {
    let list = this.enrichedTransactions();
    const cat = this.selectedCategory();
    const term = this.searchTerm().toLowerCase().trim();
    
    // 1. Category Filter
    if (cat === 'bills') {
      list = list.filter(t => 
        (t.categoryLabel || '').toLowerCase().includes('bill') || 
        (t.description || '').toLowerCase().includes('bill')
      );
    } else if (cat === 'payments') {
      list = list.filter(t => 
        !(t.categoryLabel || '').toLowerCase().includes('bill') && 
        !(t.description || '').toLowerCase().includes('bill')
      );
    }

    // 2. Keyword Search
    if (term) {
      list = list.filter(t => 
        (t.description || '').toLowerCase().includes(term) ||
        (t.paymentId || '').toLowerCase().includes(term) ||
        (t.id || '').toLowerCase().includes(term) ||
        (t.categoryLabel || '').toLowerCase().includes(term) ||
        (t.cardDisplay || '').toLowerCase().includes(term)
      );
    }

    return list;
  });

  // Paginated View
  transactions = computed(() => {
    const list = this.filteredTransactions();
    const start = (this.currentPage() - 1) * this.pageSize;
    return list.slice(start, start + this.pageSize);
  });

  totalPages = computed(() => Math.ceil(this.filteredTransactions().length / this.pageSize));

  ngOnInit(): void {
    this.cardService.refreshCards();
    this.refreshTransactions();
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchTerm.set(input.value);
    this.currentPage.set(1);
  }

  setCategory(cat: string): void {
    this.selectedCategory.set(cat);
    this.currentPage.set(1); // Reset to first page on filter change
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async downloadTransactionsPDF() {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape
    
    // Header
    doc.setFillColor(35, 21, 60);
    doc.rect(0, 0, 297, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('FinVault Transaction Statement', 15, 20);
    
    doc.setFontSize(10);
    doc.text(`Page ${this.currentPage()} of ${this.totalPages()}`, 250, 20);

    // Table Setup
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    let y = 45;
    
    // Table Header
    doc.setFont('helvetica', 'bold');
    doc.text('DATE', 15, y);
    doc.text('DESCRIPTION & TRANSACTION ID', 45, y);
    doc.text('FUNDING SOURCE', 140, y);
    doc.text('AMOUNT', 240, y);
    
    y += 8;
    doc.line(15, y - 4, 282, y - 4);
    doc.setFont('helvetica', 'normal');

    const list = this.transactions();
    list.forEach(t => {
      if (y > 185) {
        doc.addPage();
        y = 30; // Margin for new page
      }
      
      const date = new Date(t.createdAt).toLocaleDateString();
      const amount = (t.type === 'Reversal' ? '+' : '-') + 'Rs.' + t.amount.toLocaleString();
      const card = t.cardDisplay || 'Vault Central Wallet';
      const tid = t.paymentId || t.id || 'N/A';
      
      doc.setFontSize(10);
      doc.text(date, 15, y);
      
      doc.setFont('helvetica', 'bold');
      doc.text((t.description || t.categoryLabel || 'Payment').substring(0, 45), 45, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`ID: ${tid}`, 45, y + 4);
      
      doc.setFontSize(10);
      doc.text(card, 140, y);
      doc.text(amount, 240, y);
      
      y += 12;
    });

    doc.save(`FinVault_Transactions_Page_${this.currentPage()}.pdf`);
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
