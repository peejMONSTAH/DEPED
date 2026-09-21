/**
 * Generates the initial password an administrator hands to a new account holder.
 *
 * Mirrors backend/src/utils/password-issue.util.ts. Every account used to be
 * created with the same literal, so anyone who learned it could sign in as any
 * account still holding it. Uses crypto.getRandomValues, not Math.random.
 *
 * The account is flagged `mustChangePassword` server-side either way, so this
 * password only ever works for setting a real one.
 */
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*?';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

const randomInt = (max: number): number => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
};

const pick = (alphabet: string): string => alphabet[randomInt(alphabet.length)];

export const generateInitialPassword = (length = 16): string => {
  const size = Math.max(12, length);
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < size) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};
