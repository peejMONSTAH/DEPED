/**
 * One wording for where a person's promotion and appointment stand, shared by
 * Home, Applications and the status cards. Plain words, and always who acts next.
 *
 * Vocabulary: a reviewer *validates* documents and *checks* application requirements
 * (the station's AO II for teaching personnel, HRMO directly for non-teaching personnel
 * and for a station with no AO II); HRMO *rates, ranks and selects* candidates and a
 * different HRMO gives *final approval* to the appointment. Only an approved appointment
 * changes the official position and service record.
 *
 * The reviewer is never assumed: it comes from the server's `review` / `checker` fields.
 */
export type Responsible = 'You' | 'AO II' | 'HRMO' | 'System Administrator' | null;
export interface Stage { label: string; who: Responsible; needsYou: boolean; done: boolean; next: string }

export interface ApplicationLike {
  status?: string; stageStatus?: string | null; canResubmit?: boolean; transactionId?: number | null;
  requirementsCheck?: { status?: string | null } | null; cycle?: { status?: string | null } | null;
  /** Who checks the requirements: 'AO II' or 'HRMO', from the server. */
  checker?: string | null;
}

/** The server's per-transaction review facts (see backend transaction-review.util). */
export interface ReviewFacts {
  validator?: 'AO_II' | 'HRMO' | null;
  validatedBy?: { role?: string | null; name?: string | null } | null;
  approver?: 'HRMO' | 'SYSTEM_ADMIN' | null;
  approvedBy?: 'HRMO' | 'SYSTEM_ADMIN' | null;
}

const NAME: Record<string, string> = { AO_II: 'AO II', HRMO: 'HRMO', SYSTEM_ADMIN: 'System Administrator' };
const nameOf = (role?: string | null): 'AO II' | 'HRMO' => (role === 'HRMO' ? 'HRMO' : 'AO II');

/** The people a case can pass through, in order, for the progress track. */
export const stageSteps = (validator?: string | null): Array<'You' | 'AO II' | 'HRMO'> =>
  (validator === 'HRMO' ? ['You', 'HRMO'] : ['You', 'AO II', 'HRMO']);

export function transactionStage(status: string | undefined, opts: { escalated?: boolean; review?: ReviewFacts | null } = {}): Stage {
  const v = nameOf(opts.review?.validator);
  const by = opts.review?.validatedBy?.role ? (NAME[opts.review.validatedBy.role] ?? v) : v;
  switch ((status || '').toUpperCase()) {
    case 'DRAFT': return { label: 'Not submitted yet', who: 'You', needsYou: true, done: false, next: `Upload the required documents, then submit to ${v}.` };
    case 'PENDING_VALIDATION': return { label: `Waiting for ${v} validation`, who: v, needsYou: false, done: false, next: `${v} is checking your documents.` };
    case 'FOR_APPROVAL': {
      const fallback = opts.review?.approver === 'SYSTEM_ADMIN';
      return opts.escalated
        ? { label: 'With HRMO after repeated corrections', who: 'HRMO', needsYou: false, done: false, next: `HRMO will tell you exactly what to fix; ${v} then validates the corrected files.` }
        : { label: `Validated by ${by} · waiting for final approval`, who: fallback ? 'System Administrator' : 'HRMO', needsYou: false, done: false, next: fallback ? 'No other HRMO can approve it, so the System Administrator gives the final approval.' : (opts.review ? 'A different HRMO gives the final approval.' : 'HRMO gives the final approval.') };
    }
    case 'DEFICIENCY': return { label: 'Returned for correction', who: 'You', needsYou: true, done: false, next: 'Replace only the returned documents, then resubmit.' };
    case 'APPROVED': case 'COMPLETED': return { label: `Approved by ${opts.review?.approvedBy === 'SYSTEM_ADMIN' ? 'System Administrator (fallback)' : 'HRMO'} · appointment effective`, who: null, needsYou: false, done: true, next: 'Your position and service record are updated.' };
    case 'REJECTED': return { label: 'Not approved (final decision)', who: null, needsYou: false, done: true, next: 'See the reason recorded on the transaction.' };
    case 'ABANDONED': case 'ARCHIVED': return { label: 'Closed', who: null, needsYou: false, done: true, next: 'No further action.' };
    default: return { label: status || 'Unknown', who: null, needsYou: false, done: false, next: '' };
  }
}

/** A promotion application before (or without) its appointment transaction. */
export function applicationStage(a: ApplicationLike): Stage {
  const stage = (a.stageStatus || '').toUpperCase();
  const status = (a.status || '').toUpperCase();
  const checker = a.checker === 'HRMO' ? 'HRMO' : 'AO II';
  if (stage === 'CANCELLED' || (a.cycle?.status || '').toUpperCase() === 'CANCELLED') return { label: 'Promotion cycle cancelled', who: null, needsYou: false, done: true, next: 'No further action.' };
  if (status === 'APPROVED' || stage === 'OFFICIALLY_PROMOTED') return { label: 'Appointed', who: null, needsYou: false, done: true, next: 'Your position and service record are updated.' };
  if (status === 'REJECTED' || stage === 'NOT_SELECTED') return { label: 'Not selected', who: null, needsYou: false, done: true, next: 'You can apply to future vacancies.' };
  if (a.canResubmit) return { label: 'Returned for correction', who: 'You', needsYou: true, done: false, next: `Replace the documents ${checker} marked, then resubmit. Only those need a new file.` };
  if (a.transactionId || stage === 'SELECTED_PENDING_DOCS') return { label: 'Selected · appointment in progress', who: 'You', needsYou: false, done: false, next: 'Complete the appointment requirements.' };
  if (['FINAL_RANKED', 'INITIAL_RATED'].includes(stage) || status === 'RANKED') return { label: 'Ranked · waiting for HRMO selection', who: 'HRMO', needsYou: false, done: false, next: 'HRMO selects the candidate.' };
  if ((a.requirementsCheck?.status || '').toUpperCase() === 'COMPLETE' || stage === 'REQUIREMENTS_VERIFIED') return { label: 'Requirements checked · waiting for HRMO rating', who: 'HRMO', needsYou: false, done: false, next: 'HRMO rates and ranks the applicants.' };
  return { label: `Waiting for ${checker} to check requirements`, who: checker, needsYou: false, done: false, next: `${checker} checks your attached documents.` };
}
