import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { invalidateAuthUserCache } from '../middleware/auth.middleware';
import { verifyPassword, hashPassword } from '../utils/hash.util';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, verifyMagicToken, passwordTokenVersion } from '../utils/jwt.util';
import { sendSuccess, sendError, sendUnauthorized, sendBadRequest, sendNotFound } from '../utils/response.util';
import { config } from '../config';
import { logger } from '../utils/logger';
import { capSessions, hashRefreshToken, isPhoneApp, isSessionIdle, refreshTokenRow } from '../services/session.service';
import {
  isTrustedDevice, startChallenge, verifyChallenge, resendChallenge, trustDevice, notifyNewDevice,
  listDevices, revokeDevice, revokeAllDevices, hashDeviceToken,
} from '../services/device-trust.service';

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
    personnel: { select: { id: true, firstName: true, lastName: true, designation: true, address: true, school: true, district: true } },
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

    // 2. A bare username ("jdelacruz") means one of the division's own domains,
    // tried in a fixed order. Never a prefix match, and never when a full email
    // was typed: "juan" must not sign in whichever account happens to start with it.
    if (!user && !rawInput.includes('@')) {
      for (const domain of ['deped.gov.ph', 'deped.koronadal.gov.ph', 'deped.gov']) {
        user = await prisma.user.findUnique({ where: { email: `${username}@${domain}` }, include: userInclude });
        if (user) break;
      }
    }
  } catch (err) {
    logger.warn('DB Connection retry for login user query...');
    try {
      user = await prisma.user.findUnique({ where: { email: rawInput }, include: userInclude });
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

  // A password alone is enough only on a device that earlier passed an emailed code
  // (accounts from before the check was introduced are exempt).
  if (user.deviceVerification && !(await isTrustedDevice(user.id, req.body.deviceToken))) {
    // App builds from before this check cannot show the code screen; tell them to update.
    if (isPhoneApp(req) && req.body.deviceName === undefined) {
      sendError(res, 'Update the Digital 201 app to the latest version to sign in on this phone.', 426, 'APP_UPDATE_REQUIRED');
      return;
    }
    try {
      const challenge = await startChallenge({ id: user.id, email: user.email, name: displayName(user) }, req);
      sendSuccess(res, { requiresVerification: true, ...challenge }, 'Enter the code sent to your email.');
    } catch (err) {
      logger.error({ err }, 'Could not send the sign-in code');
      sendError(res, 'The sign-in code could not be emailed. Try again in a minute.', 503, 'CODE_NOT_SENT');
    }
    return;
  }

  await completeSignIn(user, req, res);
};

const displayName = (user: any) =>
  user.personnel ? `${user.personnel.firstName} ${user.personnel.lastName}` : user.email;

/** Issues the session once the password (and, where needed, the device) is proven. */
const completeSignIn = async (user: any, req: Request, res: Response, extra: Record<string, unknown> = {}): Promise<void> => {
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
      prisma.refreshToken.create({ data: refreshTokenRow(user.id, refreshToken, req, expiresAt) }),
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
      await prisma.refreshToken.create({ data: refreshTokenRow(user.id, refreshToken, req, expiresAt) });
    } catch (rfErr) {
      logger.error({ err: rfErr }, 'Failed to persist refresh token on fallback');
    }
  }

  await capSessions(user.id);
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
    ...extra,
  });
};

const signInInclude = {
  role: true,
  personnel: { select: { id: true, firstName: true, lastName: true, designation: true, address: true, school: true, district: true } },
};

/**
 * POST /auth/verify-device  { challengeToken, code }
 * Finishes a sign-in from a new device and trusts that device.
 */
export const verifyDevice = async (req: Request, res: Response): Promise<void> => {
  const result = await verifyChallenge(req.body?.challengeToken, req.body?.code);
  if (!result.ok) {
    sendError(res, result.message, result.code === 'CODE_WRONG' ? 400 : 410, result.code);
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: result.userId }, include: signInInclude });
  if (!user || user.accountStatus !== 'ACTIVE') {
    sendError(res, 'This account cannot sign in. Contact your administrator.', 403, 'ACCOUNT_INACTIVE');
    return;
  }
  const deviceToken = await trustDevice(user.id, req);
  notifyNewDevice({ email: user.email, name: displayName(user) }, req);
  await completeSignIn(user, req, res, { deviceToken });
};

/** POST /auth/resend-code  { challengeToken } */
export const resendCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await resendChallenge(req.body?.challengeToken);
    if (!result.ok) {
      sendError(res, result.message, 'retryAfterSeconds' in result ? 429 : 410, 'retryAfterSeconds' in result ? 'RESEND_TOO_SOON' : 'CHALLENGE_INVALID');
      return;
    }
    sendSuccess(res, { resendAfterSeconds: result.resendAfterSeconds }, 'A new code was sent.');
  } catch (err) {
    logger.error({ err }, 'Could not resend the sign-in code');
    sendError(res, 'The code could not be emailed. Try again in a minute.', 503, 'CODE_NOT_SENT');
  }
};

/** GET /auth/devices — this account's trusted devices; `current` marks the caller's. */
export const getDevices = async (req: Request, res: Response): Promise<void> => {
  const current = req.headers['x-device-token'];
  const currentHash = typeof current === 'string' && current ? hashDeviceToken(current) : null;
  const devices = await listDevices(req.user!.userId);
  sendSuccess(res, devices.map(({ tokenHash, ...d }) => ({ ...d, current: tokenHash === currentHash })));
};

/** DELETE /auth/devices/:id — the device will need a code at its next sign-in. */
export const removeDevice = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { sendBadRequest(res, 'Invalid device.'); return; }
  const result = await revokeDevice(req.user!.userId, id);
  if (result.count === 0) { sendNotFound(res, 'Device not found.'); return; }
  sendSuccess(res, null, 'Device removed.');
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
      storedToken = await prisma.refreshToken.findUnique({ where: { token: hashRefreshToken(token) } });
    } catch {
      try {
        storedToken = await prisma.refreshToken.findUnique({ where: { token: hashRefreshToken(token) } });
      } catch {
        sendUnauthorized(res, 'Database connection timeout.');
        return;
      }
    }
    if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date() || storedToken.userId !== payload.userId) {
      sendUnauthorized(res, 'Invalid or expired refresh token.');
      return;
    }
    // A browser left unused ends its session (shared school computers).
    if (isSessionIdle(storedToken)) {
      await prisma.refreshToken.update({ where: { id: storedToken.id }, data: { revoked: true } });
      sendError(res, 'You were signed out after a period of inactivity. Please sign in again.', 401, 'SESSION_IDLE');
      return;
    }
    await prisma.refreshToken.update({ where: { id: storedToken.id }, data: { lastUsedAt: new Date() } });

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

  if (typeof token === 'string' && token) {
    // Only the caller's own session: knowing another account's token is not enough.
    await prisma.refreshToken.updateMany({
      where: { token: hashRefreshToken(token), userId: req.user!.userId },
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
  // Other devices must prove themselves again; the one making the change stays trusted.
  await revokeAllDevices(userId, req.headers['x-device-token']);

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
    if (payload.purpose === 'ACCOUNT_SETUP') {
      sendUnauthorized(res, 'This is an account setup link. Open it to choose your password.');
      return;
    }
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
        personnel: { select: { id: true, firstName: true, lastName: true, designation: true, address: true, school: true, district: true } },
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
      prisma.refreshToken.create({ data: refreshTokenRow(user.id, refreshToken, req, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) }),
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
    // The link came to the account's own inbox, so this device is proven.
    const deviceToken = await trustDevice(user.id, req);
    res.locals.auditLogged = true;

    await capSessions(user.id);
    sendSuccess(
      res,
      {
        accessToken,
        refreshToken,
        deviceToken,
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

/**
 * POST /auth/complete-setup  { token, newPassword }
 *
 * Finishes the setup link emailed when an account's access is distributed:
 * the holder chooses their own password and is signed in. The link is spent
 * here, on submit, not when the page is opened, so a mail scanner that
 * prefetches links cannot use it up. It is single-use, expires after 48 hours,
 * and is void once the password changes by any route.
 */
export const completeAccountSetup = async (req: Request, res: Response): Promise<void> => {
  const { token, newPassword } = req.body || {};
  if (typeof token !== 'string' || !token || typeof newPassword !== 'string' || !newPassword) {
    sendBadRequest(res, 'The setup link and a new password are required.');
    return;
  }

  let payload;
  try {
    payload = verifyMagicToken(token);
  } catch {
    sendUnauthorized(res, 'This setup link is invalid or has expired. Ask your AO II or System Administrator to send a new one.');
    return;
  }
  if (payload.purpose !== 'ACCOUNT_SETUP' || !payload.jti) {
    sendUnauthorized(res, 'This link cannot be used to set up an account.');
    return;
  }

  const { validatePasswordComplexity } = await import('../utils/hash.util');
  const passCheck = validatePasswordComplexity(newPassword);
  if (!passCheck.valid) {
    sendBadRequest(res, passCheck.message!);
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { role: true, personnel: { select: { id: true, firstName: true, lastName: true, designation: true, address: true, school: true, district: true } } },
  });
  if (!user || user.accountStatus !== 'ACTIVE') {
    sendUnauthorized(res, 'This account is not active. Contact your AO II or System Administrator.');
    return;
  }
  if (payload.pwdv !== passwordTokenVersion(user.passwordHash)) {
    sendUnauthorized(res, 'This setup link is no longer valid because the password was already changed. Sign in with your password.');
    return;
  }
  if (await verifyPassword(user.passwordHash, newPassword)) {
    sendBadRequest(res, 'Choose a new password, not the temporary one you were issued.');
    return;
  }

  const newHash = await hashPassword(newPassword);
  const pwdv = passwordTokenVersion(newHash);
  const accessToken = generateAccessToken({ userId: user.id, role: user.role.name, email: user.email, pwdv });
  const refreshTokenValue = generateRefreshToken({ userId: user.id, role: user.role.name, email: user.email, pwdv });
  const linkExpiresAt = payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 48 * 60 * 60 * 1000);

  try {
    await prisma.$transaction([
      // The unique jti makes a second submit of the same link fail here, atomically.
      prisma.usedMagicToken.create({ data: { jti: payload.jti, userId: user.id, expiresAt: linkExpiresAt } }),
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null } }),
      // Sessions opened with the temporary password end now.
      prisma.refreshToken.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } }),
      prisma.refreshToken.create({ data: refreshTokenRow(user.id, refreshTokenValue, req, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) }),
      prisma.validationLog.create({ data: { entityType: 'User', entityId: user.id, action: 'ACCOUNT_SETUP_COMPLETED', userId: user.id, ipAddress: req.ip, status: 'SUCCESS', detailsJson: { jti: payload.jti } } }),
    ]);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      sendUnauthorized(res, 'This setup link has already been used. Sign in with the password you chose.');
      return;
    }
    throw err;
  }
  res.locals.auditLogged = true;
  invalidateAuthUserCache(user.id);
  // Set up from the emailed link: the new password starts with only this device trusted.
  await revokeAllDevices(user.id);
  const deviceToken = await trustDevice(user.id, req);

  await capSessions(user.id);
  sendSuccess(res, {
    accessToken,
    refreshToken: refreshTokenValue,
    deviceToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role.name,
      accountStatus: user.accountStatus,
      mustChangePassword: false,
      personnel: user.personnel,
    },
  }, 'Your password is set and you are signed in.');
};
