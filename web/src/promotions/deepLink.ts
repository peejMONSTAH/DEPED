/**
 * Links from a promotion notification to the exact cycle and application.
 *
 * The link carries ids only. The Promotions page resolves them against the
 * cycle and application lists it already fetched through station-scoped
 * endpoints, so a hand-edited URL can never reveal a record the server would
 * not list for that account; it just reports the target as unavailable.
 */

export const PROMOTIONS_PATH = '/admin/promotions';

export interface PromotionTarget {
  cycleId: number;
  applicationId?: number;
}

interface NotificationLike {
  relatedEntityType?: string | null;
  relatedEntityId?: number | null;
  promotionCycleId?: number | null;
  promotionApplicationId?: number | null;
}

const positiveId = (value: unknown): number | undefined => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
};

export const promotionTargetFromNotification = (n: NotificationLike): PromotionTarget | null => {
  const entity = (n.relatedEntityType || '').toLowerCase();
  const cycleId = positiveId(n.promotionCycleId) ?? (entity === 'promotioncycle' ? positiveId(n.relatedEntityId) : undefined);
  if (!cycleId) return null;
  const applicationId = positiveId(n.promotionApplicationId) ?? (entity === 'promotionapplication' ? positiveId(n.relatedEntityId) : undefined);
  return applicationId ? { cycleId, applicationId } : { cycleId };
};

export const promotionTargetPath = (target: PromotionTarget | null): string => {
  if (!target) return PROMOTIONS_PATH;
  const params = new URLSearchParams({ cycleId: String(target.cycleId) });
  if (target.applicationId) params.set('applicationId', String(target.applicationId));
  return `${PROMOTIONS_PATH}?${params.toString()}`;
};

export const notificationPromotionPath = (n: NotificationLike): string =>
  promotionTargetPath(promotionTargetFromNotification(n));

/** Malformed ids are ignored, so a bad link falls back to the plain cycle list. */
export const parsePromotionTarget = (params: URLSearchParams): PromotionTarget | null => {
  const cycleId = positiveId(params.get('cycleId'));
  if (!cycleId) return null;
  const applicationId = positiveId(params.get('applicationId'));
  return applicationId ? { cycleId, applicationId } : { cycleId };
};

export type CycleResolution<C> = { kind: 'found'; cycle: C } | { kind: 'unavailable'; message: string };

export const resolveTargetCycle = <C extends { id: number }>(target: PromotionTarget, cycles: C[]): CycleResolution<C> => {
  const cycle = cycles.find(c => c.id === target.cycleId);
  return cycle
    ? { kind: 'found', cycle }
    : { kind: 'unavailable', message: 'The promotion cycle in this notification no longer exists or is outside your assigned station. Showing all promotion cycles instead.' };
};

export type ApplicationResolution<A> = { kind: 'found'; application: A } | { kind: 'unavailable'; message: string };

export const resolveTargetApplication = <A extends { id: number }>(target: PromotionTarget, applications: A[]): ApplicationResolution<A> | null => {
  if (!target.applicationId) return null;
  const application = applications.find(a => a.id === target.applicationId);
  return application
    ? { kind: 'found', application }
    : { kind: 'unavailable', message: 'The application in this notification was withdrawn, removed, or is outside your assigned station. Showing the promotion cycle instead.' };
};
