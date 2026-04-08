import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface ExternalBillRequest {
    CardId: string;
    Email: string;
    BillerName: string;
    BillerCategory: string;
    BillNumber: string;
    Amount: number;
}

export interface ExternalBillResponse {
    id: string;
    [key: string]: any;
}

@Injectable({
    providedIn: 'root',
})
export class ExternalBillService {
    private readonly apiService = inject(ApiService);

    payBill(payload: ExternalBillRequest): Observable<ExternalBillResponse> {
        return this.apiService.post<ExternalBillResponse>('/api/external-bills/pay', payload);
    }

    verifyOtp(billId: string, otpCode: string): Observable<any> {
        return this.apiService.put<any>(`/api/external-bills/${billId}/verify`, { OtpCode: otpCode });
    }

    getHistory(): Observable<any[]> {
        return this.apiService.get<any[]>('/api/external-bills');
    }
}
