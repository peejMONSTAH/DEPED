import crypto from 'crypto';

/**
 * Issuing an initial or reset password.
 *
 * Every account used to receive the same literal (`Personnel@Pass123`), and
 * resets a second one (`Reset@Pass2026!`). Anyone who learned either could sign
 * in as any account that still held it, and nothing ever prompted a change.
 * Passwords are now generated per account, and the account is flagged so the API
 * refuses everything but change-password until the holder sets their own.
 */

// Ambiguous glyphs are excluded: these get read aloud, written on paper and
// typed on phones, where 0/O and 1/l/I cause avoidable lockouts.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*?';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

const pick = (alphabet: string): string => alphabet[crypto.randomInt(alphabet.length)];

/**
 * A random password that satisfies the complexity rule in
 * `validatePasswordComplexity` (length, upper, lower, digit, symbol).
 */
export const generateInitialPassword = (length = 16): string => {
  const size = Math.max(12, length);
  // Guarantee one of each class, then fill and shuffle so position is not predictable.
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < size) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};
