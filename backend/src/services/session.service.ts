import crypto from 'crypto';
import type { Request } from 'express';
import prisma from '../config/prisma';
import { config } from '../config';

/**
 * Refresh-token storage and session limits. Tokens are stored only as SHA-256
 * hashes, so a copy of the database cannot be replayed as sessions. A browser
 * session that goes unused for the web idle limit ends; the phone app keeps
 * the normal lifetime (a personal device, and the app has its own sign-out).
 */
export const hashRefreshToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

export type SessionClient = 'web' | 'app';

export const sessionClient = (req: Request): SessionClient =>
  req.body?.deviceName === 'Digital 201 app' || /^Dart\//.test(String(req.headers['user-agent'] || '')) ? 'app' : 'web';

/** The row to create for a newly issued refresh token. */
export const refreshTokenRow = (userId: number, token: string, req: Request, expiresAt: Date) => ({
  userId, token: hashRefreshToken(token), expiresAt, client: sessionClient(req),
});

/** Keeps at most maxConcurrentSessions live sessions per account; the oldest end first. */
export const capSessions = async (userId: number): Promise<void> => {
  const live = await prisma.refreshToken.findMany({
    where: { userId, revoked: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  const excess = live.slice(config.session.maxConcurrentSessions).map(r => r.id);
  if (excess.length > 0) await prisma.refreshToken.updateMany({ where: { id: { in: excess } }, data: { revoked: true } });
};

/** Whether a stored session has gone unused past its client's idle limit. */
export const isSessionIdle = (row: { client: string; lastUsedAt: Date }): boolean =>
  row.client === 'web' && Date.now() - row.lastUsedAt.getTime() > config.session.webRefreshIdleMinutes * 60_000;

/** Requests from the Flutter phone app (Dart's HTTP client). */
export const isPhoneApp = (req: Request): boolean => /^Dart\//.test(String(req.headers['user-agent'] || ''));

/** The app's build number, sent as X-App-Build from build 2 on; older builds send none (0). */
export const appBuildOf = (req: Request): number => Number(req.headers['x-app-build']) || 0;
