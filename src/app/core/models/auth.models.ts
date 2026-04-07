export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface VerifyEmailRequest {
  userId: string;
  otpCode: string;
}

export interface SendOTPCommand {
  email: string;
  purpose: string;
}

export interface ResetPasswordCommand {
  email: string;
  otpCode: string;
  newPassword: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface AuthResponse {
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn: number;
  userId: string;
  email: string | null;
  firstName: string | null;
  role: string | null;
  isEmailVerified: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string | null;
  data: T | null;
  errors: string[] | null;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

