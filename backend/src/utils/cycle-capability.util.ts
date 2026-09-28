/**
 * What a promotion cycle's status allows, in one place.
 *
 * Status values are the existing PromotionCycleStatus enum; nothing new is
 * added. Every write endpoint asks here instead of comparing statuses inline,
 * so the web app (which mirrors these rules in web/src/promotions/cycleCapability.ts)
 * and the server cannot drift apart.
 */

export type CycleStatus =
  | 'PLANNING' | 'CONFIGURED' | 'ACTIVE' | 'EVALUATION' | 'COMPARATIVE_ASSESSMENT'
  | 'RESULTS_READY' | 'CLOSED' | 'PUBLISHED' | 'FINALIZED' | 'RESOLVED' | 'CANCELLED';

const UPCOMING = ['PLANNING', 'CONFIGURED'];
const WORKING = ['ACTIVE', 'EVALUATION', 'COMPARATIVE_ASSESSMENT', 'RESULTS_READY'];
/** Finished but selection follow-ups (revoke, reassign) are still possible. */
const CLOSED = ['CLOSED'];
/** Historical records: nothing about applicants may change. */
const SEALED = ['PUBLISHED', 'FINALIZED', 'RESOLVED', 'CANCELLED'];

const s = (status: unknown) => String(status || '').toUpperCase();

export const isCancelled = (status: unknown) => s(status) === 'CANCELLED';
export const isSealed = (status: unknown) => SEALED.includes(s(status));
export const isUpcoming = (status: unknown) => UPCOMING.includes(s(status));

/** Registering an applicant needs an open cycle; the date window is checked separately. */
export const canRegisterApplicants = (status: unknown) => s(status) === 'ACTIVE';
/** AO II checks, board ratings and ranking run while the cycle is being worked. */
export const canReviewApplicants = (status: unknown) => WORKING.includes(s(status));
/** Selection may also be corrected after the cycle closed itself on its last slot. */
export const canChangeSelection = (status: unknown) => WORKING.includes(s(status)) || CLOSED.includes(s(status));
/** The CAR is a record of work done: never for an upcoming or cancelled cycle. */
export const canGenerateCar = (status: unknown) => !isUpcoming(status) && !isCancelled(status);
/** Schedule and rules edits. */
export const canEditCycle = (status: unknown) => !isSealed(status);

/** Allowed status moves. Anything not listed is refused. */
export const CYCLE_TRANSITIONS: Record<CycleStatus, CycleStatus[]> = {
  PLANNING: ['CONFIGURED', 'ACTIVE', 'CANCELLED'],
  CONFIGURED: ['PLANNING', 'ACTIVE', 'CANCELLED'],
  ACTIVE: ['EVALUATION', 'COMPARATIVE_ASSESSMENT', 'RESULTS_READY', 'CLOSED', 'CANCELLED'],
  EVALUATION: ['ACTIVE', 'COMPARATIVE_ASSESSMENT', 'RESULTS_READY', 'CLOSED', 'CANCELLED'],
  COMPARATIVE_ASSESSMENT: ['EVALUATION', 'RESULTS_READY', 'CLOSED', 'CANCELLED'],
  RESULTS_READY: ['EVALUATION', 'COMPARATIVE_ASSESSMENT', 'CLOSED', 'PUBLISHED', 'CANCELLED'],
  CLOSED: ['RESULTS_READY', 'PUBLISHED', 'FINALIZED'],
  PUBLISHED: ['FINALIZED'],
  FINALIZED: [],
  RESOLVED: [],
  CANCELLED: [],
};

/** Moves that undo a closing decision need a written reason, like cancelling. */
export const isReopening = (from: unknown, to: unknown) => s(from) === 'CLOSED' && s(to) === 'RESULTS_READY';

/** Null when the move is allowed, otherwise a sentence for the officer. */
export const transitionBlockReason = (from: unknown, to: unknown): string | null => {
  const f = s(from) as CycleStatus;
  const t = s(to) as CycleStatus;
  if (f === t) return null;
  const allowed = CYCLE_TRANSITIONS[f];
  if (!allowed) return `Unknown cycle status "${from}".`;
  if (!allowed.includes(t)) {
    if (f === 'CANCELLED') return 'A cancelled cycle is a closed record and cannot change status.';
    if (SEALED.includes(f)) return 'This cycle is finalized and cannot change status.';
    return `A cycle cannot move from ${f.toLowerCase().replace(/_/g, ' ')} to ${t.toLowerCase().replace(/_/g, ' ')}.`;
  }
  return null;
};

/** Standard refusal for a write on a cycle that is not open for it. */
export const readOnlyReason = (status: unknown): string =>
  isCancelled(status)
    ? 'This promotion cycle was cancelled. It is kept as a read-only record.'
    : isSealed(status)
      ? 'This promotion cycle is finalized. It is kept as a read-only record.'
      : isUpcoming(status)
        ? 'This promotion cycle has not opened yet.'
        : 'This promotion cycle is closed to this action.';
