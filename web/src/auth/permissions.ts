import type { UserRole, AuthUser } from '../types';

/**
 * Named role groups and a single membership test.
 *
 * Roles were previously compared inline as string literals in ~49 places, so adding
 * or renaming one meant finding every comparison. Add the role to a group here instead.
 */

/** Teaching and non-teaching staff — the subjects of HR transactions. */
export const PERSONNEL_ROLES: UserRole[] = ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'];

/** Roles that use the admin portal rather than the personnel portal. */
export const ADMIN_PORTAL_ROLES: UserRole[] = ['SYSTEM_ADMIN', 'AO_II', 'HRMO'];

/** Roles that may give final approval on a transaction. */
export const APPROVER_ROLES: UserRole[] = ['HRMO', 'SYSTEM_ADMIN'];

/** Division-level roles, i.e. those not confined to a single school station. */
export const DIVISION_ROLES: UserRole[] = ['SYSTEM_ADMIN', 'HRMO'];

type RoleLike = { role?: string | null } | null | undefined;

export const hasRole = (user: RoleLike, roles: readonly UserRole[] | UserRole): boolean => {
  if (!user?.role) return false;
  const allowed = Array.isArray(roles) ? roles : [roles as UserRole];
  return allowed.includes(user.role as UserRole);
};

export const isPersonnel = (user: RoleLike): boolean => hasRole(user, PERSONNEL_ROLES);

/** Where a signed-in user belongs when they land on `/` or hit a route they cannot open. */
export const homePathFor = (user: AuthUser | RoleLike): string =>
  isPersonnel(user) ? '/personnel/home' : '/admin/dashboard';
