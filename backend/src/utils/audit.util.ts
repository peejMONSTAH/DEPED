import prisma from '../config/prisma';
import { logger } from './logger';

export interface AuditLogOptions {
  userId: number;
  action: string;
  entityType: string;
  entityId?: number;
  details?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
  status?: 'SUCCESS' | 'FAILED';
}

/**
 * Strips secrets, passwords, and tokens before persisting in audit logs
 */
export const sanitizeAuditDetails = (details: any): any => {
  if (details === undefined || details === null) return null;
  if (typeof details !== 'object') return details;
  if (Array.isArray(details)) return details.map(sanitizeAuditDetails);

  const sanitized: Record<string, any> = {};
  const sensitiveKeys = [
    'password',
    'passwordhash',
    'token',
    'accesstoken',
    'refreshtoken',
    'secret',
    'authheader',
    'cookie',
    'authorization',
  ];

  for (const [key, value] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeAuditDetails(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

/**
 * Derives a clean, consistent category from action name and entity type
 */
export const deriveAuditCategory = (action: string, entityType?: string): string => {
  const act = (action || '').toUpperCase();
  const ent = (entityType || '').toUpperCase();

  if (act.includes('LOGIN') || act.includes('LOGOUT') || act.includes('PASSWORD')) {
    return 'Login Activities';
  }
  if (
    act.includes('USER_CREATED') ||
    act.includes('ACCOUNT_CREATED') ||
    act.includes('CREDENTIALS_DISTRIBUTED') ||
    act.includes('USER_REQUEST_APPROVED')
  ) {
    return 'Account Creation';
  }
  if (
    act.includes('USER_UPDATED') ||
    act.includes('USER_DEACTIVATED') ||
    act.includes('USER_REACTIVATED') ||
    act.includes('USER_DELETED') ||
    act.includes('ROLE_MODIFIED')
  ) {
    return 'Account Modifications';
  }
  if (
    act.includes('DOCUMENT_UPLOAD') ||
    act.includes('DOCUMENT_DELETE') ||
    act.includes('DOCUMENT_ACCESS') ||
    act.includes('DOCUMENT_DOWNLOAD') ||
    act.includes('PDS_EXTRACTION')
  ) {
    return 'Document Uploads';
  }
  if (act.includes('VALIDAT') || act.includes('INITIAL_RATING')) {
    return 'Validation Actions';
  }
  if (act.includes('APPROV') || act.includes('FINAL_RATING') || act.includes('CANDIDATE_SELECTED')) {
    return 'Approval Actions';
  }
  if (act.includes('REJECT') || act.includes('RETURN') || act.includes('DEFICIENCY')) {
    return 'Returned Submissions';
  }
  if (act.includes('PLANTILLA') || ent.includes('PLANTILLA')) {
    return 'Plantilla & Positions';
  }
  if (
    act.includes('PROMOTION') ||
    act.includes('RANKING') ||
    act.includes('CAR_') ||
    ent.includes('PROMOTION')
  ) {
    return 'Promotion & Ranking';
  }
  if (
    act.includes('201_FILE') ||
    act.includes('PROFILE') ||
    act.includes('SERVICE_RECORD') ||
    ent.includes('PERSONNEL')
  ) {
    return 'Personnel Records';
  }
  return 'System Operations';
};

/**
 * Asynchronously logs an audit event without blocking the parent request
 */
export const recordAuditLog = async (options: AuditLogOptions): Promise<void> => {
  try {
    if (!options.userId || options.userId <= 0) return;

    await prisma.validationLog.create({
      data: {
        userId: options.userId,
        action: options.action,
        entityType: options.entityType || 'General',
        entityId: options.entityId ?? 0,
        detailsJson: sanitizeAuditDetails(options.details),
        ipAddress: options.ipAddress || null,
        userAgent: options.userAgent || null,
        status: options.status || 'SUCCESS',
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[AuditTrail] Failed to write validation log');
  }
};
