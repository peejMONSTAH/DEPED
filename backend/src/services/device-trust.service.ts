import crypto from 'crypto';
import type { Request } from 'express';
import prisma from '../config/prisma';
import { config } from '../config';
import { logger } from '../utils/logger';
import { sendTransactionalEmail } from './email.service';

/**
 * New-device sign-in check. A password alone signs in only on a device that
 * earlier passed an emailed 6-digit code; anywhere else the account's email
 * gets a code first. Tokens and codes are stored only as SHA-256 hashes.
 */

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');
const randomCode = () => crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

/** Accepted in place of the emailed code only under NODE_ENV=test. */
const testCode = () => (process.env.NODE_ENV === 'test' ? process.env.DEVICE_CODE_FOR_TESTS : undefined);

/** "Chrome on Windows", "Digital 201 app on Android": what the person will recognise. */
export const describeDevice = (req: Request): string => {
  const explicit = typeof req.body?.deviceName === 'string' ? req.body.deviceName.trim().slice(0, 80) : '';
  if (explicit) return explicit;
  const ua = String(req.headers['user-agent'] || '');
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /Dart|okhttp/i.test(ua) ? 'Digital 201 app' : 'Browser';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
};

const maskEmail = (email: string) => {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`;
};

/** True when the device token presented belongs to this user and is still trusted. */
export const isTrustedDevice = async (userId: number, deviceToken: unknown): Promise<boolean> => {
  if (!config.deviceVerification.enabled) return true;
  if (typeof deviceToken !== 'string' || deviceToken.length < 20) return false;
  const device = await prisma.trustedDevice.findUnique({ where: { tokenHash: sha256(deviceToken) } });
  if (!device || device.userId !== userId || device.revokedAt || device.expiresAt < new Date()) return false;
  await prisma.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return true;
};

/** Marks the device trusted and returns the token it should keep. */
export const trustDevice = async (userId: number, req: Request): Promise<string> => {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + config.deviceVerification.trustDays * 86_400_000);
  await prisma.trustedDevice.create({
    data: { userId, tokenHash: sha256(token), label: describeDevice(req), ipAddress: req.ip, expiresAt },
  });
  return token;
};

const sendCodeEmail = async (user: { email: string; name: string }, code: string, label: string) => {
  if (config.env !== 'production' && !config.email.mailtrapApiToken && !config.email.host) {
    logger.info(`[DeviceVerification] Sign-in code for ${user.email}: ${code}`);
    return;
  }
  await sendTransactionalEmail({
    recipientEmail: user.email,
    recipientName: user.name,
    subject: `${code} is your Digital 201 sign-in code`,
    heading: 'Confirm it is you',
    message: `Someone signed in to your Digital 201 account from ${label}. If this was you, enter this code to finish signing in: ${code}. It expires in ${config.deviceVerification.codeMinutes} minutes. If it was not you, change your password now.`,
    sensitive: true,
  });
};

/** Starts a challenge and emails its code. Returns what the client needs to ask for it. */
export const startChallenge = async (user: { id: number; email: string; name: string }, req: Request) => {
  const token = randomToken();
  const code = randomCode();
  const label = describeDevice(req);
  // One open challenge per account: a new sign-in attempt replaces the old code.
  await prisma.loginChallenge.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
  await prisma.loginChallenge.create({
    data: {
      userId: user.id, tokenHash: sha256(token), codeHash: sha256(code), label, ipAddress: req.ip,
      expiresAt: new Date(Date.now() + config.deviceVerification.codeMinutes * 60_000),
    },
  });
  await sendCodeEmail(user, code, label);
  return { challengeToken: token, maskedEmail: maskEmail(user.email), resendAfterSeconds: config.deviceVerification.resendSeconds };
};

export type ChallengeResult =
  | { ok: true; userId: number }
  | { ok: false; code: 'CHALLENGE_INVALID' | 'CHALLENGE_EXPIRED' | 'CODE_WRONG' | 'TOO_MANY_ATTEMPTS'; message: string; attemptsLeft?: number };

export const verifyChallenge = async (challengeToken: unknown, code: unknown): Promise<ChallengeResult> => {
  if (typeof challengeToken !== 'string' || typeof code !== 'string') {
    return { ok: false, code: 'CHALLENGE_INVALID', message: 'Sign in again to get a new code.' };
  }
  const challenge = await prisma.loginChallenge.findUnique({ where: { tokenHash: sha256(challengeToken) } });
  if (!challenge || challenge.consumedAt) return { ok: false, code: 'CHALLENGE_INVALID', message: 'This code is no longer valid. Sign in again to get a new one.' };
  if (challenge.expiresAt < new Date()) return { ok: false, code: 'CHALLENGE_EXPIRED', message: 'This code has expired. Send a new code.' };
  if (challenge.attempts >= config.deviceVerification.maxAttempts) {
    return { ok: false, code: 'TOO_MANY_ATTEMPTS', message: 'Too many wrong codes. Send a new code.' };
  }
  const entered = code.replace(/\D/g, '');
  const matches = entered.length === 6 && (
    crypto.timingSafeEqual(Buffer.from(sha256(entered)), Buffer.from(challenge.codeHash)) || entered === testCode()
  );
  if (!matches) {
    const updated = await prisma.loginChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    const attemptsLeft = Math.max(0, config.deviceVerification.maxAttempts - updated.attempts);
    return attemptsLeft === 0
      ? { ok: false, code: 'TOO_MANY_ATTEMPTS', message: 'Too many wrong codes. Send a new code.' }
      : { ok: false, code: 'CODE_WRONG', message: `That code is not right. ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`, attemptsLeft };
  }
  // Spend it exactly once even if two submits race.
  const spent = await prisma.loginChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (spent.count !== 1) return { ok: false, code: 'CHALLENGE_INVALID', message: 'This code was already used. Sign in again.' };
  return { ok: true, userId: challenge.userId };
};

/** Sends a fresh code for an open challenge, at most once per resend window. */
export const resendChallenge = async (challengeToken: unknown) => {
  if (typeof challengeToken !== 'string') return { ok: false as const, message: 'Sign in again to get a new code.' };
  const challenge = await prisma.loginChallenge.findUnique({ where: { tokenHash: sha256(challengeToken) }, include: { user: { include: { personnel: true } } } });
  if (!challenge || challenge.consumedAt) return { ok: false as const, message: 'Sign in again to get a new code.' };
  const wait = config.deviceVerification.resendSeconds * 1000 - (Date.now() - challenge.lastSentAt.getTime());
  if (wait > 0) return { ok: false as const, message: `Wait ${Math.ceil(wait / 1000)} seconds before sending another code.`, retryAfterSeconds: Math.ceil(wait / 1000) };
  const code = randomCode();
  await prisma.loginChallenge.update({
    where: { id: challenge.id },
    data: { codeHash: sha256(code), attempts: 0, lastSentAt: new Date(), expiresAt: new Date(Date.now() + config.deviceVerification.codeMinutes * 60_000) },
  });
  const name = challenge.user.personnel ? `${challenge.user.personnel.firstName} ${challenge.user.personnel.lastName}` : challenge.user.email;
  await sendCodeEmail({ email: challenge.user.email, name }, code, challenge.label);
  return { ok: true as const, resendAfterSeconds: config.deviceVerification.resendSeconds };
};

/** "New sign-in" notice after a device is trusted; failure never blocks sign-in. */
export const notifyNewDevice = (user: { email: string; name: string }, req: Request) => {
  if (config.env !== 'production') return;
  const when = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
  void sendTransactionalEmail({
    recipientEmail: user.email,
    recipientName: user.name,
    subject: 'New sign-in to your Digital 201 account',
    heading: 'New device signed in',
    message: `Your account was signed in from ${describeDevice(req)} on ${when}. If this was you, there is nothing to do. If not, change your password now and remove the device from your Profile page.`,
    actionLabel: 'Open Digital 201',
    actionUrl: config.clientUrl,
  }).catch(err => logger.warn({ err }, 'New-device notice failed'));
};

export const listDevices = (userId: number) => prisma.trustedDevice.findMany({
  where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
  orderBy: { lastUsedAt: 'desc' },
  select: { id: true, label: true, ipAddress: true, createdAt: true, lastUsedAt: true, tokenHash: true },
});

export const revokeDevice = (userId: number, id: number) =>
  prisma.trustedDevice.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });

/** A password change forgets every trusted device: a thief who knew the old password gains nothing. */
export const revokeAllDevices = (userId: number, keepToken?: unknown) =>
  prisma.trustedDevice.updateMany({
    where: { userId, revokedAt: null, ...(typeof keepToken === 'string' && keepToken ? { NOT: { tokenHash: sha256(keepToken) } } : {}) },
    data: { revokedAt: new Date() },
  });

export const hashDeviceToken = sha256;
