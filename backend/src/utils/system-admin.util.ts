import prisma from '../config/prisma';

/**
 * Guards shared by the System Administration features.
 *
 * The System Administrator runs the system (accounts, sessions, delivery,
 * backups) but holds no HR authority; HR decision routes stay authorized for
 * AO II / HRMO only and are not touched here.
 */

export const LAST_ADMIN_REFUSAL =
  'This is the last active System Administrator account. Activate or create another System Administrator first.';

/**
 * True when applying the change would leave no active System Administrator.
 * `change` describes the target account after the edit; `deleted` removes it.
 */
export async function wouldRemoveLastAdministrator(
  userId: number,
  current: { role: string; accountStatus: string },
  change: { role?: string; accountStatus?: string; deleted?: boolean },
): Promise<boolean> {
  const isActiveAdmin = current.role === 'SYSTEM_ADMIN' && current.accountStatus === 'ACTIVE';
  if (!isActiveAdmin) return false;
  const staysActiveAdmin = !change.deleted
    && (change.role ?? current.role) === 'SYSTEM_ADMIN'
    && (change.accountStatus ?? current.accountStatus) === 'ACTIVE';
  if (staysActiveAdmin) return false;
  const others = await prisma.user.count({
    where: { id: { not: userId }, accountStatus: 'ACTIVE', role: { name: 'SYSTEM_ADMIN' } },
  });
  return others === 0;
}

/** "juan.delacruz@deped.gov.ph" -> "ju***@deped.gov.ph": enough to recognise, not to harvest. */
export const maskEmail = (email: unknown): string | null => {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at < 1) return s ? '***' : null;
  return `${s.slice(0, Math.min(2, at))}***${s.slice(at)}`;
};
