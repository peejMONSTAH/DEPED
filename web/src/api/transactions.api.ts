import apiClient from './client';
import type { ApiResponse, Transaction, ChecklistItem } from '../types';

export const transactionsApi = {
  getAll: (params?: Record<string, unknown>) =>
    apiClient.get<ApiResponse<Transaction[]>>('/transactions', { params }),

  getById: (id: number) =>
    apiClient.get<ApiResponse<Transaction>>(`/transactions/${id}`),

  create: (type: string, notes?: string) =>
    apiClient.post<ApiResponse<Transaction>>('/transactions', { type, notes }),

  submit: (id: number) =>
    apiClient.put<ApiResponse<Transaction>>(`/transactions/${id}/submit`),

  validate: (id: number, documentValidations: unknown[], overallValidationStatus: string) =>
    apiClient.post<ApiResponse<Transaction>>(`/transactions/${id}/validate`, {
      documentValidations, overallValidationStatus,
    }),

  approve: (id: number, isApproved: boolean, notes?: string) =>
    apiClient.post<ApiResponse<Transaction>>(`/transactions/${id}/approve`, { isApproved, notes }),

  getRequirements: (id: number) =>
    apiClient.get<ApiResponse<ChecklistItem[]>>(`/transactions/${id}/requirements`),
};

export const transactionTypesApi = {
  getAll: () =>
    apiClient.get<ApiResponse<{ id: number; name: string; description?: string }[]>>('/transaction-types'),
};
