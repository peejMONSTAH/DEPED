import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload, passwordTokenVersion } from '../utils/jwt.util';
import { sendUnauthorized, sendError } from '../utils/response.util';
import prisma from '../config/prisma';

// Extend Express Request to include the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & { personnelId?: number | null; mustChangePassword?: boolean };
    }
  }
}

interface CachedUserRecord {
  id: number;
  email: string;
  accountStatus: any;
  personnelId: number | null;
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
};

/**
 * Middleware: Verifies JWT access token and attaches user to req.user
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  let token: string | undefined;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (
    typeof req.query.token === 'string' &&
    req.query.token.trim().length > 0 &&
    (req.path.includes('/stream') || (req.headers.accept && req.headers.accept.includes('text/event-stream')))
  ) {
    // SEC-H4: Permitted exclusively for SSE streaming endpoints where browser EventSource API cannot send Authorization headers
    token = req.query.token.trim();
  }

  if (!token) {
    sendUnauthorized(res, 'No access token provided.');
    return;
  }

  try {
    const payload = verifyAccessToken(token);

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
          personnelId: true,
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
      personnelId: user.personnelId,
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
