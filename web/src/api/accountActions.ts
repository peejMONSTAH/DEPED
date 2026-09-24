/**
 * Row actions for the account directory, mirroring backend/src/routes/users.routes.ts:
 *
 *   view          SYSTEM_ADMIN, HRMO, AO_II   GET  /users/:id  (AO II: own-school accounts only)
 *   distribute    SYSTEM_ADMIN, HRMO, AO_II   POST /users/:id/distribute-credentials
 *   edit          SYSTEM_ADMIN, HRMO          PUT  /users/:id
 *   deactivate    SYSTEM_ADMIN, HRMO          PUT  /users/:id { accountStatus: 'INACTIVE' }
 *   reactivate    SYSTEM_ADMIN, HRMO          PUT  /users/:id { accountStatus: 'ACTIVE' }
 *   resetPassword SYSTEM_ADMIN, HRMO          POST /users/:id/reset-password
 *
 * The server enforces every rule; this only hides what would be refused. An
 * AO II only ever receives own-school accounts from GET /users, so the list
 * itself carries the station restriction. Nobody changes their own status.
 *
 * HRMO and SYSTEM_ADMIN accounts are managed by a System Administrator only
 * (backend canManageAccount): an HRMO resetting one would receive a working
 * password for it. Their rows offer HRMO nothing beyond View.
 */

export type AccountStatus = 'PENDING' | 'ACTIVE' | 'LOCKED' | 'INACTIVE';
export type AccountAction = 'view' | 'distribute' | 'edit' | 'deactivate' | 'reactivate' | 'resetPassword';

const MANAGERS = ['SYSTEM_ADMIN', 'HRMO'];
const VIEWERS = [...MANAGERS, 'AO_II'];
const PRIVILEGED = ['HRMO', 'SYSTEM_ADMIN'];
const PERSONNEL = ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'];

/** Mirrors backend/src/utils/role-assignment.util.ts canManageAccount. */
export const canManageAccount = (actorRole: string | undefined, targetRole: string): boolean => {
  if (actorRole === 'SYSTEM_ADMIN') return true;
  if (actorRole === 'HRMO') return !PRIVILEGED.includes(targetRole);
  if (actorRole === 'AO_II') return PERSONNEL.includes(targetRole);
  return false;
};

export const accountActionsFor = (
  viewer: { role?: string; userId?: number } | null | undefined,
  account: { id: number; accountStatus: AccountStatus; role: string },
): AccountAction[] => {
  const role = viewer?.role || '';
  if (!VIEWERS.includes(role)) return [];
  const actions: AccountAction[] = ['view'];
  if (!canManageAccount(role, account.role)) return actions;
  if (account.accountStatus === 'PENDING') actions.push('distribute');
  if (!MANAGERS.includes(role)) return actions;
  actions.push('edit', 'resetPassword');
  const isSelf = viewer?.userId === account.id;
  if (!isSelf) {
    if (account.accountStatus === 'INACTIVE') actions.push('reactivate');
    else actions.push('deactivate');
  }
  return actions;
};

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  PENDING: 'Pending distribution',
  ACTIVE: 'Active',
  LOCKED: 'Locked',
  INACTIVE: 'Deactivated',
};

export const ACCOUNT_STATUS_BADGE: Record<AccountStatus, string> = {
  PENDING: 'badge-pending',
  ACTIVE: 'badge-approved',
  LOCKED: 'badge-deficiency',
  INACTIVE: 'badge-rejected',
};
