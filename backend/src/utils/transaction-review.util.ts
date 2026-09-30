import prisma from '../config/prisma';
import { Prisma } from '@prisma/client';
import { hrDirectEnabled, laneFor, decideValidation, decideApproval } from './review-lane.util';
import { stationKey } from './scope.util';

/**
 * One place that answers, for a transaction and a viewer: who checked it, who
 * must act next, and what the viewer can do. The lists, the detail, the
 * notifications and the mobile app all read this, so no screen has to guess
 * from the status alone or hard-code "AO II" / "HRMO".
 */

export interface ReviewContext {
  /** stationKey of every station that has an active AO II. */
  aoStations: Set<string>;
  /** Active HRMO accounts with the personnel record each one holds, if any. */
  hrmos: Array<{ id: number; personnelId: number | null }>;
  /** System Administrator accounts, so an approval can be attributed to the right role. */
  sysadminIds: Set<number>;
}

export const loadReviewContext = async (): Promise<ReviewContext> => {
  const [aos, hrmos, admins] = await Promise.all([
    prisma.user.findMany({ where: { accountStatus: 'ACTIVE', role: { name: 'AO_II' }, personnel: { school: { not: null } } }, select: { personnel: { select: { school: true } } } }),
    prisma.user.findMany({ where: { accountStatus: 'ACTIVE', role: { name: 'HRMO' } }, select: { id: true, personnel: { select: { id: true } } } }),
    prisma.user.findMany({ where: { role: { name: 'SYSTEM_ADMIN' } }, select: { id: true } }),
  ]);
  return {
    aoStations: new Set(aos.map(u => stationKey(u.personnel?.school)).filter((k): k is string => Boolean(k))),
    hrmos: hrmos.map(h => ({ id: h.id, personnelId: h.personnel?.id ?? null })),
    sysadminIds: new Set(admins.map(a => a.id)),
  };
};

export interface ReviewRow {
  id: number;
  status: string;
  personnelId?: number | null;
  /** Set to whoever last decided it; for an approved file, the approver. */
  currentAssigneeId?: number | null;
  escalatedAt?: Date | string | null;
  escalationReviewedAt?: Date | string | null;
  personnel?: { school?: string | null; user?: { role?: { name?: string | null } | null } | null } | null;
  uploadedDocuments?: Array<{
    validatedByUserId?: number | null;
    validationDate?: Date | string | null;
    validatedBy?: { id?: number; role?: { name?: string | null } | null; personnel?: { firstName?: string | null; lastName?: string | null } | null } | null;
  }>;
}

export interface ReviewViewer { userId?: number; role?: string; personnelId?: number | null }

export interface ReviewState {
  /** Who checks the documents: teaching personnel go to AO II, non-teaching to HRMO, and HRMO covers a station with no AO II. */
  validator: 'AO_II' | 'HRMO';
  validatedBy: { userId: number; role: string; name: string } | null;
  /** Who can give final approval right now. */
  approver: 'HRMO' | 'SYSTEM_ADMIN' | null;
  /** Who gave the final approval, once approved. */
  approvedBy: 'HRMO' | 'SYSTEM_ADMIN' | null;
  canValidate: boolean;
  canApprove: boolean;
  /** Who must act next. */
  owner: { role: 'APPLICANT' | 'AO_II' | 'HRMO' | 'SYSTEM_ADMIN' | null; label: string };
  /** What happened, and who is next. */
  summary: string;
  /** What the person looking at it can or must do. */
  youCan: string;
}

const ROLE_LABEL: Record<string, string> = { AO_II: 'AO II', HRMO: 'HRMO', SYSTEM_ADMIN: 'System Administrator' };
export const reviewerLabel = (role?: string | null): string => (role ? ROLE_LABEL[role] || role : 'reviewer');

const validatorIdsOf = (row: ReviewRow): number[] =>
  [...new Set((row.uploadedDocuments ?? []).map(d => d.validatedByUserId ?? d.validatedBy?.id).filter((id): id is number => typeof id === 'number'))];

/** Who checks (or checked) this person's documents. */
export const expectedValidator = (row: ReviewRow, ctx: ReviewContext): 'AO_II' | 'HRMO' => {
  const role = row.personnel?.user?.role?.name;
  if (laneFor(role) === 'HR') return 'HRMO';
  if (!hrDirectEnabled()) return 'AO_II';
  const key = stationKey(row.personnel?.school);
  return key && ctx.aoStations.has(key) ? 'AO_II' : 'HRMO';
};

/** HRMO accounts that could give final approval: not a validator of this file and not its subject. */
export const eligibleApproverIds = (row: ReviewRow, ctx: ReviewContext, extraValidatorIds: number[] = []): number[] => {
  const validators = new Set([...validatorIdsOf(row), ...extraValidatorIds]);
  return ctx.hrmos
    .filter(h => (hrDirectEnabled() ? !validators.has(h.id) : true) && (!row.personnelId || h.personnelId !== row.personnelId))
    .map(h => h.id);
};

export function describeReview(row: ReviewRow, viewer: ReviewViewer | undefined | null, ctx: ReviewContext): ReviewState {
  const validator = expectedValidator(row, ctx);
  const validatorIds = validatorIdsOf(row);
  const latest = [...(row.uploadedDocuments ?? [])].filter(d => d.validatedBy).sort((a, b) => +new Date(b.validationDate ?? 0) - +new Date(a.validationDate ?? 0))[0]?.validatedBy;
  const validatedBy = latest?.id ? {
    userId: latest.id,
    role: latest.role?.name || validator,
    name: [latest.personnel?.firstName, latest.personnel?.lastName].filter(Boolean).join(' ').trim(),
  } : null;
  const vLabel = reviewerLabel(validatedBy?.role || validator);
  const vWho = validatedBy?.name ? `${vLabel} ${validatedBy.name}` : vLabel;

  const isSelf = Boolean(viewer?.personnelId && row.personnelId && viewer.personnelId === row.personnelId);
  const eligible = eligibleApproverIds(row, ctx);
  const approver: ReviewState['approver'] = row.status === 'FOR_APPROVAL'
    ? (eligible.length > 0 || !hrDirectEnabled() ? 'HRMO' : 'SYSTEM_ADMIN')
    : null;

  const canValidate = row.status === 'PENDING_VALIDATION' && !isSelf && decideValidation({
    actorRole: viewer?.role, actorPersonnelId: viewer?.personnelId, subjectPersonnelId: row.personnelId,
    subjectRole: row.personnel?.user?.role?.name, stationHasAo: ctx.aoStations.has(stationKey(row.personnel?.school) ?? ''),
  }).ok;
  const canApprove = row.status === 'FOR_APPROVAL' && !isSelf && decideApproval({
    actorRole: viewer?.role, actorUserId: viewer?.userId, validatorIds, otherApproverExists: eligible.length > 0,
  }).ok;

  const approvedBy: ReviewState['approvedBy'] = ['APPROVED', 'COMPLETED'].includes(row.status)
    ? (row.currentAssigneeId && ctx.sysadminIds.has(row.currentAssigneeId) ? 'SYSTEM_ADMIN' : 'HRMO')
    : null;
  const escalated = Boolean(row.escalatedAt) && !row.escalationReviewedAt;
  const viewerValidated = Boolean(viewer?.userId && validatorIds.includes(viewer.userId));
  const applicant = viewer?.role === 'TEACHING_PERSONNEL' || viewer?.role === 'NON_TEACHING_PERSONNEL' || isSelf;
  const noAo = validator === 'HRMO' && laneFor(row.personnel?.user?.role?.name) === 'AO';

  let owner: ReviewState['owner'] = { role: null, label: 'No further action' };
  let summary = '';
  let youCan = '';

  switch (row.status) {
    case 'DRAFT':
      owner = { role: 'APPLICANT', label: 'The applicant' };
      summary = 'Not submitted yet. The applicant still has to upload the required documents and submit.';
      youCan = applicant ? 'Upload the required documents, then submit.' : '';
      break;
    case 'PENDING_VALIDATION':
      owner = { role: validator, label: reviewerLabel(validator) };
      summary = `Submitted. Waiting for ${reviewerLabel(validator)} to validate the documents${noAo ? ' (this station has no AO II, so HRMO covers it)' : ''}.`;
      youCan = canValidate ? 'Review each document, then pass the file on for final approval or return it for correction.'
        : applicant ? `Nothing to do now. ${reviewerLabel(validator)} will validate it and you will be notified.`
        : '';
      break;
    case 'DEFICIENCY':
      owner = { role: 'APPLICANT', label: 'The applicant' };
      summary = `Returned for correction. The applicant must replace the returned documents and submit again; it then goes back to ${reviewerLabel(validator)}.`;
      youCan = applicant ? 'Replace only the documents marked as returned, then resubmit.' : '';
      break;
    case 'FOR_APPROVAL': {
      const who = approver === 'SYSTEM_ADMIN' ? 'the System Administrator (fallback: no other HRMO can approve it)' : hrDirectEnabled() ? 'a different HRMO' : 'HRMO';
      owner = { role: approver, label: approver === 'SYSTEM_ADMIN' ? 'System Administrator (fallback)' : 'HRMO' };
      summary = escalated
        ? 'Escalated to HRMO after repeated corrections. HRMO must review it and return the files that need fixing, or decide.'
        : `Validated by ${vWho}. Waiting for final approval by ${who}.`;
      youCan = canApprove ? 'Give final approval, or return it for correction or reject it, with a reason.'
        : viewerValidated ? `You validated this file, so it needs final approval from ${who}.`
        : applicant ? 'Nothing to do now. You will be notified of the decision.'
        : '';
      break;
    }
    case 'APPROVED':
    case 'COMPLETED':
      summary = `Approved by ${approvedBy === 'SYSTEM_ADMIN' ? 'the System Administrator (fallback)' : 'HRMO'}. The record is part of the Digital 201 file.`;
      break;
    case 'REJECTED':
      summary = 'Not approved. The reason is recorded on the transaction.';
      youCan = applicant ? 'Open it to see the reason and, if allowed, correct and submit again.' : '';
      break;
    default:
      summary = row.status;
  }
  return { validator, validatedBy, approver, approvedBy, canValidate, canApprove, owner, summary, youCan };
}

/** The work an HRMO can do as validator: non-teaching files, plus teaching files at a station with no AO II. Empty while HR-direct review is off. */
export const hrmoValidationLaneWhere = async (): Promise<Prisma.TransactionWhereInput> => {
  if (!hrDirectEnabled()) return { id: -1 };
  const aoStations = (await prisma.user.findMany({
    where: { accountStatus: 'ACTIVE', role: { name: 'AO_II' }, personnel: { school: { not: null } } },
    select: { personnel: { select: { school: true } } },
  })).map(u => u.personnel?.school).filter((school): school is string => Boolean(school));
  return {
    OR: [
      { personnel: { user: { role: { name: { not: 'TEACHING_PERSONNEL' } } } } },
      { personnel: { school: null } },
      ...(aoStations.length ? [{ personnel: { school: { notIn: aoStations } } }] : [{ personnel: { id: { gt: 0 } } }]),
    ],
  };
};

/** Transactions waiting for final approval that no HRMO can give: the System Administrator's narrow fallback list. */
export const fallbackApprovalIds = async (ctx?: ReviewContext): Promise<number[]> => {
  if (!hrDirectEnabled()) return [];
  const context = ctx ?? await loadReviewContext();
  const rows = await prisma.transaction.findMany({
    where: { status: 'FOR_APPROVAL' },
    select: { id: true, personnelId: true, uploadedDocuments: { select: { validatedByUserId: true } } },
  });
  return rows.filter(row => eligibleApproverIds({ id: row.id, status: 'FOR_APPROVAL', personnelId: row.personnelId, uploadedDocuments: row.uploadedDocuments }, context).length === 0).map(row => row.id);
};

/** The where-clause for "work waiting for me", the same one the list, its counts and the notices use. */
export const awaitingWhereFor = async (viewer: ReviewViewer | undefined | null): Promise<Prisma.TransactionWhereInput> => {
  if (viewer?.role === 'AO_II') return { status: 'PENDING_VALIDATION' };
  if (viewer?.role === 'SYSTEM_ADMIN') return { id: { in: await fallbackApprovalIds() } };
  if (viewer?.role === 'HRMO') {
    const hrDirect = hrDirectEnabled();
    const notMine: Prisma.TransactionWhereInput = viewer.personnelId ? { NOT: { personnelId: viewer.personnelId } } : {};
    const approve: Prisma.TransactionWhereInput = {
      status: 'FOR_APPROVAL',
      ...(hrDirect && viewer.userId ? { NOT: { uploadedDocuments: { some: { validatedByUserId: viewer.userId } } } } : {}),
    };
    if (!hrDirect) return { AND: [approve, notMine] };
    return { AND: [{ OR: [approve, { AND: [{ status: 'PENDING_VALIDATION' }, await hrmoValidationLaneWhere()] }] }, notMine] };
  }
  return { id: -1 };
};
