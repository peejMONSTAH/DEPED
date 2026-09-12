import argon2 from 'argon2';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
  saltLength: 16,
};

/**
 * Hash a plain-text password using Argon2id (SECURITY.md spec)
 */
export const hashPassword = async (password: string): Promise<string> => {
  const clean = String(password || '').trim();
  const result = await argon2.hash(clean, ARGON2_OPTIONS as any);
  return String(result);
};

/**
 * Verify a plain-text password against an Argon2id hash
 */
export const verifyPassword = async (hash: string, plain: string): Promise<boolean> => {
  if (!hash || !plain) return false;
  try {
    const clean = String(plain).trim();
    if (hash.startsWith('$argon2')) {
      return await argon2.verify(hash, clean);
    }
    return hash === clean;
  } catch (err) {
    console.error('verifyPassword error:', err);
    return false;
  }
};

/**
 * Validate password complexity (DEMO: minimum 6 characters only)
 */
export const validatePasswordComplexity = (password: string): { valid: boolean; message?: string } => {
  const clean = String(password || '').trim();
  if (clean.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters long.' };
  }
  return { valid: true };
};
