import apiClient from './client';

/** Read each server page instead of assuming that an oversized limit is honored. */
export async function getAllPages<T = any>(url: string): Promise<T[]> {
  const result: T[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await apiClient.get(url, { params: { page, limit: 100 } });
    result.push(...(response.data?.data || []));
    totalPages = response.data?.pagination?.totalPages || 1;
    page++;
  } while (page <= totalPages);
  return result;
}
