export const MAX_CORRECTION_RESUBMISSIONS = 3;

export interface SubmissionTransition {
  isResubmission: boolean;
  shouldEscalate: boolean;
  nextStatus: 'PENDING_VALIDATION' | 'FOR_APPROVAL';
  incrementResubmissionCount: boolean;
}

export function getSubmissionTransition(status: string, resubmissionCount: number): SubmissionTransition {
  const isResubmission = status === 'DEFICIENCY';
  const shouldEscalate = isResubmission && resubmissionCount >= MAX_CORRECTION_RESUBMISSIONS;
  return {
    isResubmission,
    shouldEscalate,
    nextStatus: shouldEscalate ? 'FOR_APPROVAL' : 'PENDING_VALIDATION',
    incrementResubmissionCount: isResubmission && !shouldEscalate,
  };
}
