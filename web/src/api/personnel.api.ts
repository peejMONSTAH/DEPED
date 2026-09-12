import apiClient from './client';
import type { ApiResponse, Personnel } from '../types';

export const personnelApi = {
  getMyProfile: () =>
    apiClient.get<ApiResponse<Personnel>>('/personnel/me'),

  updateMyProfile: (data: Partial<Personnel>) =>
    apiClient.put<ApiResponse<Personnel>>('/personnel/me', data),

  getAll: (params?: Record<string, unknown>) =>
    apiClient.get<ApiResponse<Personnel[]>>('/personnel', { params }),

  getById: (id: number) =>
    apiClient.get<ApiResponse<Personnel>>(`/personnel/${id}`),
};
