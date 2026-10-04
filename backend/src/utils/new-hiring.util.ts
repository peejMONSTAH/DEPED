/**
 * New hiring (registering external applicants into Teacher I cycles and issuing a
 * Newly Hired Appointment) is suspended. Promotion of existing personnel is unaffected.
 * Set NEW_HIRING_ENABLED=true to bring it back; nothing else needs to change.
 */
export const newHiringEnabled = (): boolean => /^(1|true|on|yes)$/i.test(process.env.NEW_HIRING_ENABLED || '');

export const NEW_HIRING_SUSPENDED_MESSAGE = 'New hiring is temporarily suspended. Only promotion of existing personnel is available.';

/** Teacher I is the entry rank, filled only by hiring someone new. */
export const isNewHiringPosition = (title: unknown): boolean =>
  /^teacher (?:i|1)$/.test(String(title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());

export const newHiringBlocked = (title: unknown): boolean => !newHiringEnabled() && isNewHiringPosition(title);
