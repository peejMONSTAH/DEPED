/**
 * What an opened promotion cycle allows, which workflow stage is where, and
 * the one recommended next action. Mirrors backend/src/utils/cycle-capability.util.ts,
 * which enforces the same rules on the server; this copy only decides what the
 * screen offers. Pure functions, no React, so the rules are tested directly.
 */

export type Role = 'HRMO' | 'AO_II' | 'SYSTEM_ADMINISTRATOR' | string | undefined;

const UPCOMING = ['PLANNING', 'CONFIGURED'];
const WORKING = ['ACTIVE', 'EVALUATION', 'COMPARATIVE_ASSESSMENT', 'RESULTS_READY'];
const SEALED = ['PUBLISHED', 'FINALIZED', 'RESOLVED', 'CANCELLED'];
const up = (s: unknown) => String(s || '').toUpperCase();

export const isCancelled = (s: unknown) => up(s) === 'CANCELLED';
export const isUpcoming = (s: unknown) => UPCOMING.includes(up(s));
export const isClosed = (s: unknown) => up(s) === 'CLOSED';
export const isSealed = (s: unknown) => SEALED.includes(up(s));
/** Nothing about applicants may change (cancelled or finalized). */
export const isCycleReadOnly = (s: unknown) => isSealed(s);

export interface CycleWindow { startDate?: string | null; endDate?: string | null }

export function applicationsState(c: CycleWindow, now = new Date()): 'NOT_YET_OPEN' | 'OPEN' | 'CLOSED' {
  const start = c.startDate ? new Date(c.startDate) : null;
  const end = c.endDate ? new Date(c.endDate) : null;
  if (start && now < start) return 'NOT_YET_OPEN';
  if (end) { const e = new Date(end); e.setHours(23, 59, 59, 999); if (now > e) return 'CLOSED'; }
  return 'OPEN';
}

export const isHrmo = (r: Role) => r === 'HRMO';
export const isReviewer = (r: Role) => r === 'HRMO' || r === 'AO_II';

export const canEditCycle = (s: unknown, r: Role) => isHrmo(r) && !isSealed(s);
export const canRegisterApplicant = (s: unknown, r: Role, w: CycleWindow, now = new Date()) =>
  isReviewer(r) && up(s) === 'ACTIVE' && applicationsState(w, now) === 'OPEN';
export const canReviewRequirements = (s: unknown, r: Role) => isReviewer(r) && (WORKING.includes(up(s)) || isClosed(s));
export const canDeliberate = (s: unknown, r: Role) => isHrmo(r) && (WORKING.includes(up(s)) || isClosed(s));
export const canSelectCandidate = (s: unknown, r: Role) => isHrmo(r) && (WORKING.includes(up(s)) || isClosed(s));
export const canGenerateCar = (s: unknown, r: Role) => isReviewer(r) && !isUpcoming(s) && !isCancelled(s);

/** Live values the workflow is derived from. All come from the server's leaderboard. */
export interface CycleCounts {
  applicants: number;   // in contest (not discontinued)
  checked: number;      // AO II has recorded a requirements result
  qualified: number;    // requirements verified complete
  rated: number;        // qualified and rated by the board
  selected: number;     // selected or appointed
  slots: number;        // authorized vacancy slots
}

export type StageKey = 'APPLICANTS' | 'REQUIREMENTS' | 'DELIBERATION' | 'SELECTION' | 'CAR';
export type StageState = 'NOT_STARTED' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'READ_ONLY';

export interface Stage { key: StageKey; label: string; state: StageState; reason: string | null; available: boolean }

export const STAGE_STATE_LABEL: Record<StageState, string> = {
  NOT_STARTED: 'Not started', READY: 'Ready', IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed', BLOCKED: 'Blocked', READ_ONLY: 'Read only',
};

export function workflowStages(status: unknown, c: CycleCounts, role: Role): Stage[] {
  const readOnly = isCycleReadOnly(status);
  const upcoming = isUpcoming(status);
  const ro = (key: StageKey, label: string, done: boolean): Stage =>
    ({ key, label, state: done ? 'COMPLETED' : 'READ_ONLY', reason: isCancelled(status) ? 'This cycle was cancelled.' : 'This cycle is finalized.', available: true });

  const reqDone = c.applicants > 0 && c.checked === c.applicants;
  const ratedDone = c.qualified > 0 && c.rated === c.qualified;
  const selDone = c.selected > 0 && c.selected >= Math.min(c.slots, c.qualified);

  if (readOnly) {
    return [
      ro('APPLICANTS', 'Applicants', c.applicants > 0),
      ro('REQUIREMENTS', 'Requirements review', reqDone),
      ro('DELIBERATION', 'Board deliberation', ratedDone),
      ro('SELECTION', 'Candidate selection', selDone),
      { ...ro('CAR', 'CAR and final records', false), available: !isCancelled(status) || c.rated > 0 },
    ];
  }

  const stages: Stage[] = [];
  stages.push({
    key: 'APPLICANTS', label: 'Applicants', available: true,
    state: upcoming ? 'NOT_STARTED' : c.applicants > 0 ? 'COMPLETED' : 'READY',
    reason: upcoming ? 'Applications have not opened yet.' : null,
  });
  stages.push({
    key: 'REQUIREMENTS', label: 'Requirements review', available: c.applicants > 0 && isReviewer(role),
    state: c.applicants === 0 ? 'BLOCKED' : reqDone ? 'COMPLETED' : c.checked > 0 ? 'IN_PROGRESS' : 'READY',
    reason: c.applicants === 0 ? 'No applicants are registered yet.' : null,
  });
  stages.push({
    key: 'DELIBERATION', label: 'Board deliberation', available: c.qualified > 0 && isHrmo(role),
    state: c.qualified === 0 ? 'BLOCKED' : ratedDone ? 'COMPLETED' : c.rated > 0 ? 'IN_PROGRESS' : 'READY',
    reason: c.qualified === 0 ? (c.applicants === 0 ? 'No applicants are registered yet.' : 'No applicant has complete requirements yet.') : null,
  });
  stages.push({
    key: 'SELECTION', label: 'Candidate selection', available: ratedDone && reqDone && isHrmo(role),
    state: !(ratedDone && reqDone) ? 'BLOCKED' : selDone ? 'COMPLETED' : c.selected > 0 ? 'IN_PROGRESS' : 'READY',
    reason: !reqDone ? 'Complete the requirements review for every applicant first.'
      : !ratedDone ? 'Board ratings are incomplete.' : null,
  });
  stages.push({
    key: 'CAR', label: 'CAR and final records', available: c.rated > 0 && isReviewer(role) && !upcoming,
    state: c.rated === 0 ? 'BLOCKED' : selDone ? 'READY' : 'IN_PROGRESS',
    reason: c.rated === 0 ? 'No applicant has been rated by the board yet.' : null,
  });
  if (!isReviewer(role)) stages.forEach(s => { if (s.key !== 'APPLICANTS') { s.available = false; s.reason = s.reason || 'Your role cannot open this stage.'; } });
  return stages;
}

export interface NextAction { label: string; stage: StageKey | null; kind: 'REGISTER' | 'OPEN_STAGE' | 'NONE'; note?: string }

/** The one recommended step, from server data. Null means show no primary action. */
export function nextCycleAction(status: unknown, c: CycleCounts, role: Role, w: CycleWindow, now = new Date()): NextAction | null {
  if (isCancelled(status)) return null;
  if (isSealed(status)) return { label: 'View final results', stage: 'CAR', kind: 'OPEN_STAGE' };
  if (isUpcoming(status)) return null;
  if (c.applicants === 0) {
    return canRegisterApplicant(status, role, w, now)
      ? { label: 'Register applicant', stage: 'APPLICANTS', kind: 'REGISTER' }
      : null;
  }
  if (c.checked < c.applicants && isReviewer(role)) return { label: 'Review requirements', stage: 'REQUIREMENTS', kind: 'OPEN_STAGE' };
  if (!isHrmo(role)) return null;
  if (c.qualified > 0 && c.rated < c.qualified) return { label: c.rated ? 'Continue board rating' : 'Begin board deliberation', stage: 'DELIBERATION', kind: 'OPEN_STAGE' };
  if (c.qualified > 0 && c.selected < Math.min(c.slots, c.qualified)) return { label: 'Select candidate', stage: 'SELECTION', kind: 'OPEN_STAGE' };
  if (c.selected > 0) return { label: 'Open CAR', stage: 'CAR', kind: 'OPEN_STAGE' };
  return null;
}

/** Why the whole cycle is limited, for the alert under the header. */
export function cycleBlockReason(status: unknown, w: CycleWindow, now = new Date()): string | null {
  if (isCancelled(status)) return 'This cycle was cancelled. It is kept as a read-only record.';
  if (isSealed(status)) return 'This cycle is finalized. Results and records are read only.';
  if (isClosed(status)) return 'This cycle is closed. Applicants can no longer be added; selections can still be corrected.';
  if (isUpcoming(status)) {
    return w.startDate ? `Applications open on ${new Date(w.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.` : 'Applications have not opened yet.';
  }
  if (up(status) === 'ACTIVE' && applicationsState(w, now) === 'CLOSED') return 'The application period has ended. Registered applicants can still be reviewed.';
  return null;
}

/** Controlled status moves offered in the cycle actions menu. Mirrors the server table. */
export interface CycleMove { to: string; label: string; danger?: boolean; needsReason?: boolean; confirm: string }

export function cycleMoves(status: unknown, role: Role): CycleMove[] {
  if (!isHrmo(role)) return [];
  const s = up(status);
  const moves: CycleMove[] = [];
  if (UPCOMING.includes(s)) moves.push({ to: 'ACTIVE', label: 'Open applications', confirm: 'Open this cycle for applications?' });
  if (s === 'ACTIVE') moves.push({ to: 'EVALUATION', label: 'Close applications', confirm: 'Close applications? Registered applicants can still be reviewed.' });
  if (s === 'EVALUATION') moves.push({ to: 'ACTIVE', label: 'Reopen applications', confirm: 'Reopen this cycle for applications?' });
  if (WORKING.includes(s)) moves.push({ to: 'CLOSED', label: 'Mark cycle finished', confirm: 'Mark this cycle finished? No new applicants can be added.' });
  if (s === 'CLOSED') {
    moves.push({ to: 'FINALIZED', label: 'Finalize cycle', confirm: 'Finalize this cycle? Ratings and selections become read only.' });
    moves.push({ to: 'RESULTS_READY', label: 'Reopen cycle', needsReason: true, confirm: 'Reopen this cycle for further review?' });
  }
  if ([...UPCOMING, ...WORKING].includes(s)) moves.push({ to: 'CANCELLED', label: 'Cancel cycle', danger: true, needsReason: true, confirm: 'Cancel this cycle? Every application is discontinued and applicants are notified.' });
  return moves;
}
