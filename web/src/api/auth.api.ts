import apiClient from './client';
import type { ApiResponse, LoginResponse } from '../types';

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<ApiResponse<LoginResponse>>('/auth/login', { email, password }),

  refreshToken: (refreshToken: string) =>
    apiClient.post<ApiResponse<{ accessToken: string }>>('/auth/refresh-token', { refreshToken }),

  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refreshToken }),

  magicLogin: (token: string) =>
    apiClient.post<ApiResponse<LoginResponse & { txId?: number }>>('/auth/magic-login', { token }),
  /** Sets the first password from an emailed setup link and signs the user in. */
  completeSetup: (token: string, newPassword: string) =>
    apiClient.post<ApiResponse<LoginResponse>>('/auth/complete-setup', { token, newPassword }),
};

