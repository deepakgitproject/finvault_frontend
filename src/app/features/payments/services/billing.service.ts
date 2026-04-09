import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface GenerateBillRequest {
  UserId: string;
  CardId: string;
  TotalAmount: number;
  MinimumDue: number;
  DueDate: string;
  BillingMonth: string;
}

@Injectable({
  providedIn: 'root'
})
export class BillingService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  createBill(payload: GenerateBillRequest): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/api/billing/bills`, payload);
  }

  getBillsForUser(userId: string, status?: string): Observable<any> {
    let url = `${this.apiUrl}/api/billing/bills/user/${userId}`;
    if (status) {
      url += `?status=${status}`;
    }
    return this.http.get<any>(url);
  }

  getUpcomingBills(userId: string, days: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/api/billing/bills/user/${userId}/upcoming?days=${days}`);
  }
}
