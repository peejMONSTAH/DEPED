/**
 * One wording for where a person's promotion and appointment stand, shared by
 * Home, Applications and the status cards. Plain words, and always who acts next.
 *
 * Vocabulary: AO II *validates* documents and *checks* application requirements;
 * HRMO *rates, ranks and selects* candidates and *approves* the appointment. Only
 * an HRMO-approved appointment changes the official position and service record.
 */
export type Responsible = 'You' | 'AO II' | 'HRMO' | null;
export interface Stage { label: string; who: Responsible; needsYou: boolean; done: boolean; next: string }

export interface ApplicationLike {
  status?: string; stageStatus?: string | null; canResubmit?: boolean; transactionId?: number | null;
  requirementsCheck?: { status?: string | null } | null; cycle?: { status?: string | null } | null;
}

export function transactionStage(status: string | undefined, opts: { escalated?: boolean } = {}): Stage {
  switch ((status || '').toUpperCase()) {
    case 'DRAFT': return { label: 'Not submitted yet', who: 'You', needsYou: true, done: false, next: 'Upload the required documents, then submit to AO II.' };
    case 'PENDING_VALIDATION': return { label: 'Waiting for AO II validation', who: 'AO II', needsYou: false, done: false, next: 'AO II is checking your documents.' };
    case 'FOR_APPROVAL': return opts.escalated
      ? { label: 'With HRMO after repeated corrections', who: 'HRMO', needsYou: false, done: false, next: 'HRMO will tell you exactly what to fix; AO II then validates the corrected files.' }
      : { label: 'Validated by AO II · waiting for HRMO approval', who: 'HRMO', needsYou: false, done: false, next: 'HRMO gives the final approval.' };
    case 'DEFICIENCY': return { label: 'Returned for correction', who: 'You', needsYou: true, done: false, next: 'Replace the returned document, then resubmit.' };
    case 'APPROVED': case 'COMPLETED': return { label: 'Approved by HRMO · appointment effective', who: null, needsYou: false, done: true, next: 'Your position and service record are updated.' };
    case 'REJECTED': return { label: 'Not approved (final decision)', who: null, needsYou: false, done: true, next: 'See the reason recorded on the transaction.' };
    case 'ABANDONED': case 'ARCHIVED': return { label: 'Closed', who: null, needsYou: false, done: true, next: 'No further action.' };
    default: return { label: status || 'Unknown', who: null, needsYou: false, done: false, next: '' };
  }
}

/** A promotion application before (or without) its appointment transaction. */
export function applicationStage(a: ApplicationLike): Stage {
  const stage = (a.stageStatus || '').toUpperCase();
  const status = (a.status || '').toUpperCase();
  if (stage === 'CANCELLED' || (a.cycle?.status || '').toUpperCase() === 'CANCELLED') return { label: 'Promotion cycle cancelled', who: null, needsYou: false, done: true, next: 'No further action.' };
  if (status === 'APPROVED' || stage === 'OFFICIALLY_PROMOTED') return { label: 'Appointed', who: null, needsYou: false, done: true, next: 'Your position and service record are updated.' };
  if (status === 'REJECTED' || stage === 'NOT_SELECTED') return { label: 'Not selected', who: null, needsYou: false, done: true, next: 'You can apply to future vacancies.' };
  if (a.canResubmit) return { label: 'Returned for correction', who: 'You', needsYou: true, done: false, next: 'Replace the documents AO II marked, then resubmit.' };
  if (a.transactionId || stage === 'SELECTED_PENDING_DOCS') return { label: 'Selected · appointment in progress', who: 'You', needsYou: false, done: false, next: 'Complete the appointment requirements.' };
  if (['FINAL_RANKED', 'INITIAL_RATED'].includes(stage) || status === 'RANKED') return { label: 'Ranked · waiting for HRMO selection', who: 'HRMO', needsYou: false, done: false, next: 'HRMO selects the candidate.' };
  if ((a.requirementsCheck?.status || '').toUpperCase() === 'COMPLETE' || stage === 'REQUIREMENTS_VERIFIED') return { label: 'Requirements checked · waiting for HRMO rating', who: 'HRMO', needsYou: false, done: false, next: 'HRMO rates and ranks the applicants.' };
  return { label: 'Waiting for AO II to check requirements', who: 'AO II', needsYou: false, done: false, next: 'AO II checks your attached documents.' };
}
