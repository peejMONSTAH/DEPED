import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

/** A 4xx thrown by our own code carries a message written for the user; 5xx never does. */
const isClientError = (statusCode: number): boolean => statusCode >= 400 && statusCode < 500;

/**
 * Global error handler — must be registered last in Express middleware chain.
 *
 * Unexpected failures are logged in full and answered with a generic message plus the
 * request id, so an operator can find the entry without the client ever seeing a stack,
 * a Prisma message or a connection string.
 */
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const requestId = (req as Request & { id?: string }).id;
  const log = (req as Request & { log?: typeof logger }).log || logger;

  const context = {
    requestId,
    method: req.method,
    path: req.path,
    statusCode,
    userId: req.user?.userId,
    role: req.user?.role,
    code: err.code,
  };

  if (isClientError(statusCode)) {
    // Expected rejections (validation, permissions, conflicts) are not incidents.
    log.warn({ ...context, err: { message: err.message } }, 'Request rejected');
    res.status(statusCode).json({
      status: 'error',
      message: err.message || 'Request could not be completed.',
      code: err.code || 'REQUEST_REJECTED',
      ...(requestId && { requestId }),
    });
    return;
  }

  log.error({ ...context, err }, 'Unhandled request failure');
  res.status(statusCode).json({
    status: 'error',
    message: 'Something went wrong on our side. Quote the request ID when reporting this.',
    // Deliberately fixed: err.code here is internal (e.g. Prisma's P2002) and would
    // disclose the storage engine and failure mode to the client.
    code: 'INTERNAL_ERROR',
    ...(requestId && { requestId }),
  });
};

/**
 * Middleware: 404 Not Found for unmatched routes
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.method} ${req.path} not found.`,
    code: 'ROUTE_NOT_FOUND',
  });
};
