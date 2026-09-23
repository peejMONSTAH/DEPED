import { QueryClient } from '@tanstack/react-query';

/**
 * Shared query client.
 *
 * This is the seam for retiring the useState + useEffect + manual-loading-flag
 * pattern. New data reads should use `useQuery`; existing pages migrate when they
 * are being edited for another reason.
 *
 * Retries are disabled for 4xx — a 403 from station scoping or a 400 from validation
 * will never succeed on a second attempt, and retrying only delays the error.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

/**
 * Drops every cached response. Called whenever the signed-in identity changes
 * (sign-in, sign-out, magic link, an ended session). Query keys do not carry
 * the account or its station, so without this the next person on a shared
 * browser would briefly be shown the previous account's records.
 */
export const resetClientCaches = (): void => {
  void queryClient.cancelQueries();
  queryClient.clear();
};

/** Query keys in one place so invalidation cannot drift from the queries it targets. */
export const queryKeys = {
  notifications: ['notifications'] as const,
  personnel: (params?: Record<string, unknown>) => ['personnel', params ?? {}] as const,
  transactions: (params?: Record<string, unknown>) => ['transactions', params ?? {}] as const,
  promotionCycles: (params?: Record<string, unknown>) => ['promotion-cycles', params ?? {}] as const,
  promotionApplications: (cycleId: number) => ['promotion-applications', cycleId] as const,
  rankingResults: (cycleId: number) => ['ranking-results', cycleId] as const,
};
