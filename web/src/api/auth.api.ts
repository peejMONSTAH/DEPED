import apiClient from './client';
import type { ApiResponse, LoginResponse } from '../types';

/** Proves this browser passed an emailed sign-in code; kept across sign-outs. */
export const DEVICE_TOKEN_KEY = 'deviceToken';
export const getDeviceToken = () => localStorage.getItem(DEVICE_TOKEN_KEY) || undefined;

export interface VerificationChallenge {
  requiresVerification: true;
  challengeToken: string;
  maskedEmail: string;
  resendAfterSeconds: number;
}

export interface TrustedDevice {
  id: number;
  label: string;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

type SignIn = LoginResponse & { deviceToken?: string };

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<ApiResponse<SignIn | VerificationChallenge>>('/auth/login', { email, password, deviceToken: getDeviceToken() }),

  verifyDevice: (challengeToken: string, code: string) =>
    apiClient.post<ApiResponse<SignIn>>('/auth/verify-device', { challengeToken, code }),

  resendCode: (challengeToken: string) =>
    apiClient.post<ApiResponse<{ resendAfterSeconds: number }>>('/auth/resend-code', { challengeToken }),

  devices: () => apiClient.get<ApiResponse<TrustedDevice[]>>('/auth/devices'),

  removeDevice: (id: number) => apiClient.delete(`/auth/devices/${id}`),

  refreshToken: (refreshToken: string) =>
    apiClient.post<ApiResponse<{ accessToken: string }>>('/auth/refresh-token', { refreshToken }),

  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refreshToken }),

  magicLogin: (token: string) =>
    apiClient.post<ApiResponse<SignIn & { txId?: number }>>('/auth/magic-login', { token }),
  /** Sets the first password from an emailed setup link and signs the user in. */
  completeSetup: (token: string, newPassword: string) =>
    apiClient.post<ApiResponse<SignIn>>('/auth/complete-setup', { token, newPassword }),
};
