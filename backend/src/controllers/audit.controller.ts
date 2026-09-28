import { Request, Response } from 'express';
import { createHash } from 'crypto';
import prisma from '../config/prisma';
import {
  sendSuccess,
  sendError,
  sendBadRequest,
  sendNotFound,
  getPaginationParams,
  buildPaginationMeta,
} from '../utils/response.util';
import { getStationScope, personnelScopeFilter } from '../utils/scope.util';
import {
  deriveAuditCategory,
  mapToCanonicalAuditEvent,
  recordAuditLog,
  computeRecordHash,
  humanizeRole,
  formatManilaTimestamp,
} from '../utils/audit.util';
import {
  AuditCategory,
  AuditSeverity,
  AuditOutcome,
  SecurityFinding,
  AuditSummaryStats,
} from '../types/audit.types';
import { logger } from '../utils/logger';

/**
 * Builds Prisma where filter based on query params and user scope
 */
const buildAuditWhere = async (req: Request): Promise<Record<string, any>> => {
  const {
    userId,
    action,
    actionType,
    category,
    severity,
    outcome,
    resourceType,
    targetType,
    ipAddress,
    requestId,
    startDate,
    endDate,
    search,
    role,
  } = req.query;

  const where: Record<string, any> = {};

  if (userId) {
    const parsedUserId = parseInt(String(userId), 10);
    if (!isNaN(parsedUserId)) {
      where.userId = parsedUserId;
    }
  }

  // Exact action or case-insensitive search
  const actionFilter = action || actionType;
  if (actionFilter) {
    where.action = { contains: String(actionFilter), mode: 'insensitive' };
  }

  // Target / resource type filter
  const targetFilter = targetType || resourceType;
  if (targetFilter) {
    where.targetType = { equals: String(targetFilter), mode: 'insensitive' };
  }

  // IP filter
  if (ipAddress) {
    where.ipAddress = { contains: String(ipAddress).trim() };
  }

  // Date range filter
  if (startDate || endDate) {
    const timeFilter: Record<string, Date> = {};
    if (startDate) {
      const s = new Date(String(startDate));
      if (!isNaN(s.getTime())) timeFilter.gte = s;
    }
    if (endDate) {
      const e = new Date(String(endDate));
      if (!isNaN(e.getTime())) timeFilter.lte = e;
    }
    if (Object.keys(timeFilter).length > 0) {
      where.timestamp = timeFilter;
    }
  }

  // Status / outcome filter
  if (outcome) {
    const cleanOutcome = String(outcome).toUpperCase();
    if (Object.values(AuditOutcome).includes(cleanOutcome as any)) {
      where.outcome = cleanOutcome;
    }
  }

  if (category && !['All', 'All Activities'].includes(String(category))) {
    where.category = String(category);
  }
  if (severity && String(severity) !== 'All') {
    where.severity = String(severity).toUpperCase();
  }
  if (requestId) {
    where.requestId = { contains: String(requestId).trim(), mode: 'insensitive' };
  }

  // Role filter on user relation
  if (role) {
    where.user = {
      ...(where.user || {}),
      role: { name: String(role).toUpperCase() },
    };
  }

  // Search filter across actor email, action, entity type, details, or IP
  if (search) {
    const q = String(search).trim();
    if (q) {
      where.OR = [
        { action: { contains: q, mode: 'insensitive' } },
        { entityType: { contains: q, mode: 'insensitive' } },
        { actorEmail: { contains: q, mode: 'insensitive' } },
        { targetReference: { contains: q, mode: 'insensitive' } },
        { requestId: { contains: q, mode: 'insensitive' } },
        { ipAddress: { contains: q, mode: 'insensitive' } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
      ];
    }
  }

  // Station scope enforcement: AO II reads their own actions and those of personnel they review.
  const scope = await getStationScope(req.user);
  if (scope.isScoped) {
    const personnelFilter = personnelScopeFilter(scope, 'review');
    where.user = {
      ...(where.user || {}),
      OR: [
        { id: req.user!.userId },
        { personnel: personnelFilter },
      ],
    };
  }

  return where;
};

/**
 * GET /api/v1/audit-logs
 * Paginated list of canonical audit records with multi-dimensional filtering
 */
export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawLimit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const { page, skip } = getPaginationParams(req.query as Record<string, unknown>);
    const limit = Math.min(500, Math.max(1, isNaN(rawLimit) ? 50 : rawLimit));

    // Validate date format if supplied
    if (req.query.startDate && isNaN(new Date(String(req.query.startDate)).getTime())) {
      sendBadRequest(res, 'Invalid startDate format. Expected valid ISO-8601 date string.');
      return;
    }
    if (req.query.endDate && isNaN(new Date(String(req.query.endDate)).getTime())) {
      sendBadRequest(res, 'Invalid endDate format. Expected valid ISO-8601 date string.');
      return;
    }

    const where = await buildAuditWhere(req);

    const [data, total] = await Promise.all([
      prisma.validationLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
          user: {
            select: {
              email: true,
              role: { select: { name: true } },
              personnel: { select: { school: true, firstName: true, lastName: true } },
            },
          },
        },
      }),
      prisma.validationLog.count({ where }),
    ]);

    // Map each row to canonical audit event
    const canonicalEvents = data.map(log => mapToCanonicalAuditEvent(log));

    // Preserve exact backward-compatible field names for existing integrations
    const payload = canonicalEvents.map(e => ({
      id: e.id,
      timestamp: e.timestamp,
      displayTimestamp: e.displayTimestamp,
      userId: e.userId,
      userEmail: e.actorEmail,
      userRole: e.actorRole,
      actorRoleLabel: e.actorRoleLabel,
      actorStation: e.actorStation,
      category: e.category,
      severity: e.severity,
      outcome: e.outcome,
      action: e.action,
      actionLabel: e.actionLabel,
      resourceType: e.targetType,
      resourceId: e.targetId,
      targetType: e.targetType,
      targetId: e.targetId,
      targetReference: e.targetReference,
      summary: e.summary,
      details: e.details,
      ipAddress: e.ipAddress,
      userAgent: e.userAgent,
      status: e.outcome === AuditOutcome.SUCCESS ? 'SUCCESS' : 'FAILED',
      clientSource: e.clientSource,
      requestId: e.requestId,
      failureReason: e.failureReason,
      beforeValue: e.beforeValue,
      afterValue: e.afterValue,
      recordHash: e.recordHash,
      previousHash: e.previousHash,
    }));

    sendSuccess(res, payload, undefined, 200, buildPaginationMeta(page, limit, total));
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to retrieve audit logs');
    sendError(res, 'Failed to retrieve audit logs.', 500);
  }
};

/**
 * GET /api/v1/audit-logs/:id
 * Retrieve full details for a single audit event
 */
export const getAuditLogById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendBadRequest(res, 'Invalid audit log ID.');
      return;
    }

    const log = await prisma.validationLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            email: true,
            role: { select: { name: true } },
            personnel: { select: { school: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!log) {
      sendNotFound(res, 'Audit record not found.');
      return;
    }

    // Check station scope for AO II
    const scope = await getStationScope(req.user);
    if (scope.isScoped && log.userId !== req.user!.userId) {
      const targetUser = await prisma.user.findUnique({
        where: { id: log.userId },
        include: { personnel: true },
      });
      if (!targetUser?.personnel || targetUser.personnel.school !== scope.school) {
        sendNotFound(res, 'Audit record not found.');
        return;
      }
    }

    const canonical = mapToCanonicalAuditEvent(log);
    sendSuccess(res, canonical);
  } catch (error: any) {
    logger.error({ err: error, id: req.params.id }, 'Failed to retrieve audit record');
    sendError(res, 'Failed to retrieve audit record.', 500);
  }
};

/**
 * GET /api/v1/audit-logs/summary
 * Direct database-derived statistics and security metrics
 */
export const getAuditSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = await getStationScope(req.user);
    const where: any = {};
    if (scope.isScoped) {
      where.user = {
        OR: [
          { id: req.user!.userId },
          { personnel: personnelScopeFilter(scope, 'review') },
        ],
      };
    }

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      total,
      failedCount,
      logins24h,
      failedLogins24h,
      accessDenied24h,
      lockedAccounts,
      privilegedChanges24h,
      exports24h,
    ] = await Promise.all([
      prisma.validationLog.count({ where }),
      prisma.validationLog.count({ where: { ...where, status: 'FAILED' } }),
      prisma.validationLog.count({
        where: { ...where, action: 'LOGIN_SUCCESS', timestamp: { gte: since24h } },
      }),
      prisma.validationLog.count({
        where: { ...where, action: 'LOGIN_FAILED', timestamp: { gte: since24h } },
      }),
      prisma.validationLog.count({
        where: { ...where, action: 'ACCESS_DENIED', timestamp: { gte: since24h } },
      }),
      prisma.user.count({ where: { lockedUntil: { gt: new Date() } } }),
      prisma.validationLog.count({
        where: {
          ...where,
          action: { in: ['ROLE_MODIFIED', 'USER_DEACTIVATED', 'USER_DELETED', 'PASSWORD_RESET_BY_ADMIN'] },
          timestamp: { gte: since24h },
        },
      }),
      prisma.validationLog.count({
        where: {
          ...where,
          action: { in: ['AUDIT_EXPORT_GENERATED', 'REPORT_EXPORTED'] },
          timestamp: { gte: since24h },
        },
      }),
    ]);

    const stats: AuditSummaryStats = {
      total,
      criticalCount: privilegedChanges24h,
      highCount: accessDenied24h,
      warningCount: failedLogins24h + lockedAccounts,
      failedCount,
      deniedCount: accessDenied24h,
      logins24h,
      failedLogins24h,
      accessDenied24h,
      lockedAccounts,
      privilegedChanges24h,
      exports24h,
    };

    sendSuccess(res, stats);
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to calculate audit summary');
    sendError(res, 'Failed to calculate audit summary.', 500);
  }
};

/**
 * GET /api/v1/audit-logs/security-findings
 * Proactive security threat detection and compliance findings
 */
export const getSecurityFindings = async (req: Request, res: Response): Promise<void> => {
  try {
    const findings: SecurityFinding[] = [];
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Rule 1: Account Lockouts
    const lockedCount = await prisma.user.count({ where: { lockedUntil: { gt: new Date() } } });
    if (lockedCount > 0) {
      findings.push({
        id: 'SEC-001',
        title: 'Active Account Lockouts',
        severity: AuditSeverity.WARNING,
        category: AuditCategory.AUTHENTICATION,
        count: lockedCount,
        description: `${lockedCount} account(s) are currently locked due to repeated invalid password attempts.`,
        recommendation: 'Review authentication logs for targeted credential guessing or assist legitimate staff with password recovery.',
        lastDetectedAt: new Date().toISOString(),
      });
    }

    // Rule 2: Repeated Failed Logins
    const failedLogins = await prisma.validationLog.count({
      where: { action: 'LOGIN_FAILED', timestamp: { gte: since24h } },
    });
    if (failedLogins >= 5) {
      findings.push({
        id: 'SEC-002',
        title: 'High Rate of Authentication Failures',
        severity: failedLogins >= 20 ? AuditSeverity.HIGH : AuditSeverity.WARNING,
        category: AuditCategory.AUTHENTICATION,
        count: failedLogins,
        description: `${failedLogins} sign-in failures were recorded in the last 24 hours.`,
        recommendation: 'Inspect originating IP addresses and verify whether rate limiting or account lockout was triggered.',
        lastDetectedAt: new Date().toISOString(),
      });
    }

    // Rule 3: Access Denials / Boundary Crossings
    const accessDenials = await prisma.validationLog.count({
      where: { action: 'ACCESS_DENIED', timestamp: { gte: since24h } },
    });
    if (accessDenials > 0) {
      findings.push({
        id: 'SEC-003',
        title: 'Unauthorized Access Attempts Denied',
        severity: accessDenials >= 5 ? AuditSeverity.CRITICAL : AuditSeverity.HIGH,
        category: AuditCategory.ROLES_PERMISSIONS,
        count: accessDenials,
        description: `${accessDenials} request(s) were refused by server-side authorization guards in the last 24 hours.`,
        recommendation: 'Examine denied request paths to determine whether users have misconfigured roles or are testing unauthorized endpoints.',
        lastDetectedAt: new Date().toISOString(),
      });
    }

    // Rule 4: Privileged Role Changes
    const roleChanges = await prisma.validationLog.count({
      where: { action: 'ROLE_MODIFIED', timestamp: { gte: since7d } },
    });
    if (roleChanges > 0) {
      findings.push({
        id: 'SEC-004',
        title: 'Administrative Role Elevation',
        severity: AuditSeverity.CRITICAL,
        category: AuditCategory.ROLES_PERMISSIONS,
        count: roleChanges,
        description: `${roleChanges} user role modification(s) were performed in the last 7 days.`,
        recommendation: 'Verify that every role elevation was authorized by the Division Superintendent or Head of Office.',
        lastDetectedAt: new Date().toISOString(),
      });
    }

    // Rule 5: System Administrator Provisioning
    const sysAdminAccounts = await prisma.user.count({
      where: { role: { name: 'SYSTEM_ADMIN' } },
    });
    if (sysAdminAccounts > 3) {
      findings.push({
        id: 'SEC-005',
        title: 'Elevated System Administrator Count',
        severity: AuditSeverity.NOTICE,
        category: AuditCategory.ROLES_PERMISSIONS,
        count: sysAdminAccounts,
        description: `${sysAdminAccounts} accounts currently hold the System Administrator role.`,
        recommendation: 'Keep administrative roles to the minimum required for operational redundancy according to DepEd cybersecurity standards.',
        lastDetectedAt: new Date().toISOString(),
      });
    }

    // Rule 6: Device Verification Disabled Accounts
    const disabledVerificationCount = await prisma.user.count({
      where: { deviceVerification: false },
    });
    if (disabledVerificationCount > 0) {
      findings.push({
        id: 'SEC-006',
        title: 'Accounts Without Device Verification',
        severity: AuditSeverity.WARNING,
        category: AuditCategory.AUTHENTICATION,
        count: disabledVerificationCount,
        description: `${disabledVerificationCount} account(s) have new-device email challenge disabled.`,
        recommendation: 'Re-enable device verification on all user accounts to prevent unauthorized access from unrecognized hardware.',
        lastDetectedAt: new Date().toISOString(),
      });
    }

    // Rule 7: Permanent Email Delivery Failures
    const failedDeliveries = await prisma.workflowOutbox.count({
      where: {
        processedAt: null,
        attempts: { gte: 8 },
        lastError: { not: null },
      },
    });
    if (failedDeliveries > 0) {
      findings.push({
        id: 'SEC-007',
        title: 'Exhausted Transactional Email Deliveries',
        severity: AuditSeverity.WARNING,
        category: AuditCategory.EMAIL_NOTIFICATION,
        count: failedDeliveries,
        description: `${failedDeliveries} critical notification(s) exhausted all delivery attempts without success.`,
        recommendation: 'Verify SMTP credentials, recipient mailbox statuses, and server network connectivity.',
        lastDetectedAt: new Date().toISOString(),
      });
    }

    sendSuccess(res, findings);
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to compute security findings');
    sendError(res, 'Failed to compute security findings.', 500);
  }
};

/**
 * GET /api/v1/audit-logs/export/csv
 * Database-backed CSV export of the full audit query (up to 10,000 records)
 * Self-audits the export operation with row count and file checksum
 */
export const exportAuditCsv = async (req: Request, res: Response): Promise<void> => {
  try {
    const where = await buildAuditWhere(req);
    const maxExportRows = 10000;

    const logs = await prisma.validationLog.findMany({
      where,
      take: maxExportRows,
      orderBy: { timestamp: 'desc' },
      include: {
        user: {
          select: {
            email: true,
            role: { select: { name: true } },
            personnel: { select: { school: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    const canonicalEvents = logs.map(l => mapToCanonicalAuditEvent(l));

    // Construct CSV Header and Content
    const headers = [
      'Event ID',
      'UTC Timestamp',
      'Manila Timestamp',
      'Actor Account',
      'Actor Role',
      'Actor Station',
      'Category',
      'Severity',
      'Outcome',
      'Action Code',
      'Human Action',
      'Target Entity',
      'Target ID',
      'Target Reference',
      'IP Address',
      'Client Source',
      'Request ID',
      'Failure Reason',
      'Summary',
      'Record Checksum',
    ];

    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return '""';
      const s = String(val).replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = canonicalEvents.map(e => [
      e.id,
      escapeCsv(e.timestamp),
      escapeCsv(e.displayTimestamp),
      escapeCsv(e.actorEmail),
      escapeCsv(e.actorRoleLabel),
      escapeCsv(e.actorStation || 'Division Office'),
      escapeCsv(e.category),
      escapeCsv(e.severity),
      escapeCsv(e.outcome),
      escapeCsv(e.action),
      escapeCsv(e.actionLabel),
      escapeCsv(e.targetType),
      e.targetId,
      escapeCsv(e.targetReference),
      escapeCsv(e.ipAddress || '—'),
      escapeCsv(e.clientSource),
      escapeCsv(e.requestId),
      escapeCsv(e.failureReason || '—'),
      escapeCsv(e.summary),
      escapeCsv(e.recordHash || '—'),
    ].join(','));

    const csvOutput = [headers.join(','), ...rows].join('\r\n');
    const checksum = createHash('sha256').update(csvOutput).digest('hex');
    const requestId = (req as any).id || (req.headers['x-request-id'] as string) || null;

    // Self-audit this export
    await recordAuditLog({
      userId: req.user!.userId,
      action: 'AUDIT_EXPORT_GENERATED',
      entityType: 'AuditRegister',
      entityId: 0,
      details: {
        exportFormat: 'CSV',
        rowCount: canonicalEvents.length,
        filters: req.query,
        checksum,
        fileSizeBytes: Buffer.byteLength(csvOutput),
      },
      ipAddress: req.ip || null,
      userAgent: (req.headers['user-agent'] as string) || null,
      status: 'SUCCESS',
      category: AuditCategory.REPORTS_EXPORTS,
      severity: AuditSeverity.HIGH,
      outcome: AuditOutcome.SUCCESS,
      actionLabel: 'Audit evidence register exported',
      targetReference: `Export: ${canonicalEvents.length} rows (SHA-256: ${checksum.slice(0, 12)}...)`,
      requestId,
    });
    res.locals.auditLogged = true;

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Digital201_Audit_Trail_${dateStr}.csv"`);
    res.setHeader('X-Content-Checksum', checksum);
    res.status(200).send(csvOutput);
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to export audit CSV');
    sendError(res, 'Failed to export audit register as CSV.', 500);
  }
};

/**
 * GET /api/v1/audit-logs/export/json
 * Database-backed JSON export for technical and compliance review
 */
export const exportAuditJson = async (req: Request, res: Response): Promise<void> => {
  try {
    const where = await buildAuditWhere(req);
    const logs = await prisma.validationLog.findMany({
      where,
      take: 10000,
      orderBy: { timestamp: 'desc' },
      include: {
        user: {
          select: {
            email: true,
            role: { select: { name: true } },
            personnel: { select: { school: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    const canonicalEvents = logs.map(l => mapToCanonicalAuditEvent(l));
    const jsonOutput = JSON.stringify({
      system: 'Digital 201 HRIS',
      generatedAt: new Date().toISOString(),
      exportingActor: req.user?.email,
      totalRecords: canonicalEvents.length,
      records: canonicalEvents,
    }, null, 2);

    const checksum = createHash('sha256').update(jsonOutput).digest('hex');
    const requestId = (req as any).id || (req.headers['x-request-id'] as string) || null;

    // Self-audit this export
    await recordAuditLog({
      userId: req.user!.userId,
      action: 'AUDIT_EXPORT_GENERATED',
      entityType: 'AuditRegister',
      entityId: 0,
      details: {
        exportFormat: 'JSON',
        rowCount: canonicalEvents.length,
        checksum,
      },
      ipAddress: req.ip || null,
      userAgent: (req.headers['user-agent'] as string) || null,
      status: 'SUCCESS',
      category: AuditCategory.REPORTS_EXPORTS,
      severity: AuditSeverity.HIGH,
      outcome: AuditOutcome.SUCCESS,
      actionLabel: 'Audit evidence register exported (JSON)',
      requestId,
    });
    res.locals.auditLogged = true;

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Digital201_Audit_Trail_${dateStr}.json"`);
    res.setHeader('X-Content-Checksum', checksum);
    res.status(200).send(jsonOutput);
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to export audit JSON');
    sendError(res, 'Failed to export audit register as JSON.', 500);
  }
};

/**
 * GET /api/v1/audit-logs/verify-integrity
 * Evaluates tamper-evidence cryptographic chain for recent audit events
 */
export const verifyAuditIntegrity = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = 1000;
    const logs = await prisma.validationLog.findMany({
      take: limit,
      orderBy: { id: 'asc' },
    });

    let verifiableCount = 0;
    let intactCount = 0;
    let unverifiableCount = 0;
    const failures: Array<{ id: number; reason: string }> = [];
    let precedingHash = 'GENESIS';

    for (const log of logs) {
      if (log.hashVersion !== 2 || !log.recordHash || !log.previousHash || !log.actorEmail || !log.category || !log.targetType) {
        unverifiableCount++;
        continue;
      }

      verifiableCount++;
      const expectedHash = computeRecordHash(
        log.timestamp.toISOString(), log.action, log.category, log.outcome,
        log.userId, log.actorEmail, log.targetType, log.targetId ?? log.entityId,
        log.detailsJson, log.previousHash
      );
      const linkMatches = log.previousHash === precedingHash;
      const contentMatches = expectedHash === log.recordHash;

      if (linkMatches && contentMatches) intactCount++;
      else failures.push({
        id: log.id,
        reason: !contentMatches ? 'Record content hash mismatch' : 'Previous hash link mismatch',
      });
      precedingHash = log.recordHash;
    }

    const tamperingDetected = failures.length > 0;
    sendSuccess(res, {
      checkedRecords: logs.length,
      verifiableRecords: verifiableCount,
      intactRecords: intactCount,
      legacyUnhashedRecords: unverifiableCount,
      tamperingDetected,
      failures: failures.slice(0, 25),
      algorithm: 'SHA-256 hash chain (version 2)',
      coverageLimited: logs.length === limit,
      verifiedAt: new Date().toISOString(),
      status: tamperingDetected ? 'INTEGRITY_FAILURE' : verifiableCount > 0 ? 'VERIFIED' : 'NO_VERIFIABLE_RECORDS',
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to verify audit trail integrity');
    sendError(res, 'Failed to verify audit trail integrity.', 500);
  }
};

/**
 * GET /api/v1/audit-logs/retention-policy
 * Details legal governance, retention tiers, and authorization matrices
 */
export const getRetentionPolicy = async (_req: Request, res: Response): Promise<void> => {
  sendSuccess(res, {
    governanceFramework: 'Retention schedule pending formal approval by the authorized DepEd records and privacy officers.',
    policyMode: 'Append-only through the application API; database-level WORM storage is not configured.',
    tiers: [
      {
        tier: 'Personnel and statutory 201 records',
        description: 'Employment, appointment, eligibility, and promotion records.',
        retentionPeriod: 'Not configured — apply the approved agency records disposition schedule.',
        purgePolicy: 'No automated deletion is enabled.',
      },
      {
        tier: 'Security and accountability audit logs',
        description: 'Sign-in events, role elevations, password changes, access denials, and credential provisioning.',
        retentionPeriod: 'Not configured — requires an approved retention period and archive destination.',
        purgePolicy: 'No runtime purge endpoint is exposed.',
      },
      {
        tier: 'Routine technical telemetry',
        description: 'Temporary health probes, notifications polling, and automated session maintenance.',
        retentionPeriod: 'Not configured.',
        purgePolicy: 'Define and approve a separate operational telemetry policy before automation.',
      },
    ],
    accessMatrix: {
      readAuditTrail: ['SYSTEM_ADMIN', 'HRMO', 'AO_II (Station-Scoped Only)'],
      exportAuditTrail: ['SYSTEM_ADMIN'],
      purgeAuditRecords: ['No runtime API'],
    },
    lastReviewed: null,
    status: 'REQUIRES_POLICY_APPROVAL',
  });
};

/**
 * GET /api/v1/reports/compliance-summary (Existing compliance report)
 */
export const getComplianceReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = await getStationScope(req.user);
    const txWhere: any = {};
    if (scope.isScoped) {
      txWhere.personnel = { school: scope.school };
    }

    const [total, approved, rejected, pending] = await Promise.all([
      prisma.transaction.count({ where: txWhere }),
      prisma.transaction.count({ where: { ...txWhere, status: 'APPROVED' } }),
      prisma.transaction.count({ where: { ...txWhere, status: 'REJECTED' } }),
      prisma.transaction.count({ where: { ...txWhere, status: { in: ['PENDING_VALIDATION', 'FOR_APPROVAL'] } } }),
    ]);

    sendSuccess(res, {
      period: scope.isScoped ? `School Scope: ${scope.school || 'Assigned School'}` : 'Division Master',
      totalTransactions: total,
      approvedTransactions: approved,
      rejectedTransactions: rejected,
      pendingTransactions: pending,
      complianceRate: total > 0 ? `${Math.round((approved / total) * 100)}%` : '0%',
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to generate compliance report');
    sendError(res, 'Failed to generate compliance report.', 500);
  }
};

/**
 * GET /api/v1/reports/personnel-demographics (Existing demographics report)
 */
export const getDemographicsReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = await getStationScope(req.user);
    const pWhere: any = {};
    if (scope.isScoped && scope.school) {
      pWhere.school = scope.school;
    }

    const [total, byStatus] = await Promise.all([
      prisma.personnel.count({ where: pWhere }),
      prisma.personnel.groupBy({
        by: ['status'],
        where: pWhere,
        _count: { status: true },
      }),
    ]);

    sendSuccess(res, {
      scope: scope.isScoped ? `School Scope: ${scope.school || 'Assigned School'}` : 'Division Master',
      totalPersonnel: total,
      breakdownByStatus: Object.fromEntries(byStatus.map(g => [g.status, g._count.status])),
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to generate demographics report');
    sendError(res, 'Failed to generate demographics report.', 500);
  }
};
