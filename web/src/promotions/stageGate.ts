/**
 * Client-side mirror of backend/src/utils/promotion-stage.util.ts.
 *
 * The server is the authority — it rejects an out-of-sequence deliberation with
 * REQUIREMENTS_NOT_VERIFIED. This exists so HR is told before filling in a whole
 * scoring form, not after submitting one. Keep the two in step.
 */

type Details = Record<string, any>;

const asDetails = (scoreDetailsJson: unknown): Details => (scoreDetailsJson as Details) || {};

export const isRequirementsVerified = (scoreDetailsJson: unknown): boolean =>
  asDetails(scoreDetailsJson).requirementsCheck?.status === 'COMPLETE';

export const isDeliberated = (scoreDetailsJson: unknown): boolean =>
  Boolean(asDetails(scoreDetailsJson).finalRating);

/** Why deliberation cannot start, or null when it may proceed. */
export const deliberationBlockReason = (scoreDetailsJson: unknown): string | null => {
  const check = asDetails(scoreDetailsJson).requirementsCheck;
  if (!check) {
    return 'The Administrative Officer II has not verified this applicant\u2019s documentary requirements yet. Deliberation can begin once completeness is confirmed.';
  }
  if (check.status !== 'COMPLETE') {
    return 'The Administrative Officer II marked these documentary requirements as INCOMPLETE. Deliberation cannot proceed until they are verified complete.';
  }
  return null;
};
