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

type ContestApp = { id: number; status: string; scoreDetailsJson: unknown; personnel?: { firstName?: string | null; lastName?: string | null } | null };

/** No longer competing: rejected, or discontinued with its cycle. */
export const isOutOfContest = (app: ContestApp): boolean => {
  const details = asDetails(app.scoreDetailsJson);
  return app.status === 'REJECTED' || details.stageStatus === 'CANCELLED' || Boolean(details.cycleCancelled);
};

const namesOf = (apps: ContestApp[]): string =>
  apps.map(a => [a.personnel?.firstName, a.personnel?.lastName].filter(Boolean).join(' ') || `application #${a.id}`).join(', ');

/**
 * Selection compares everyone in the contest, so it waits until each applicant
 * is resolved: AO II has checked their requirements, and every applicant found
 * complete has been deliberated. Otherwise one favoured applicant could be rated
 * and selected before the others were even scored. Applicants returned as
 * deficient do not hold up selection: the next step is theirs, not the board's.
 */
export const cycleSelectionBlockReason = (apps: ContestApp[]): string | null => {
  const inContest = apps.filter(a => !isOutOfContest(a));
  const awaitingCheck = inContest.filter(a => !requirementsVerification(a.scoreDetailsJson));
  if (awaitingCheck.length > 0) {
    return `${awaitingCheck.length} applicant(s) still await the AO II completeness check (${namesOf(awaitingCheck)}). Selection can follow only once every applicant is checked and deliberated.`;
  }
  const undeliberated = inContest.filter(a => isRequirementsVerified(a.scoreDetailsJson) && !isDeliberated(a.scoreDetailsJson));
  if (undeliberated.length > 0) {
    return `${undeliberated.length} verified applicant(s) have not been deliberated yet (${namesOf(undeliberated)}). Rate every verified applicant before selecting.`;
  }
  return null;
};
