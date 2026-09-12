import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../utils/jwt.util';
import { sendUnauthorized, sendError } from '../utils/response.util';
import prisma from '../config/prisma';

// Extend Express Request to include the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & { personnelId?: number | null };
    }
  }
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

    // Verify user still exists and account is active
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        accountStatus: true,
        personnelId: true,
        role: { select: { name: true } },
      },
    });

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

    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role.name,
      personnelId: user.personnelId,
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
