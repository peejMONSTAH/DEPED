import { createHash } from 'crypto';
import prisma from '../config/prisma';
import { logger } from './logger';
import {
  AuditCategory,
  AuditCategoryType,
  AuditSeverity,
  AuditSeverityType,
  AuditOutcome,
  AuditOutcomeType,
  ClientSource,
  ClientSourceType,
  CanonicalAuditEvent,
} from '../types/audit.types';

export interface AuditLogOptions {
  userId: number;
  action: string;
  entityType?: string;
  entityId?: number;
  details?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
  status?: string; // Legacy status SUCCESS / FAILED
  category?: AuditCategoryType;
  severity?: AuditSeverityType;
  outcome?: AuditOutcomeType;
  actionLabel?: string;
  targetReference?: string;
  clientSource?: ClientSourceType;
  requestId?: string | null;
  failureReason?: string | null;
  beforeValue?: Record<string, any> | null;
  afterValue?: Record<string, any> | null;
}

const SENSITIVE_KEY_DENYLIST = [
  'password',
  'passwordhash',
  'initialpassword',
  'temppassword',
  'temporarypassword',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'devicetoken',
  'magictoken',
  'setuptoken',
  'sessiontoken',
  'codehash',
  'tokenhash',
  'secret',
  'jwtsecret',
  'authheader',
  'authorization',
  'cookie',
  'otp',
  'pin',
  'verificationcode',
  'recoverycode',
  'logincode',
  'apikey',
  'api_key',
  'privatekey',
  'passphrase',
  'credentials',
  'credential',
  'database_url',
  'direct_url',
  'creditcard',
  'cvv',
  'ssn',
  'tin',
  'filebuffer',
  'filecontent',
  'base64',
];

const MAX_STRING_LENGTH = 4096;

const stableJson = (value: any): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? '"[UNDEFINED]"';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
};

/**
 * Strips secrets, passwords, tokens, credentials, and buffers recursively before persisting in audit logs.
 * Includes circular reference protection and payload size truncation.
 */
export const sanitizeAuditDetails = (details: any, seen = new WeakSet()): any => {
  if (details === undefined || details === null) return null;

  // Handle Buffer or ArrayBuffer
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(details)) {
    return `[BUFFER: ${details.length} bytes omitted]`;
  }

  // Primitive types
  if (typeof details !== 'object') {
    if (typeof details === 'string' && details.length > MAX_STRING_LENGTH) {
      return `${details.slice(0, MAX_STRING_LENGTH)}... [TRUNCATED: ${details.length} chars]`;
    }
    return details;
  }

  // Circular reference detection
  if (seen.has(details)) {
    return '[CIRCULAR REFERENCE]';
  }
  seen.add(details);

  if (Array.isArray(details)) {
    return details.map(item => sanitizeAuditDetails(item, seen));
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(details)) {
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
      sanitized[key] = `[BUFFER: ${value.length} bytes omitted]`;
      continue;
    }

    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isSensitive = SENSITIVE_KEY_DENYLIST.some(sk => lowerKey.includes(sk.replace(/[^a-z0-9]/g, '')));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeAuditDetails(value, seen);
    } else if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
      sanitized[key] = `${value.slice(0, MAX_STRING_LENGTH)}... [TRUNCATED: ${value.length} chars]`;
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

/**
 * Maps raw system roles to official, human-readable DepEd titles
 */
export const humanizeRole = (role?: string | null): string => {
  if (!role) return 'System / Automated';
  const clean = role.trim().toUpperCase();
  switch (clean) {
    case 'SYSTEM_ADMIN':
      return 'System Administrator';
    case 'HRMO':
      return 'Human Resource Management Officer';
    case 'AO_II':
      return 'Administrative Officer II';
    case 'TEACHING_PERSONNEL':
      return 'Teaching Personnel';
    case 'NON_TEACHING_PERSONNEL':
      return 'Non-Teaching Personnel';
    default:
      return clean.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase());
  }
};

/**
 * Formats a Date object or ISO string in Philippine Standard Time (Asia/Manila, UTC+8)
 */
export const formatManilaTimestamp = (date: Date | string): string => {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'UNKNOWN';
    return d.toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }) + ' PHT';
  } catch {
    return 'UNKNOWN';
  }
};

/**
 * Computes a SHA-256 tamper-evident record hash
 */
export const computeRecordHash = (
  timestamp: string,
  action: string,
  category: string,
  outcome: string,
  userId: number,
  actorEmail: string,
  targetType: string,
  targetId: number,
  sanitizedDetails: any,
  previousHash: string = 'GENESIS'
): string => {
  const content = [
    timestamp,
    action,
    category,
    outcome,
    String(userId),
    actorEmail,
    targetType,
    String(targetId),
    stableJson(sanitizedDetails || null),
    previousHash,
  ].join('|');

  return createHash('sha256').update(content).digest('hex');
};

/**
 * Derives canonical category, severity, outcome, and human label from action and metadata
 */
export const deriveActionMetadata = (
  action: string,
  entityType?: string,
  status?: string,
  details?: any
): {
  category: AuditCategoryType;
  severity: AuditSeverityType;
  outcome: AuditOutcomeType;
  actionLabel: string;
} => {
  const act = (action || '').toUpperCase();
  const ent = (entityType || '').toUpperCase();
  const isFailed = status === 'FAILED' || act.includes('FAILED') || act.includes('FAIL') || act.includes('DENIED');

  // Outcome
  let outcome: AuditOutcomeType = isFailed ? AuditOutcome.FAILURE : AuditOutcome.SUCCESS;
  if (act.includes('DENIED') || act.includes('FORBIDDEN') || act.includes('REFUSED')) {
    outcome = AuditOutcome.DENIED;
  } else if (act.includes('PARTIAL')) {
    outcome = AuditOutcome.PARTIAL;
  }

  // 1. Authentication
  if (act.includes('LOGIN') || act.includes('LOGOUT') || act.includes('DEVICE') || act.includes('MAGIC_LOGIN') || act.includes('PASSWORD')) {
    if (act.includes('LOGIN_FAILED')) {
      return { category: AuditCategory.AUTHENTICATION, severity: AuditSeverity.WARNING, outcome: AuditOutcome.FAILURE, actionLabel: 'Sign-in failed' };
    }
    if (act.includes('LOGIN_SUCCESS')) {
      return { category: AuditCategory.AUTHENTICATION, severity: AuditSeverity.INFO, outcome: AuditOutcome.SUCCESS, actionLabel: 'Signed in successfully' };
    }
    if (act === 'LOGOUT') {
      return { category: AuditCategory.AUTHENTICATION, severity: AuditSeverity.INFO, outcome: AuditOutcome.SUCCESS, actionLabel: 'Signed out' };
    }
    if (act.includes('ACCOUNT_LOCKED')) {
      return { category: AuditCategory.AUTHENTICATION, severity: AuditSeverity.WARNING, outcome: AuditOutcome.FAILURE, actionLabel: 'Account locked due to failed attempts' };
    }
    if (act.includes('DEVICE_CHALLENGE_ISSUED')) {
      return { category: AuditCategory.AUTHENTICATION, severity: AuditSeverity.INFO, outcome: AuditOutcome.SUCCESS, actionLabel: 'Device verification challenge issued' };
    }
    if (act.includes('DEVICE_VERIFIED')) {
      return { category: AuditCategory.AUTHENTICATION, severity: AuditSeverity.NOTICE, outcome: AuditOutcome.SUCCESS, actionLabel: 'New device verified' };
    }
    if (act.includes('DEVICE_CHALLENGE_FAILED')) {
      return { category: AuditCategory.AUTHENTICATION, severity: AuditSeverity.WARNING, outcome: AuditOutcome.FAILURE, actionLabel: 'Device verification code rejected' };
    }
    if (act.includes('PASSWORD_CHANGED')) {
      return { category: AuditCategory.AUTHENTICATION, severity: AuditSeverity.NOTICE, outcome: AuditOutcome.SUCCESS, actionLabel: 'Account password changed' };
    }
    if (act.includes('PASSWORD_RESET')) {
      return { category: AuditCategory.ACCOUNT_LIFECYCLE, severity: AuditSeverity.NOTICE, outcome: AuditOutcome.SUCCESS, actionLabel: 'Password reset by administrator' };
    }
    if (act.includes('MAGIC_LOGIN')) {
      return { category: AuditCategory.AUTHENTICATION, severity: AuditSeverity.NOTICE, outcome: AuditOutcome.SUCCESS, actionLabel: 'Authenticated via 1-click access link' };
    }
    return { category: AuditCategory.AUTHENTICATION, severity: isFailed ? AuditSeverity.WARNING : AuditSeverity.INFO, outcome, actionLabel: 'Authentication event' };
  }

  // 2. Roles & Permissions / Access Denials
  if (act.includes('ACCESS_DENIED') || act.includes('FORBIDDEN') || act.includes('OUT_OF_STATION_SCOPE')) {
    return { category: AuditCategory.ROLES_PERMISSIONS, severity: AuditSeverity.HIGH, outcome: AuditOutcome.DENIED, actionLabel: 'Unauthorized access attempt denied' };
  }
  if (act.includes('ROLE_MODIFIED') || act.includes('PRIVILEGE_ELEVAT') || act.includes('ROLE_CHANGED')) {
    return { category: AuditCategory.ROLES_PERMISSIONS, severity: AuditSeverity.CRITICAL, outcome: AuditOutcome.SUCCESS, actionLabel: 'System role changed' };
  }

  // 3. Sensitive Record Access
  if (act.includes('SERVICE_RECORD_ACCESSED_BY_OFFICER')) {
    return { category: AuditCategory.SENSITIVE_RECORD_ACCESS, severity: AuditSeverity.NOTICE, outcome: AuditOutcome.SUCCESS, actionLabel: 'Officer inspected personnel service record' };
  }
  if (act.includes('SERVICE_RECORD_VIEWED') || act.includes('VIEW_OWN_SERVICE_RECORD')) {
    return { category: AuditCategory.SENSITIVE_RECORD_ACCESS, severity: AuditSeverity.INFO, outcome: AuditOutcome.SUCCESS, actionLabel: 'Personnel viewed own service record' };
  }
  if (act.includes('DOCUMENT_ACCESSED') || act.includes('PERSONNEL_DOCUMENT_ACCESSED')) {
    return { category: AuditCategory.SENSITIVE_RECORD_ACCESS, severity: AuditSeverity.INFO, outcome: AuditOutcome.SUCCESS, actionLabel: 'Sensitive personnel file accessed' };
  }

  // 4. Account Lifecycle
  if (act.includes('USER_CREATED') || act.includes('ACCOUNT_CREATED') || act.includes('ACCOUNT_SETUP_COMPLETED') || act.includes('USER_REGISTERED')) {
    const isSysAdmin = details?.role === 'SYSTEM_ADMIN' || details?.assignedRole === 'SYSTEM_ADMIN';
    return { category: AuditCategory.ACCOUNT_LIFECYCLE, severity: isSysAdmin ? AuditSeverity.CRITICAL : AuditSeverity.NOTICE, outcome: AuditOutcome.SUCCESS, actionLabel: 'User account provisioned' };
  }
  if (act.includes('CREDENTIALS_DISTRIBUTED')) {
    return { category: AuditCategory.ACCOUNT_LIFECYCLE, severity: AuditSeverity.NOTICE, outcome: AuditOutcome.SUCCESS, actionLabel: 'Initial credentials issued and distributed' };
  }
  if (act.includes('USER_DEACTIVATED') || act.includes('DEACTIVATED_PRESERVED_TRAIL')) {
    return { category: AuditCategory.ACCOUNT_LIFECYCLE, severity: AuditSeverity.WARNING, outcome: AuditOutcome.SUCCESS, actionLabel: 'User account deactivated' };
  }
  if (act.includes('USER_DELETED')) {
    return { category: AuditCategory.ACCOUNT_LIFECYCLE, severity: AuditSeverity.WARNING, outcome: AuditOutcome.SUCCESS, actionLabel: 'Unused user account deleted' };
  }
  if (act.includes('USER_UPDATED')) {
    return { category: AuditCategory.ACCOUNT_LIFECYCLE, severity: AuditSeverity.INFO, outcome: AuditOutcome.SUCCESS, actionLabel: 'Account information updated' };
  }

  // 5. Reports & Exports
  if (act.includes('AUDIT_EXPORT') || act.includes('EXPORT_AUDIT') || act.includes('BULK_EXPORT')) {
    return { category: AuditCategory.REPORTS_EXPORTS, severity: AuditSeverity.HIGH, outcome: AuditOutcome.SUCCESS, actionLabel: 'Audit evidence register exported' };
  }
  if (act.includes('REPORT_') || act.includes('EXPORT_')) {
    return { category: AuditCategory.REPORTS_EXPORTS, severity: AuditSeverity.NOTICE, outcome: AuditOutcome.SUCCESS, actionLabel: 'Operational report exported' };
  }

  // 6. Documents
  if (act.includes('DOCUMENT_UPLOAD') || act.includes('PERSONNEL_DOCUMENT_SUBMITTED')) {
    return { category: AuditCategory.DOCUMENTS, severity: AuditSeverity.INFO, outcome: AuditOutcome.SUCCESS, actionLabel: 'Document uploaded' };
  }
  if (act.includes('DOCUMENT_REMOVED') || act.includes('DOCUMENT_DELETE')) {
    return { category: AuditCategory.DOCUMENTS, severity: AuditSeverity.NOTICE, outcome: AuditOutcome.SUCCESS, actionLabel: 'Document removed or archived' };
  }
  if (act.includes('OCR_') || act.includes('PDS_EXTRACTION')) {
    return { category: AuditCategory.DOCUMENTS, severity: AuditSeverity.INFO, outcome: AuditOutcome.SUCCESS, actionLabel: 'Automated OCR extraction processed' };
  }

  // 7. Transactions
  if (act.includes('TRANSACTION_APPROVED')) {
    return { category: AuditCategory.TRANSACTIONS, severity: AuditSeverity.NOTICE, outcome: AuditOutcome.SUCCESS, actionLabel: 'Transaction approved by HRMO' };
  }
  if (act.includes('TRANSACTION_VALIDATED')) {
    return { category: AuditCategory.TRANSACTIONS, severity: AuditSeverity.INFO, outcome: AuditOutcome.SUCCESS, actionLabel: 'Transaction validated by AO II' };
  }
  if (act.includes('TRANSACTION_REJECTED')) {
    return { category: AuditCategory.TRANSACTIONS, severity: AuditSeverity.WARNING, outcome: AuditOutcome.FAILURE, actionLabel: 'Transaction rejected' };
  }
  if (act.includes('HRMO_RETURNED_FOR_CORRECTION') || act.includes('TRANSACTION_RETURNED')) {
    return { category: AuditCategory.TRANSACTIONS, severity: AuditSeverity.NOTICE, outcome: AuditOutcome.FAILURE, actionLabel: 'Transaction returned for deficiency' };
  }
  if (act.includes('TRANSACTION_REOPENED')) {
    return { category: AuditCategory.TRANSACTIONS, severity: AuditSeverity.NOTICE, outcome: AuditOutcome.SUCCESS, actionLabel: 'Disqualified transaction reopened' };
  }
  if (act.includes('TRANSACTION_SUBMITTED') || act.includes('TRANSACTION_RESUBMITTED') || act.includes('TRANSACTION_INITIATED')) {
    return { category: AuditCategory.TRANSACTIONS, severity: AuditSeverity.INFO, outcome: AuditOutcome.SUCCESS, actionLabel: 'Transaction submitted' };
  }

  // 8. Promotions and Ranking
  if (act.includes('PROMOTION_CANDIDATE_SELECTED')) {
    return { category: AuditCategory.PROMOTIONS_RANKING, severity: AuditSeverity.HIGH, outcome: AuditOutcome.SUCCESS, actionLabel: 'Candidate selected for appointment/promotion' };
  }
  if (act.includes('PROMOTION_RANKING_GENERATED') || act.includes('CAR_DOCUMENT_GENERATED')) {
    return { category: AuditCategory.PROMOTIONS_RANKING, severity: AuditSeverity.NOTICE, outcome: AuditOutcome.SUCCESS, actionLabel: 'Comparative Assessment Result (CAR) generated' };
  }
  if (act.includes('FINAL_RATING')) {
    return { category: AuditCategory.PROMOTIONS_RANKING, severity: AuditSeverity.NOTICE, outcome: AuditOutcome.SUCCESS, actionLabel: 'HRMO deliberation rating submitted' };
  }
  if (act.includes('INITIAL_RATING')) {
    return { category: AuditCategory.PROMOTIONS_RANKING, severity: AuditSeverity.INFO, outcome: AuditOutcome.SUCCESS, actionLabel: 'AO II initial qualification rating submitted' };
  }
  if (act.includes('PROMOTION_CYCLE_CREATED') || act.includes('CYCLE_STATUS_CHANGED')) {
    return { category: AuditCategory.PROMOTIONS_RANKING, severity: AuditSeverity.NOTICE, outcome: AuditOutcome.SUCCESS, actionLabel: 'Promotion cycle state modified' };
  }
  if (act.includes('PROMOTION') || ent.includes('PROMOTION')) {
    return { category: AuditCategory.PROMOTIONS_RANKING, severity: AuditSeverity.INFO, outcome: AuditOutcome.SUCCESS, actionLabel: 'Promotion workflow activity' };
  }

  // 9. Personnel Records & Plantilla
  if (act.includes('201_') || act.includes('PERSONNEL') || ent.includes('PERSONNEL')) {
    return { category: AuditCategory.PERSONNEL_RECORDS, severity: AuditSeverity.INFO, outcome: AuditOutcome.SUCCESS, actionLabel: 'Personnel 201 record updated' };
  }
  if (act.includes('PLANTILLA') || ent.includes('PLANTILLA')) {
    return { category: AuditCategory.PERSONNEL_RECORDS, severity: AuditSeverity.INFO, outcome: AuditOutcome.SUCCESS, actionLabel: 'Plantilla registry modified' };
  }

  // 10. Email & Notification
  if (act.includes('EMAIL_') || act.includes('DELIVERY_')) {
    return { category: AuditCategory.EMAIL_NOTIFICATION, severity: isFailed ? AuditSeverity.WARNING : AuditSeverity.INFO, outcome, actionLabel: 'Notification delivery' };
  }

  // Fallback
  return {
    category: AuditCategory.SYSTEM_CONFIGURATION,
    severity: isFailed ? AuditSeverity.WARNING : AuditSeverity.INFO,
    outcome,
    actionLabel: act.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase()),
  };
};

/**
 * Derives a clean legacy category string for backward compatibility
 */
export const deriveAuditCategory = (action: string, entityType?: string): string => {
  const meta = deriveActionMetadata(action, entityType);
  return meta.category;
};

/**
 * Projects a raw database ValidationLog row into a CanonicalAuditEvent
 */
export const mapToCanonicalAuditEvent = (log: any): CanonicalAuditEvent => {
  const rawDetails = log.detailsJson;
  const isObjectDetails = typeof rawDetails === 'object' && rawDetails !== null;
  const canonicalData = isObjectDetails && rawDetails._canonical ? rawDetails._canonical : {};

  const detailsObj = isObjectDetails ? sanitizeAuditDetails({ ...rawDetails }) : null;
  if (detailsObj && detailsObj._canonical) {
    delete detailsObj._canonical;
  }

  const derived = deriveActionMetadata(
    log.action,
    log.entityType,
    log.status,
    detailsObj
  );

  const actorRole = log.actorRole || canonicalData.actorRole || log.user?.role?.name || 'UNKNOWN';
  const actorEmail = log.actorEmail || canonicalData.actorEmail || log.user?.email || (log.userId > 0 ? `Unknown account (user #${log.userId})` : 'System / Automated');
  const actorStation = log.actorStation || canonicalData.actorStation || log.user?.personnel?.school || null;
  const targetType = log.targetType || canonicalData.targetType || log.entityType || 'General';
  const targetId = log.targetId ?? canonicalData.targetId ?? log.entityId ?? 0;
  const targetReference = log.targetReference || canonicalData.targetReference || (targetId > 0 ? `${targetType} #${targetId}` : targetType);

  const hasCanonicalColumns = log.hashVersion === 2;
  const category = (canonicalData.category as AuditCategoryType) || (hasCanonicalColumns ? log.category as AuditCategoryType : null) || derived.category;
  const severity = (canonicalData.severity as AuditSeverityType) || (hasCanonicalColumns ? log.severity as AuditSeverityType : null) || derived.severity;
  const outcome = (canonicalData.outcome as AuditOutcomeType) || (hasCanonicalColumns ? log.outcome as AuditOutcomeType : null) || derived.outcome;
  const actionLabel = log.actionLabel || canonicalData.actionLabel || derived.actionLabel;
  const clientSource = (log.clientSource as ClientSourceType) || (canonicalData.clientSource as ClientSourceType) || (log.userAgent?.includes('Dart') || log.userAgent?.includes('Mobile') ? ClientSource.MOBILE : ClientSource.WEB);
  const requestId = log.requestId || canonicalData.requestId || null;
  const failureReason = log.failureReason || canonicalData.failureReason || (outcome !== AuditOutcome.SUCCESS ? (detailsObj?.reason || detailsObj?.error || null) : null);

  const timestampIso = log.timestamp instanceof Date ? log.timestamp.toISOString() : String(log.timestamp || new Date().toISOString());

  // Generate safe summary
  const summary = canonicalData.summary || generateAuditSummary({
    actorEmail,
    actorRoleLabel: humanizeRole(actorRole),
    actionLabel,
    targetReference,
    outcome,
    failureReason,
  });

  const recordHash = log.recordHash || canonicalData.recordHash || null;

  return {
    id: log.id,
    timestamp: timestampIso,
    displayTimestamp: formatManilaTimestamp(log.timestamp),
    userId: log.userId,
    actorEmail,
    actorRole,
    actorRoleLabel: humanizeRole(actorRole),
    actorStation,
    action: log.action,
    actionLabel,
    category,
    severity,
    outcome,
    targetType,
    targetId,
    targetReference,
    summary,
    details: detailsObj,
    ipAddress: log.ipAddress || null,
    userAgent: log.userAgent || null,
    clientSource,
    requestId,
    failureReason,
    beforeValue: canonicalData.beforeValue || detailsObj?.beforeValue || null,
    afterValue: canonicalData.afterValue || detailsObj?.afterValue || null,
    recordHash,
    previousHash: log.previousHash || canonicalData.previousHash || null,
  };
};

/**
 * Generates an accurate, human-readable narrative summary for an audit event
 */
export const generateAuditSummary = (params: {
  actorEmail: string;
  actorRoleLabel: string;
  actionLabel: string;
  targetReference: string;
  outcome: AuditOutcomeType;
  failureReason?: string | null;
}): string => {
  const actor = params.actorEmail ? `${params.actorEmail} (${params.actorRoleLabel})` : 'System Process';
  if (params.outcome === AuditOutcome.DENIED) {
    return `${actor} was denied access to ${params.targetReference}${params.failureReason ? ` due to ${params.failureReason.replace(/_/g, ' ')}` : ''}.`;
  }
  if (params.outcome === AuditOutcome.FAILURE) {
    return `${params.actionLabel} for ${params.targetReference} failed by ${actor}${params.failureReason ? `: ${params.failureReason}` : ''}.`;
  }
  return `${actor} performed ${params.actionLabel} on ${params.targetReference}.`;
};

/**
 * Asynchronously logs a hardened, canonical audit event
 */
export const recordAuditLog = async (options: AuditLogOptions): Promise<void> => {
  try {
    if (!options.userId || options.userId <= 0) return;

    const sanitizedDetails = sanitizeAuditDetails(options.details);
    const sanitizedBefore = sanitizeAuditDetails(options.beforeValue);
    const sanitizedAfter = sanitizeAuditDetails(options.afterValue);

    const derived = deriveActionMetadata(
      options.action,
      options.entityType,
      options.status,
      sanitizedDetails
    );

    const category = options.category || derived.category;
    const severity = options.severity || derived.severity;
    const outcome = options.outcome || derived.outcome;
    const actionLabel = options.actionLabel || derived.actionLabel;
    const targetType = options.entityType || 'General';
    const targetId = options.entityId ?? 0;
    const targetReference = options.targetReference || (targetId > 0 ? `${targetType} #${targetId}` : targetType);
    const clientSource = options.clientSource || (options.userAgent?.includes('Dart') || options.userAgent?.includes('Mobile') ? ClientSource.MOBILE : ClientSource.WEB);
    const requestId = options.requestId || null;

    // Fetch user details for actor context if not cached
    let actorEmail = 'UNKNOWN';
    let actorRole = 'UNKNOWN';
    let actorStation: string | null = null;

    try {
      const user = await prisma.user.findUnique({
        where: { id: options.userId },
        select: { email: true, role: { select: { name: true } }, personnel: { select: { school: true } } },
      });
      if (user) {
        actorEmail = user.email;
        actorRole = user.role.name;
        actorStation = user.personnel?.school || null;
      }
    } catch {
      // Safe fallback
    }

    const timestamp = new Date();
    await prisma.$transaction(async tx => {
      // Serialize writers so two concurrent events cannot point at the same predecessor.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20120260928)`;
      const lastLog = await tx.validationLog.findFirst({
        where: { recordHash: { not: null } },
        orderBy: { id: 'desc' },
        select: { recordHash: true },
      });
      const previousHash = lastLog?.recordHash || 'GENESIS';
      const detailsJson = {
        ...(sanitizedDetails || {}),
        ...(sanitizedBefore ? { beforeValue: sanitizedBefore } : {}),
        ...(sanitizedAfter ? { afterValue: sanitizedAfter } : {}),
      };
      const recordHash = computeRecordHash(
        timestamp.toISOString(), options.action, category, outcome, options.userId,
        actorEmail, targetType, targetId, detailsJson, previousHash
      );

      await tx.validationLog.create({
        data: {
          userId: options.userId,
          action: options.action,
          entityType: targetType,
          entityId: targetId,
          detailsJson,
          ipAddress: options.ipAddress ? String(options.ipAddress).split(',')[0].trim() : null,
          userAgent: options.userAgent || null,
          status: outcome === AuditOutcome.SUCCESS ? 'SUCCESS' : 'FAILED',
          timestamp,
          category,
          severity,
          outcome,
          actionLabel,
          targetType,
          targetId,
          targetReference,
          actorEmail,
          actorRole,
          actorStation,
          clientSource,
          requestId,
          failureReason: options.failureReason || null,
          recordHash,
          previousHash,
          hashVersion: 2,
        },
      });
    });
  } catch (error) {
    logger.error({ err: error }, '[AuditTrail] Failed to write validation log');
  }
};
