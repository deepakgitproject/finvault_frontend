import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-cards',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './cards.html',
  styleUrl: './cards.scss'
})
export class CardsComponent {
  cards = [
    {
      type: 'INFINITE',
      typeColor: 'var(--primary)',
      icon: 'contactless',
      number: '4532 8841 0092 1145',
      holder: 'ALEX STERLING',
      expires: '12/28',
      bgClass: 'card-infinite',
      limitUsed: '$12,450',
      limitTotal: '$50,000',
      usagePercent: 25,
      barBg: '#22C55E' // < 30% green
    },
    {
      type: 'ELITE BUSINESS',
      typeColor: 'var(--secondary)',
      icon: 'diamond',
      number: '7721 4490 2210 5582',
      holder: 'ALEX STERLING',
      expires: '06/26',
      bgClass: 'card-elite',
      limitUsed: '$42,900',
      limitTotal: '$45,000',
      usagePercent: 95,
      barBg: '#EF4444' // > 80% error
    },
    {
      type: 'RESERVE PLATINUM',
      typeColor: '#65a30d', // olive
      icon: 'portrait',
      number: '3310 9928 4401 0029',
      holder: 'ALEX STERLING',
      expires: '01/30',
      bgClass: 'card-platinum',
      limitUsed: '$2,100',
      limitTotal: '$100,000',
      usagePercent: 2,
      barBg: '#22C55E' // < 30%
    }
  ];

  transactions = [
    {
      title: 'Luxury Travel Inc.',
      subtitle: 'Midnight Infinite Card • 2 hours ago',
      amount: '-$1,240.00',
      icon: 'shopping_bag',
      bgClass: 'bg-green'
    },
    {
      title: 'Aurelia Dining',
      subtitle: 'Platinum Lavender Card • Yesterday',
      amount: '-$342.50',
      icon: 'restaurant',
      bgClass: 'bg-purple'
    },
    {
      title: 'Cloud Infrastructure',
      subtitle: 'Midnight Infinite Card • 2 days ago',
      amount: '-$89.99',
      icon: 'bolt',
      bgClass: 'bg-indigo'
    }
  ];
}
