import prisma from '../config/prisma';

/**
 * Who reviews whom.
 *
 * Teaching personnel are checked by their station's AO II. Non-teaching personnel
 * (and the administrators themselves, who are non-teaching staff) go to HRMO
 * directly, with no AO II step. Final approval is always a different person from
 * whoever validated. Nobody reviews their own record.
 *
 * The whole arrangement is behind HR_DIRECT_REVIEW so the existing workflow
 * (AO II validates everyone in their station, HRMO approves) stays the default
 * until it is switched on.
 */
export const hrDirectEnabled = (): boolean => /^(1|true|on|yes)$/i.test(process.env.HR_DIRECT_REVIEW || '');

export type ReviewLane = 'AO' | 'HR';
export type Verdict = { ok: true } | { ok: false; reason: string };

/** The lane a person's submissions take, from their own account role. */
export const laneFor = (subjectRole?: string | null): ReviewLane =>
  hrDirectEnabled() && subjectRole && subjectRole !== 'TEACHING_PERSONNEL' ? 'HR' : 'AO';

export interface ValidationFacts {
  actorRole?: string;
  actorPersonnelId?: number | null;
  subjectPersonnelId?: number | null;
  subjectRole?: string | null;
  /** Whether the subject's station has an active AO II who could validate. */
  stationHasAo: boolean;
}

/** Whether the actor may validate this person's documents or check their requirements. */
export function decideValidation(f: ValidationFacts): Verdict {
  if (f.actorPersonnelId && f.subjectPersonnelId && f.actorPersonnelId === f.subjectPersonnelId) {
    return { ok: false, reason: 'You cannot review your own submission.' };
  }
  const lane = laneFor(f.subjectRole);
  if (f.actorRole === 'AO_II') {
    return lane === 'AO' ? { ok: true } : { ok: false, reason: 'Non-teaching personnel are reviewed by HRMO directly.' };
  }
  if (f.actorRole === 'HRMO') {
    if (!hrDirectEnabled()) return { ok: false, reason: 'Only AO II validates documents.' };
    if (lane === 'HR') return { ok: true };
    // HRMO covers a station that has no AO II, so nothing is stranded.
    return f.stationHasAo ? { ok: false, reason: 'This station has an AO II who validates its teaching personnel.' } : { ok: true };
  }
  return { ok: false, reason: 'Only AO II or HRMO may validate.' };
}

export const stationHasActiveAo = async (school?: string | null): Promise<boolean> => {
  if (!school) return false;
  return (await prisma.user.count({
    where: { accountStatus: 'ACTIVE', role: { name: 'AO_II' }, personnel: { school: { equals: school } } },
  })) > 0;
};

export async function validationAllowed(
  actor: { role?: string; personnelId?: number | null } | undefined | null,
  subject: { personnelId?: number | null; school?: string | null; roleName?: string | null },
): Promise<Verdict> {
  const needsStation = actor?.role === 'HRMO' && hrDirectEnabled() && laneFor(subject.roleName) === 'AO';
  return decideValidation({
    actorRole: actor?.role,
    actorPersonnelId: actor?.personnelId,
    subjectPersonnelId: subject.personnelId,
    subjectRole: subject.roleName,
    stationHasAo: needsStation ? await stationHasActiveAo(subject.school) : true,
  });
}

export interface ApprovalFacts {
  actorRole?: string;
  actorUserId?: number;
  /** Users who validated this transaction's documents. */
  validatorIds: number[];
  /** True when another active HRMO (not the subject, not a validator) is available. */
  otherApproverExists: boolean;
}

/**
 * Independent final approval. Off (no extra rule) unless the switch is on. The
 * System Administrator never approves.
 */
export function decideApproval(f: ApprovalFacts): Verdict {
  if (!hrDirectEnabled()) return f.actorRole === 'HRMO' ? { ok: true } : { ok: false, reason: 'Only HRMO gives final approval.' };
  if (f.actorRole !== 'HRMO') return { ok: false, reason: 'Only HRMO gives final approval.' };
  if (f.actorUserId && f.validatorIds.includes(f.actorUserId)) {
    return { ok: false, reason: 'A different HRMO must give final approval to a file you validated.' };
  }
  return { ok: true };
}

export async function approvalAllowed(
  actor: { role?: string; userId?: number } | undefined | null,
  transaction: { personnelId?: number | null; uploadedDocuments: Array<{ validatedByUserId?: number | null }> },
): Promise<Verdict> {
  const validatorIds = transaction.uploadedDocuments.map(d => d.validatedByUserId).filter((id): id is number => typeof id === 'number');
  let otherApproverExists = true;
  if (hrDirectEnabled() && validatorIds.includes(actor?.userId ?? -1)) {
    otherApproverExists = (await prisma.user.count({
      where: {
        accountStatus: 'ACTIVE',
        role: { name: 'HRMO' },
        id: { notIn: validatorIds },
        ...(transaction.personnelId ? { NOT: { personnel: { id: transaction.personnelId } } } : {}),
      },
    })) > 0;
  }
  return decideApproval({ actorRole: actor?.role, actorUserId: actor?.userId, validatorIds, otherApproverExists });
}
