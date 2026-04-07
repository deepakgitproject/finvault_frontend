export interface Card {
  id?: string;
  userId?: string;
  maskedNumber: string;
  cardholderName: string;
  expiryMonth: number;
  expiryYear: number;
  issuerName: string;
  creditLimit: number;
  currentBalance?: number;
  billingCycleStartDay: number;
  isDefault?: boolean;
  isVerified?: boolean;
}

export interface AddCardCommand {
  userId?: string;
  cardNumber: string;
  cvv: string;
  cardholderName: string;
  expiryMonth: number;
  expiryYear: number;
  issuerName: string;
  creditLimit: number;
  billingCycleStartDay: number;
}

export interface UpdateLimitRequest {
  newLimit: number;
}

export interface RevealCardResponse {
  id: string;
  cardNumber: string;
  cvv: string;
  cardholderName: string;
  expiryMonth: number;
  expiryYear: number;
  issuerName: string;
}

