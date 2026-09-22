import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { invalidateAuthUserCache } from '../middleware/auth.middleware';
import { verifyPassword, hashPassword } from '../utils/hash.util';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, verifyMagicToken, passwordTokenVersion } from '../utils/jwt.util';
import { sendSuccess, sendError, sendUnauthorized, sendBadRequest, sendNotFound } from '../utils/response.util';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * POST /auth/login
 * Authenticates user and issues JWT tokens (BR-57, BR-58, BR-59)
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    sendBadRequest(res, 'Email and password are required.');
    return;
  }

  const rawInput = String(email).trim().toLowerCase();
  const username = rawInput.includes('@') ? rawInput.split('@')[0] : rawInput;

  let user: any = null;
  const userInclude = {
    role: true,
    personnel: { select: { id: true, firstName: true, lastName: true, designation: true, address: true } },
  };

  try {
    // 1. Direct exact match
    // citext: this matches any capitalisation, and unlike the ILIKE that
    // `mode: 'insensitive'` produced it uses users_email_key instead of
    // scanning the table.
    user = await prisma.user.findUnique({
      where: { email: rawInput },
      include: userInclude,
    });

    // 2. Flexible fallback: match by username prefix or standard division domain aliases
    if (!user) {
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: `${username}@deped.koronadal.gov.ph` },
            { email: `${username}@deped.gov.ph` },
            { email: `${username}@deped.gov` },
            { email: { startsWith: `${username}@` } },
          ],
        },
        include: userInclude,
      });
    }
  } catch (err) {
    logger.warn('DB Connection retry for login user query...');
    try {
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: rawInput },
            { email: { startsWith: `${username}@` } },
          ],
        },
        include: userInclude,
      });
    } catch (retryErr) {
      logger.error({ err: retryErr }, 'Database connection unreachable during login');
      sendError(res, 'Database connection temporary timeout. Please try logging in again.', 503);
      return;
    }
  }

  if (!user) {
    sendUnauthorized(res, 'Invalid email or password.');
    return;
  }

  if (user.accountStatus === 'PENDING') {
    sendError(
      res,
      'Your account credentials have not yet been distributed by the System Administrator. Access is not permitted until your credentials have been distributed.',
      403,
      'ACCOUNT_NOT_DISTRIBUTED'
    );
    return;
  }

  if (user.accountStatus !== 'ACTIVE') {
    sendError(res, `Account is ${user.accountStatus.toLowerCase()}. Contact your administrator.`, 403, 'ACCOUNT_INACTIVE');
    return;
  }

  const isValid = await verifyPassword(user.passwordHash, password);

  if (!isValid) {
    // Log failed login attempt
    try {
      await prisma.validationLog.create({
        data: {
          entityType: 'User',
          entityId: user.id,
          action: 'LOGIN_FAILED',
          detailsJson: { reason: 'invalid_password' },
          userId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          status: 'FAILED',
        },
      });
      res.locals.auditLogged = true;
    } catch (logErr) {
      logger.error({ err: logErr }, 'Failed to log failed login attempt');
    }

    sendUnauthorized(res, 'Invalid email or password.');
    return;
  }

  // Generate tokens
  const tokenPayload = { userId: user.id, email: user.email, role: user.role.name, pwdv: passwordTokenVersion(user.passwordHash) };
  // Surfaced so the client can go straight to the change screen; the API enforces
  // it regardless of what the client does with this.
  const mustChangePassword = user.mustChangePassword === true;
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  // Save refresh token & reset failed attempts
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  try {
    await prisma.$transaction([
      prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt } }),
      prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      }),
      prisma.validationLog.create({
        data: {
          entityType: 'User',
          entityId: user.id,
          action: 'LOGIN_SUCCESS',
          detailsJson: { role: user.role.name },
          userId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          status: 'SUCCESS',
        },
      }),
    ]);
    res.locals.auditLogged = true;
  } catch (txErr) {
    logger.warn({ err: txErr }, 'Login succeeded but its transaction failed; refresh token written via fallback');
    try {
      await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt } });
    } catch (rfErr) {
      logger.error({ err: rfErr }, 'Failed to persist refresh token on fallback');
    }
  }

  sendSuccess(res, {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role.name,
      accountStatus: user.accountStatus,
      firstName: user.personnel?.firstName,
      lastName: user.personnel?.lastName,
      designation: user.personnel?.designation,
      address: user.personnel?.address,
      personnelId: user.personnel?.id ?? null,
      mustChangePassword,
    },
  });
};

/**
 * POST /auth/refresh-token
 */
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken: token } = req.body;

  if (!token) {
    sendBadRequest(res, 'Refresh token is required.');
    return;
  }

  try {
    const payload = verifyRefreshToken(token);

    let storedToken: any = null;
    try {
      storedToken = await prisma.refreshToken.findUnique({ where: { token } });
    } catch {
      try {
        storedToken = await prisma.refreshToken.findUnique({ where: { token } });
      } catch {
        sendUnauthorized(res, 'Database connection timeout.');
        return;
      }
    }
    if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date()) {
      sendUnauthorized(res, 'Invalid or expired refresh token.');
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { role: true },
    });
    if (!user || user.accountStatus !== 'ACTIVE' || payload.pwdv !== passwordTokenVersion(user.passwordHash)) {
      sendUnauthorized(res, 'User not found or account is not active/distributed.');
      return;
    }

    const newAccessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role.name, pwdv: passwordTokenVersion(user.passwordHash) });

    sendSuccess(res, { accessToken: newAccessToken });
  } catch {
    sendUnauthorized(res, 'Invalid refresh token.');
  }
};

/**
 * POST /auth/logout
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken: token } = req.body;

  if (token) {
    await prisma.refreshToken.updateMany({
      where: { token },
      data: { revoked: true },
    });
  }

  // Log logout
  if (req.user) {
    await prisma.validationLog.create({
      data: {
        entityType: 'User',
        entityId: req.user.userId,
        action: 'LOGOUT',
        userId: req.user.userId,
        ipAddress: req.ip,
        status: 'SUCCESS',
      },
    });
    res.locals.auditLogged = true;
  }

  sendSuccess(res, null, 'Logged out successfully.');
};

/**
 * POST /auth/change-password
 * Compulsory password change on first login or user request
 */
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user?.userId;

  if (!userId || !currentPassword || !newPassword) {
    sendBadRequest(res, 'Current password and new password are required.');
    return;
  }

  const { hashPassword, validatePasswordComplexity } = await import('../utils/hash.util');

  const passCheck = validatePasswordComplexity(newPassword);
  if (!passCheck.valid) {
    sendBadRequest(res, passCheck.message!);
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    sendNotFound(res, 'User not found.');
    return;
  }

  const isValid = await verifyPassword(user.passwordHash, currentPassword);
  if (!isValid) {
    sendBadRequest(res, 'Current password is incorrect.');
    return;
  }

  const newHash = await hashPassword(newPassword);

  await prisma.$transaction([
    // Setting their own password is what clears the forced-change gate.
    prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash, accountStatus: 'ACTIVE', mustChangePassword: false } }),
    prisma.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } }),
    prisma.validationLog.create({ data: { entityType: 'User', entityId: userId, action: 'PASSWORD_CHANGED', userId, ipAddress: req.ip, status: 'SUCCESS' } }),
  ]);
  res.locals.auditLogged = true;

  // authenticate() caches the user for 30s, including the password hash it
  // compares tokens against and the mustChangePassword flag. Without this the
  // freshly issued token is rejected as stale for up to half a minute, right
  // after the change the user was forced to make.
  invalidateAuthUserCache(userId);

  sendSuccess(res, { accountStatus: 'ACTIVE' }, 'Password changed successfully. Your account is now ACTIVE.');
};

/**
 * POST /auth/magic-login
 * Seamless 1-click authentication from deficiency email links
 */
export const magicLogin = async (req: Request, res: Response): Promise<void> => {
  const { token } = req.body;

  if (!token) {
    sendBadRequest(res, 'Magic login token is required.');
    return;
  }

  try {
    const payload = verifyMagicToken(token);
    const jti = payload.jti || `${payload.userId}_${payload.txId || 'auth'}`;

    // Prevent token reuse (Single-Use Magic Link Enforcement)
    const existingUsed = await (prisma as any).usedMagicToken?.findUnique({
      where: { jti },
    }).catch(() => null);

    if (existingUsed) {
      sendUnauthorized(res, 'This 1-click magic access link has already been used. Please log in with your account credentials.');
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        role: true,
        personnel: { select: { id: true, firstName: true, lastName: true, designation: true, address: true } },
      },
    });

    if (!user || user.accountStatus !== 'ACTIVE') {
      sendUnauthorized(res, 'User account is inactive or not found.');
      return;
    }

    // A password change must invalidate outstanding magic links the same way it
    // invalidates refresh tokens (see refreshToken above). The token already
    // carries pwdv; it was simply never compared, so a link minted before a
    // reset stayed usable for the rest of its 48h life.
    if (payload.pwdv !== passwordTokenVersion(user.passwordHash)) {
      sendUnauthorized(res, 'This access link is no longer valid because the account password has changed. Please log in with your credentials.');
      return;
    }

    const accessToken = generateAccessToken({
      userId: user.id,
      role: user.role.name,
      email: user.email,
      pwdv: passwordTokenVersion(user.passwordHash),
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      role: user.role.name,
      email: user.email,
      pwdv: passwordTokenVersion(user.passwordHash),
    });

    // Consume the one-time link and create its session atomically.
    const expiresAt = payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 48 * 60 * 60 * 1000);
    await prisma.$transaction([
      prisma.usedMagicToken.create({ data: { jti, userId: user.id, expiresAt } }),
      prisma.refreshToken.create({ data: { userId: user.id, token: refreshToken, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } }),
    ]);

    // Audit log
    await prisma.validationLog.create({
      data: {
        entityType: 'User',
        entityId: user.id,
        action: 'MAGIC_LOGIN',
        userId: user.id,
        ipAddress: req.ip,
        status: 'SUCCESS',
        detailsJson: { txId: payload.txId, jti },
      },
    });
    res.locals.auditLogged = true;

    sendSuccess(
      res,
      {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role.name,
          accountStatus: user.accountStatus,
          personnel: user.personnel,
        },
        txId: payload.txId,
      },
      'Authenticated via 1-click magic access link.'
    );
  } catch (err: any) {
    sendUnauthorized(res, 'Invalid or expired magic login link. Please log in with your DepEd credentials.');
  }
};
