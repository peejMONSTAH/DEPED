export const MAX_CORRECTION_RESUBMISSIONS = 3;

export interface SubmissionTransition {
  isResubmission: boolean;
  shouldEscalate: boolean;
  nextStatus: 'PENDING_VALIDATION' | 'FOR_APPROVAL';
  incrementResubmissionCount: boolean;
}

/**
 * Where a (re)submission goes. After MAX_CORRECTION_RESUBMISSIONS corrections the
 * transaction escalates to HRMO once. HRMO reviews it and returns it with
 * instructions; from then on corrections go to AO II for validation (escalation
 * never bypasses AO II), and HRMO gives the final approval after that.
 */
export function getSubmissionTransition(status: string, resubmissionCount: number, escalationReviewed = false): SubmissionTransition {
  const isResubmission = status === 'DEFICIENCY';
  const shouldEscalate = isResubmission && !escalationReviewed && resubmissionCount >= MAX_CORRECTION_RESUBMISSIONS;
  return {
    isResubmission,
    shouldEscalate,
    nextStatus: shouldEscalate ? 'FOR_APPROVAL' : 'PENDING_VALIDATION',
    incrementResubmissionCount: isResubmission && !shouldEscalate,
  };
}
