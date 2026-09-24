/**
 * Which roles an account may grant. Division-level roles (HRMO, SYSTEM_ADMIN)
 * are granted, and taken away, only by a System Administrator; otherwise an
 * HRMO could create a System Administrator and escalate their own access.
 * AO II grants no roles directly: account requests are limited to personnel
 * roles in submitAccountRequest, and POST/PUT /users exclude AO II.
 */
export const PRIVILEGED_ROLES = ['HRMO', 'SYSTEM_ADMIN'];
const HRMO_ASSIGNABLE = ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL', 'AO_II'];

export const canAssignRole = (actorRole: string | undefined, targetRole: string): boolean => {
  if (actorRole === 'SYSTEM_ADMIN') return true;
  if (actorRole === 'HRMO') return HRMO_ASSIGNABLE.includes(targetRole);
  return false;
};

/** Changing an existing account's role: both its current and its new role must be grantable. */
export const canChangeRole = (actorRole: string | undefined, currentRole: string, nextRole: string): boolean =>
  canAssignRole(actorRole, currentRole) && canAssignRole(actorRole, nextRole);

export const ROLE_REFUSAL = 'Only a System Administrator can assign or change HRMO and System Administrator roles.';

const PERSONNEL_ROLES = ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'];

/**
 * Whether the actor may act on an existing account at all: edit it, change its
 * status, reset its password, distribute its credentials or delete it.
 * An HRMO resetting a System Administrator's password would receive a working
 * credential for it, so division-level accounts are System Administrator-only.
 * AO II additionally needs the account in their station (userInScope).
 */
export const canManageAccount = (actorRole: string | undefined, targetRole: string): boolean => {
  if (actorRole === 'SYSTEM_ADMIN') return true;
  if (actorRole === 'HRMO') return !PRIVILEGED_ROLES.includes(targetRole);
  if (actorRole === 'AO_II') return PERSONNEL_ROLES.includes(targetRole);
  return false;
};

export const MANAGE_REFUSAL = 'Only a System Administrator can manage HRMO and System Administrator accounts.';
