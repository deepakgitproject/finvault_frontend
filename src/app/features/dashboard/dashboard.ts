import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent {
  // Hardcoded statistical data
  totalBalance = "$12,450.80";
  balanceChange = "+12.4% from last month";
  
  upcomingBillTitle = "Mortgage & Utilities";
  upcomingBillAmount = "$345.00";
  upcomingBillDue = "Due in 2 days";

  rewardPoints = "4,850";
  rewardValue = "$48.50";

  cards = [
    {
      name: 'Bank Platinum',
      type: 'contactless',
      number: '**** **** **** 8829',
      expiry: '12/28',
      usage: 65,
      gradient: 'linear-gradient(135deg, #1e293b, #0f172a)',
      barColor: 'var(--primary)'
    },
    {
      name: 'Travel Rewards',
      type: 'travel_explore',
      number: '**** **** **** 4492',
      expiry: '08/26',
      usage: 22,
      gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
      barColor: '#FBBF24'
    },
    {
      name: 'Daily Cashback',
      type: 'account_balance',
      number: '**** **** **** 1105',
      expiry: '10/25',
      usage: 88,
      gradient: 'linear-gradient(135deg, #10b981, #14b8a6)',
      barColor: 'var(--error)'
    }
  ];

  barHeights = ['32px', '48px', '64px', '96px', '80px', '56px', '40px'];
}