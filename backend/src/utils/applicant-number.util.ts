/**
 * Applicant numbers are assigned by the server from the application's own id.
 * They used to be "APP-2026-" + (applicants in this cycle + 1), or a random
 * code sent by the browser: the column is unique across every cycle, so the
 * first applicant of a second cycle collided with the first of the first one
 * and could not apply, and the year was fixed at 2026.
 */
export const applicantNumberFor = (applicationId: number, appliedAt: Date = new Date()): string =>
  `APP-${appliedAt.getFullYear()}-${String(applicationId).padStart(5, '0')}`;
