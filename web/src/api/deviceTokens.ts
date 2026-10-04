/**
 * Trusted-device tokens, one per account. A token proves this browser passed the emailed code *for one
 * account*, so a single shared slot made every account switch overwrite the last account's token and
 * ask it for a code again. `deviceToken` stays as the token of whoever is signed in now: the API client
 * sends it as X-Device-Token.
 */
export const DEVICE_TOKEN_KEY = 'deviceToken';
export const DEVICE_TOKENS_KEY = 'deviceTokens';

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const keyOf = (email: string) => email.trim().toLowerCase();

const readMap = (store: Store): Record<string, string> => {
  try {
    const parsed = JSON.parse(store.getItem(DEVICE_TOKENS_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
};

/** The token to present at sign-in for this email; the old single token still works for whoever it belonged to. */
export const deviceTokenFor = (email: string, store: Store = localStorage): string | undefined =>
  readMap(store)[keyOf(email)] || store.getItem(DEVICE_TOKEN_KEY) || undefined;

/** Called after a sign-in: remember a newly issued token for this email, and make this account's token the current one. */
export const rememberDeviceToken = (email: string, issued: string | undefined, store: Store = localStorage): void => {
  const map = readMap(store);
  if (issued) { map[keyOf(email)] = issued; store.setItem(DEVICE_TOKENS_KEY, JSON.stringify(map)); }
  const current = issued || map[keyOf(email)];
  if (current) store.setItem(DEVICE_TOKEN_KEY, current);
};
