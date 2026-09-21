import apiClient from './client';
import type { ApiResponse } from '../types';

/**
 * Typed wrappers for the promotion endpoints.
 *
 * Most `apiClient` calls still sit inline in page components and are untyped; new
 * reads should go through a module like this one so the response shape is checked
 * in one place rather than re-asserted at every call site.
 */

export interface PromotionCycleSummary {
  id: number;
  name: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  rulesConfigurationJson?: Record<string, unknown> | null;
}

export interface RankingRow {
  applicationId: number;
  personnelId: number;
  name: string;
  employeeId: string;
  designation: string;
  station: string;
  rank: number;
  totalScore: number;
  status: string;
  hasAoRating: boolean;
  hasHrmoRating: boolean;
}

export const promotionsApi = {
  async listCycles(params?: { status?: string; search?: string }): Promise<PromotionCycleSummary[]> {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.search) query.append('search', params.search);
    const res = await apiClient.get<ApiResponse<PromotionCycleSummary[]>>(`/promotions/cycles?${query.toString()}`);
    return res.data.data ?? [];
  },

  async listApplications(cycleId: number): Promise<unknown[]> {
    const res = await apiClient.get<ApiResponse<unknown[]>>(`/promotions/cycles/${cycleId}/applications`);
    return res.data.data ?? [];
  },

  async rankingResults(cycleId: number): Promise<RankingRow[]> {
    const res = await apiClient.get<ApiResponse<RankingRow[]>>(`/promotions/cycles/${cycleId}/ranking-results`);
    return res.data.data ?? [];
  },

  async generateRanking(cycleId: number): Promise<{ totalRanked: number }> {
    const res = await apiClient.post<ApiResponse<{ totalRanked: number }>>(`/promotions/cycles/${cycleId}/generate-ranking`, {});
    return res.data.data ?? { totalRanked: 0 };
  },
};
