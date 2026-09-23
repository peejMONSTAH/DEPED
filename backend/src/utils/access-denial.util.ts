import { Request, Response } from 'express';
import { recordAuditLog } from './audit.util';
import { sendNotFound } from './response.util';

export const OUT_OF_STATION_SCOPE = 'OUT_OF_STATION_SCOPE';

export interface ScopeDenial {
  /** The record type that was asked for, e.g. 'Transaction', 'PersonnelDocument'. */
  entityType: string;
  entityId: number;
  /** What the caller tried to do, e.g. 'DOCUMENT_DOWNLOAD', 'REQUIREMENTS_VERIFY'. */
  action: string;
}

/**
 * Refuses a request for a record outside the caller's organizational scope.
 *
 * The response is the endpoint's ordinary not-found reply, so changing an id in
 * a URL cannot tell an officer whether a record exists in another station. The
 * attempt is recorded as a FAILED `ACCESS_DENIED` entry, never as the action
 * that was attempted, with identifiers only: no names, filenames, tokens or
 * document contents. The audit middleware is told the request is already
 * logged so it does not add a second, misleadingly named entry.
 */
export const denyOutOfScope = async (
  req: Request,
  res: Response,
  denial: ScopeDenial,
  notFoundMessage: string,
): Promise<void> => {
  if (req.user?.userId) {
    await recordAuditLog({
      userId: req.user.userId,
      action: 'ACCESS_DENIED',
      entityType: denial.entityType,
      entityId: denial.entityId,
      details: { attemptedAction: denial.action, reason: OUT_OF_STATION_SCOPE, role: req.user.role },
      ipAddress: req.ip || null,
      userAgent: (req.headers?.['user-agent'] as string | undefined) || null,
      status: 'FAILED',
    });
    res.locals.auditLogged = true;
  }
  sendNotFound(res, notFoundMessage);
};
