import apiClient from './client';
import type { ApiResponse, Notification } from '../types';

export const notificationsApi = {
  getAll: (params?: { status?: 'read' | 'unread' }) =>
    apiClient.get<ApiResponse<Notification[]>>('/notifications', { params }),

  markAsRead: (id: number) =>
    apiClient.put<ApiResponse<null>>(`/notifications/${id}/read`),

  markAllRead: () =>
    apiClient.put<ApiResponse<null>>('/notifications/read-all'),
};
