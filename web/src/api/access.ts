/**
 * How the web client treats a record the server will not show this account.
 *
 * The API answers a record outside the caller's station exactly as it answers
 * a missing one (404), and an action the caller's role may not take with 403.
 * The client does not try to tell a missing record from a hidden one. Either way
 * nothing about the record may stay on screen, and the officer is returned to
 * the list the server did return. Station filtering here would only be cosmetic:
 * the server decides, and the client never infers access from displayed text.
 */

type HttpError = { response?: { status?: number; data?: { message?: unknown } } } | null | undefined;

const statusOf = (error: unknown): number | undefined => (error as HttpError)?.response?.status;

/** True when the server refused the record: gone, out of scope, or not permitted. */
export const isAccessDenied = (error: unknown): boolean => {
  const status = statusOf(error);
  return status === 403 || status === 404;
};

export type ScopedRecord = 'applicant' | 'transaction' | 'personnel record' | 'document';

export const accessDeniedMessage = (record: ScopedRecord): string => `You do not have access to this ${record}.`;

/**
 * What to tell the officer after a refusal. A 404 is always the generic
 * no-access message, because the server says nothing more by design. A 403
 * keeps the server's explanation, e.g. "You cannot validate your own
 * transaction.", since it concerns the officer's own permissions, not someone
 * else's record.
 */
export const refusalMessage = (error: unknown, record: ScopedRecord): string => {
  if (statusOf(error) === 403) {
    const message = (error as HttpError)?.response?.data?.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return accessDeniedMessage(record);
};
