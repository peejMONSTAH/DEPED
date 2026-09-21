/**
 * Stage gates for the DepEd promotion sequence (DO 007, s. 2023):
 *
 *   applicant applies and submits Annex C
 *     -> AO II verifies documentary completeness
 *       -> HRMPSB/HRMO deliberates the comparative assessment
 *         -> ranking is generated
 *           -> HR selects the candidate for appointment
 *
 * Each endpoint used to assume the previous stage had run, but nothing enforced
 * it: an application AO II had never touched could be deliberated, ranked and
 * selected through direct API calls. These helpers make the precondition
 * explicit and are shared by every stage so the rule cannot drift apart.
 */

type Details = Record<string, any>;

const asDetails = (scoreDetailsJson: unknown): Details =>
  (scoreDetailsJson as Details) || {};

/** The AO II completeness record, or null when AO II has not reviewed it. */
export const requirementsVerification = (scoreDetailsJson: unknown): Details | null =>
  asDetails(scoreDetailsJson).requirementsCheck ?? null;

/** True only when AO II has explicitly confirmed the requirements are COMPLETE. */
export const isRequirementsVerified = (scoreDetailsJson: unknown): boolean =>
  requirementsVerification(scoreDetailsJson)?.status === 'COMPLETE';

/** True once the HRMPSB has recorded a final comparative assessment. */
export const isDeliberated = (scoreDetailsJson: unknown): boolean =>
  Boolean(asDetails(scoreDetailsJson).finalRating);

/**
 * Why deliberation cannot start yet, or null when it may proceed.
 * Distinguishes "not reviewed yet" from "reviewed and found deficient" because
 * those need different actions from the officer reading the message.
 */
export const deliberationBlockReason = (scoreDetailsJson: unknown): string | null => {
  const check = requirementsVerification(scoreDetailsJson);
  if (!check) {
    return 'The Administrative Officer II has not verified this applicant\'s documentary requirements yet. Deliberation can begin once completeness is confirmed.';
  }
  if (check.status !== 'COMPLETE') {
    return 'The Administrative Officer II marked these documentary requirements as INCOMPLETE. Deliberation cannot proceed until they are verified complete.';
  }
  return null;
};

/** Why this candidate cannot be selected yet, or null when selection may proceed. */
export const selectionBlockReason = (scoreDetailsJson: unknown): string | null => {
  const requirements = deliberationBlockReason(scoreDetailsJson);
  if (requirements) return requirements;
  if (!isDeliberated(scoreDetailsJson)) {
    return 'This applicant has not been deliberated by the HRMPSB yet. Selection can only follow a completed comparative assessment.';
  }
  return null;
};
