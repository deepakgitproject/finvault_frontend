import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

export interface Bill {
    id: number;
    title: string;
    subtitle: string;
    icon: string;
    iconBg: string;
    totalDue: string;
    secondaryAmount: string;
    secondaryLabel: string;
    status: 'OVERDUE' | 'PENDING' | 'PAID';
    actionIcon: string;
    actionStyle: 'primary' | 'muted';
}

export interface BillGroup {
    month: string;
    badgeLabel: string;
    badgeType: 'error' | 'muted';
    faded: boolean;
    bills: Bill[];
}

@Component({
    selector: 'app-bills',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './bills.html',
    styleUrls: ['./bills.scss'],
})
export class BillsComponent {
    activeFilter = signal<string>('All Status');

    filters = ['All Status', 'Pending', 'Paid'];

    billGroups: BillGroup[] = [
        {
            month: 'October 2023',
            badgeLabel: '3 PENDING',
            badgeType: 'error',
            faded: false,
            bills: [
                {
                    id: 1,
                    title: 'Sapphire Reserve',
                    subtitle: 'STATEMENT DATE: OCT 12, 2023',
                    icon: 'credit_card',
                    iconBg: 'blue',
                    totalDue: '$1,240.00',
                    secondaryAmount: '$45.00',
                    secondaryLabel: 'MIN. DUE',
                    status: 'OVERDUE',
                    actionIcon: 'arrow_forward',
                    actionStyle: 'primary',
                },
                {
                    id: 2,
                    title: 'City Power & Light',
                    subtitle: 'ACCOUNT: #9928-112',
                    icon: 'bolt',
                    iconBg: 'purple',
                    totalDue: '$245.82',
                    secondaryAmount: '$0.00',
                    secondaryLabel: 'AMOUNT PAID',
                    status: 'PENDING',
                    actionIcon: 'wallet',
                    actionStyle: 'muted',
                },
                {
                    id: 3,
                    title: 'Fiber Optic Pro',
                    subtitle: 'NEXT CYCLE: NOV 01, 2023',
                    icon: 'language',
                    iconBg: 'green',
                    totalDue: '$89.99',
                    secondaryAmount: '$89.99',
                    secondaryLabel: 'AMOUNT PAID',
                    status: 'PAID',
                    actionIcon: 'check_circle',
                    actionStyle: 'muted',
                },
            ],
        },
        {
            month: 'September 2023',
            badgeLabel: 'COMPLETED',
            badgeType: 'muted',
            faded: true,
            bills: [
                {
                    id: 4,
                    title: 'Skyline Management',
                    subtitle: 'RENT SEPTEMBER',
                    icon: 'apartment',
                    iconBg: 'grey',
                    totalDue: '$3,450.00',
                    secondaryAmount: '$3,450.00',
                    secondaryLabel: 'AMOUNT PAID',
                    status: 'PAID',
                    actionIcon: 'history',
                    actionStyle: 'muted',
                },
            ],
        },
    ];

    setFilter(filter: string) {
        this.activeFilter.set(filter);
    }
}