import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload, passwordTokenVersion, verifyDocumentAccessToken, DocumentViewTokenPayload } from '../utils/jwt.util';
import { sendUnauthorized, sendError } from '../utils/response.util';
import prisma from '../config/prisma';
import { isRefusedOnPhone, PHONE_APP_REFUSAL } from '../services/session.service';
import { recordAuditLog } from '../utils/audit.util';
import { AuditCategory, AuditOutcome, AuditSeverity } from '../types/audit.types';

// Extend Express Request to include the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & { personnelId?: number | null; mustChangePassword?: boolean };
      docToken?: DocumentViewTokenPayload;
    }
  }
}

interface CachedUserRecord {
  id: number;
  email: string;
  accountStatus: any;
  personnel: { id: number } | null;
  passwordHash: string;
  mustChangePassword: boolean;
  role: { name: any };
  cachedAt: number;
}

const authUserCache = new Map<number, CachedUserRecord>();
const AUTH_CACHE_TTL_MS = 30_000; // 30s cache eliminates redundant round-trips for parallel requests

/** Routes that remain reachable while a forced password change is outstanding. */
const isPasswordChangeRoute = (req: Request): boolean => {
  const path = req.baseUrl + req.path;
  return path.includes('/auth/change-password') || path.includes('/auth/logout') || path.includes('/auth/me');
};

export const invalidateAuthUserCache = (userId?: number): void => {
  if (userId) {
    authUserCache.delete(userId);
  } else {
    authUserCache.clear();
  }
  // Session answers are cheap to rebuild; drop them all so a sign-out lands now.
  sessionCache.clear();
};

/** Whether the session behind an access token is still live, cached briefly. */
const sessionCache = new Map<string, { live: boolean; at: number }>();
const SESSION_CACHE_TTL_MS = 10_000;
async function sessionIsLive(userId: number, sid: string | undefined): Promise<boolean> {
  const key = sid || `user:${userId}`;
  const hit = sessionCache.get(key);
  if (hit && Date.now() - hit.at < SESSION_CACHE_TTL_MS) return hit.live;
  const now = new Date();
  // Tokens issued before sessions were stamped (no sid) need any live session.
  const live = sid
    ? Boolean(await prisma.refreshToken.findFirst({ where: { token: sid, userId, revoked: false, expiresAt: { gt: now } }, select: { id: true } }))
    : (await prisma.refreshToken.count({ where: { userId, revoked: false, expiresAt: { gt: now } } })) > 0;
  if (sessionCache.size > 5000) sessionCache.clear();
  sessionCache.set(key, { live, at: Date.now() });
  return live;
}

/**
 * Middleware: Verifies JWT access token and attaches user to req.user
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  let token: string | undefined;
  let docTokenPayload: DocumentViewTokenPayload | null = null;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (
    // A token in the URL exists only for EventSource and file links, both GETs;
    // it must never authenticate a request that changes anything.
    req.method === 'GET' &&
    typeof req.query.token === 'string' &&
    req.query.token.trim().length > 0
  ) {
    const rawToken = req.query.token.trim();
    if (req.path.includes('/stream') || (req.headers.accept && req.headers.accept.includes('text/event-stream'))) {
      // Permitted for SSE streaming endpoints where browser EventSource API cannot send Authorization headers
      token = rawToken;
    } else if (req.path.endsWith('/file') || req.path.includes('/file/') || req.path.endsWith('/download')) {
      // Document view endpoints: supports DocumentViewToken or standard AccessToken in query param
      try {
        docTokenPayload = verifyDocumentAccessToken(rawToken);
        req.docToken = docTokenPayload;
      } catch {
        token = rawToken;
      }
    }
  }

  if (!token && !docTokenPayload) {
    sendUnauthorized(res, 'No access token provided.');
    return;
  }

  try {
    const payload = docTokenPayload
      ? { userId: docTokenPayload.userId, email: docTokenPayload.email, role: docTokenPayload.role, pwdv: docTokenPayload.pwdv }
      : verifyAccessToken(token!);

    // Check fast cache first to avoid high-latency network round-trips on concurrent calls
    const cached = authUserCache.get(payload.userId);
    let user: any;

    if (cached && Date.now() - cached.cachedAt < AUTH_CACHE_TTL_MS) {
      user = cached;
    } else {
      user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          email: true,
          accountStatus: true,
          // personnel.user_id is the only link between the two tables, so the
          // id comes from the relation rather than a mirror column here.
          personnel: { select: { id: true } },
          passwordHash: true,
          mustChangePassword: true,
          role: { select: { name: true } },
        },
      });

      if (user) {
        authUserCache.set(payload.userId, { ...user, cachedAt: Date.now() });
      }
    }

    if (!user) {
      sendUnauthorized(res, 'User account not found.');
      return;
    }

    if (user.accountStatus === 'PENDING') {
      sendError(
        res,
        'Your account credentials have not yet been distributed by the System Administrator. Access is disabled until credentials are officially distributed.',
        403,
        'ACCOUNT_NOT_DISTRIBUTED'
      );
      return;
    }

    if (user.accountStatus !== 'ACTIVE') {
      sendUnauthorized(res, `Account is ${user.accountStatus.toLowerCase()}. Contact your system administrator.`);
      return;
    }
    if (payload.pwdv !== passwordTokenVersion(user.passwordHash)) {
      sendUnauthorized(res, 'This session is no longer valid. Please sign in again.');
      return;
    }
    // A signed-out session ends its access tokens now, not when they expire.
    if (!docTokenPayload && !(await sessionIsLive(user.id, (payload as any).sid))) {
      sendError(res, 'You were signed out. Please sign in again.', 401, 'SESSION_REVOKED');
      return;
    }
    // A document link is bound to the role it was issued under. Scope is still
    // re-checked by the file endpoint; this makes a role change void the link outright.
    if (docTokenPayload && docTokenPayload.role !== user.role.name) {
      sendUnauthorized(res, 'This document link is no longer valid. Open the document again.');
      return;
    }

    // The phone app is personnel-only, including sessions opened before this rule.
    if (isRefusedOnPhone(req, user.role.name)) {
      sendError(res, PHONE_APP_REFUSAL, 403, 'PHONE_APP_PERSONNEL_ONLY');
      return;
    }

    // An administrator-issued password is known to somebody other than the
    // account holder, so it must not be usable for real work. Everything except
    // changing it (and signing out) is refused until the holder sets their own.
    // Enforced here rather than in the client, which could simply be skipped.
    if (user.mustChangePassword && !isPasswordChangeRoute(req)) {
      sendError(
        res,
        'You must set your own password before using Digital 201. Please change your password to continue.',
        403,
        'PASSWORD_CHANGE_REQUIRED',
      );
      return;
    }

    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role.name,
      personnelId: user.personnel?.id ?? null,
      pwdv: payload.pwdv,
      mustChangePassword: user.mustChangePassword,
    };

    next();
  } catch (error) {
    sendUnauthorized(res, 'Invalid or expired access token.');
  }
};

/**
 * Middleware: Allows access only to specified roles (RBAC)
 */
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendUnauthorized(res);
      return;
    }

    if (!roles.includes(req.user.role)) {
      if (req.user.userId) {
        const requestId = (req as any).id || (req.headers?.['x-request-id'] as string) || null;
        void recordAuditLog({
          userId: req.user.userId,
          action: 'ACCESS_DENIED',
          entityType: 'Endpoint',
          entityId: 0,
          details: {
            path: req.originalUrl || req.path || '',
            method: req.method || 'GET',
            requiredRoles: roles,
            userRole: req.user.role,
          },
          ipAddress: req.ip || null,
          userAgent: (req.headers?.['user-agent'] as string) || null,
          status: 'FAILED',
          outcome: AuditOutcome.DENIED,
          severity: AuditSeverity.HIGH,
          actionLabel: 'Unauthorized access attempt denied',
          failureReason: `Access denied. Required role(s): ${roles.join(', ')}`,
          requestId,
        });
        if (res.locals) {
          res.locals.auditLogged = true;
        }
      }

      res.status(403).json({
        status: 'error',
        message: `Access denied. Required role(s): ${roles.join(', ')}.`,
        code: 'FORBIDDEN',
      });
      return;
    }

    next();
  };
};
