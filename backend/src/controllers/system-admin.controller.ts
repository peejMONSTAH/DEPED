import { Request, Response } from 'express';
import crypto from 'crypto';
import { execFile } from 'child_process';
import prisma from '../config/prisma';
import { config } from '../config';
import { logger } from '../utils/logger';
import { recordAuditLog } from '../utils/audit.util';
import { AuditCategory, AuditSeverity } from '../types/audit.types';
import { buildPaginationMeta, getPaginationParams, sendBadRequest, sendError, sendNotFound, sendSuccess } from '../utils/response.util';
import { maskEmail } from '../utils/system-admin.util';
import { invalidateAuthUserCache } from '../middleware/auth.middleware';
import { outboxWorkerState, OUTBOX_MAX_ATTEMPTS } from '../services/workflow-outbox.service';
import { checkStorageHealth } from '../services/document-storage.service';

/**
 * System Administration: sessions, devices, email delivery, backups, service
 * health and operational exports. Every route is SYSTEM_ADMIN-only (see
 * system-admin.routes.ts). Nothing here returns a token, hash, OTP, password,
 * connection string or outbox payload.
 */

const intParam = (v: unknown) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const audit = (req: Request, action: string, extra: Partial<Parameters<typeof recordAuditLog>[0]> = {}) =>
  recordAuditLog({
    userId: req.user!.userId, action, ipAddress: req.ip, userAgent: req.get('user-agent') || null,
    requestId: (req as any).id || req.get('x-request-id') || null, ...extra,
  });
const notify = (userId: number, message: string) =>
  prisma.notification.create({ data: { userId, message, type: 'WARNING' } }).catch(err => logger.error({ err }, 'Could not notify user'));

// ── Sessions ────────────────────────────────────────────────────────────────

export async function listSessions(req: Request, res: Response) {
  const { page, limit, skip } = getPaginationParams(req.query);
  const now = new Date();
  const userId = intParam(req.query.userId);
  const client = typeof req.query.client === 'string' && ['web', 'app'].includes(req.query.client) ? req.query.client : undefined;
  const state = req.query.state === 'all' ? 'all' : 'active';
  const where = {
    ...(userId && { userId }),
    ...(client && { client }),
    ...(state === 'active' && { revoked: false, expiresAt: { gt: now } }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.refreshToken.findMany({
      where, skip, take: limit, orderBy: [{ lastUsedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, client: true, createdAt: true, lastUsedAt: true, expiresAt: true, revoked: true,
        user: { select: { id: true, email: true, role: { select: { name: true } } } } },
    }),
    prisma.refreshToken.count({ where }),
  ]);
  // Accounts holding more live sessions than the policy allows.
  const over = await prisma.refreshToken.groupBy({
    by: ['userId'], where: { revoked: false, expiresAt: { gt: now } }, _count: { _all: true },
    having: { userId: { _count: { gt: config.session.maxConcurrentSessions } } },
  });
  sendSuccess(res, rows.map(r => ({
    id: r.id, client: r.client, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt, expiresAt: r.expiresAt,
    state: r.revoked ? 'REVOKED' : r.expiresAt <= now ? 'EXPIRED' : 'ACTIVE',
    account: { id: r.user.id, email: r.user.email, role: r.user.role.name },
  })), undefined, 200, buildPaginationMeta(page, limit, total), {
    policy: { maximumConcurrentSessions: config.session.maxConcurrentSessions },
    accountsOverLimit: over.map(o => ({ userId: o.userId, sessions: o._count._all })),
  });
}

export async function revokeSession(req: Request, res: Response) {
  const id = intParam(req.params.id);
  if (!id) { sendBadRequest(res, 'Invalid session.'); return; }
  const row = await prisma.refreshToken.findUnique({ where: { id }, select: { id: true, userId: true, revoked: true } });
  if (!row) { sendNotFound(res, 'Session not found.'); return; }
  if (row.userId === req.user!.userId && req.body?.confirmOwn !== true) {
    sendBadRequest(res, 'This is one of your own sessions. Confirm to sign it out.', 'OWN_SESSION_CONFIRM_REQUIRED'); return;
  }
  if (!row.revoked) await prisma.refreshToken.update({ where: { id }, data: { revoked: true } });
  invalidateAuthUserCache(row.userId);
  await audit(req, 'SESSION_REVOKED', { entityType: 'User', entityId: row.userId, category: AuditCategory.AUTHENTICATION, severity: AuditSeverity.NOTICE, details: { sessionId: id, reason: req.body?.reason || null } });
  if (row.userId !== req.user!.userId) await notify(row.userId, 'A System Administrator signed out one of your sessions. Sign in again to continue.');
  sendSuccess(res, { id, result: row.revoked ? 'ALREADY_REVOKED' : 'REVOKED' });
}

export async function revokeAccountSessions(req: Request, res: Response) {
  const userId = intParam(req.params.id);
  if (!userId) { sendBadRequest(res, 'Invalid account.'); return; }
  if (userId === req.user!.userId && req.body?.confirmOwn !== true) {
    sendBadRequest(res, 'This would sign you out everywhere, including this session. Confirm to continue.', 'OWN_SESSION_CONFIRM_REQUIRED'); return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) { sendNotFound(res, 'Account not found.'); return; }
  const { count } = await prisma.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } });
  invalidateAuthUserCache(userId);
  await audit(req, 'SESSIONS_REVOKED_ALL', { entityType: 'User', entityId: userId, category: AuditCategory.AUTHENTICATION, severity: AuditSeverity.WARNING, details: { revoked: count, reason: req.body?.reason || null } });
  if (userId !== req.user!.userId) await notify(userId, 'A System Administrator signed you out of every device. Sign in again to continue.');
  sendSuccess(res, { userId, revoked: count, result: 'SIGNED_OUT' });
}

// ── Trusted devices and challenges ──────────────────────────────────────────

export async function listDevices(req: Request, res: Response) {
  const { page, limit, skip } = getPaginationParams(req.query);
  const now = new Date();
  const userId = intParam(req.query.userId);
  const where = { ...(userId && { userId }), ...(req.query.state !== 'all' && { revokedAt: null, expiresAt: { gt: now } }) };
  const [rows, total, pendingChallenges, lockedChallenges] = await prisma.$transaction([
    prisma.trustedDevice.findMany({
      where, skip, take: limit, orderBy: [{ lastUsedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, label: true, ipAddress: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true,
        user: { select: { id: true, email: true } } },
    }),
    prisma.trustedDevice.count({ where }),
    prisma.loginChallenge.count({ where: { consumedAt: null, expiresAt: { gt: now } } }),
    prisma.loginChallenge.count({ where: { consumedAt: null, expiresAt: { gt: now }, attempts: { gte: 5 } } }),
  ]);
  sendSuccess(res, rows.map(d => ({
    id: d.id, label: d.label, ipAddress: d.ipAddress, createdAt: d.createdAt, lastUsedAt: d.lastUsedAt, expiresAt: d.expiresAt,
    state: d.revokedAt ? 'REVOKED' : d.expiresAt <= now ? 'EXPIRED' : 'TRUSTED',
    account: { id: d.user.id, email: d.user.email },
  })), undefined, 200, buildPaginationMeta(page, limit, total), { challenges: { pending: pendingChallenges, tooManyAttempts: lockedChallenges } });
}

export async function revokeDevice(req: Request, res: Response) {
  const id = intParam(req.params.id);
  if (!id) { sendBadRequest(res, 'Invalid device.'); return; }
  const row = await prisma.trustedDevice.findUnique({ where: { id }, select: { id: true, userId: true, revokedAt: true, label: true } });
  if (!row) { sendNotFound(res, 'Device not found.'); return; }
  if (!row.revokedAt) await prisma.trustedDevice.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit(req, 'TRUSTED_DEVICE_REVOKED', { entityType: 'User', entityId: row.userId, category: AuditCategory.AUTHENTICATION, severity: AuditSeverity.NOTICE, details: { deviceId: id, label: row.label, reason: req.body?.reason || null } });
  if (row.userId !== req.user!.userId) await notify(row.userId, `A System Administrator removed "${row.label}" from your trusted devices. It will need an emailed code at the next sign-in.`);
  sendSuccess(res, { id, result: row.revokedAt ? 'ALREADY_REVOKED' : 'REVOKED' });
}

/** Next sign-in on every device needs an emailed code: turns the check on and forgets trusted devices. */
export async function requireDeviceVerification(req: Request, res: Response) {
  const userId = intParam(req.params.id);
  if (!userId) { sendBadRequest(res, 'Invalid account.'); return; }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, deviceVerification: true } });
  if (!user) { sendNotFound(res, 'Account not found.'); return; }
  const [, devices] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { deviceVerification: true } }),
    prisma.trustedDevice.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  invalidateAuthUserCache(userId);
  await audit(req, 'DEVICE_VERIFICATION_REQUIRED', {
    entityType: 'User', entityId: userId, category: AuditCategory.AUTHENTICATION, severity: AuditSeverity.NOTICE,
    beforeValue: { deviceVerification: user.deviceVerification }, afterValue: { deviceVerification: true },
    details: { devicesRevoked: devices.count, reason: req.body?.reason || null },
  });
  sendSuccess(res, { userId, devicesRevoked: devices.count, result: 'VERIFICATION_REQUIRED' });
}

// ── Email delivery (workflow outbox) ────────────────────────────────────────

const outboxState = (r: { processedAt: Date | null; attempts: number }) =>
  r.processedAt ? 'SENT' : r.attempts >= OUTBOX_MAX_ATTEMPTS ? 'FAILED' : r.attempts > 0 ? 'RETRYING' : 'PENDING';

/** Provider errors can echo addresses; keep the gist only. */
export const sanitizeProviderError = (e: string | null) =>
  e ? e.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/(token|key|password|secret)[=:]\s*\S+/gi, '$1=[redacted]').slice(0, 300) : null;

export async function listOutbox(req: Request, res: Response) {
  const { page, limit, skip } = getPaginationParams(req.query);
  const state = String(req.query.state || 'ATTENTION').toUpperCase();
  const where =
    state === 'PENDING' ? { processedAt: null, attempts: 0 }
    : state === 'RETRYING' ? { processedAt: null, attempts: { gt: 0, lt: OUTBOX_MAX_ATTEMPTS } }
    : state === 'FAILED' ? { processedAt: null, attempts: { gte: OUTBOX_MAX_ATTEMPTS } }
    : state === 'SENT' ? { processedAt: { not: null } }
    : state === 'ALL' ? {}
    : { processedAt: null, attempts: { gt: 0 } }; // ATTENTION: retrying or failed
  const [rows, total] = await prisma.$transaction([
    prisma.workflowOutbox.findMany({
      where, skip, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: { id: true, eventKey: true, kind: true, attempts: true, availableAt: true, processedAt: true, lastError: true, createdAt: true, payload: true },
    }),
    prisma.workflowOutbox.count({ where }),
  ]);
  sendSuccess(res, rows.map(r => {
    const p = (r.payload as Record<string, any>) || {};
    const s = outboxState(r);
    return {
      id: r.id, kind: r.kind, category: r.eventKey.split(':')[0], state: s, attempts: r.attempts,
      recipient: maskEmail(p.recipientEmail), createdAt: r.createdAt,
      nextAttemptAt: s === 'PENDING' || s === 'RETRYING' ? r.availableAt : null,
      sentAt: r.processedAt, error: sanitizeProviderError(r.lastError),
      // Provider acceptance only; inbox delivery is not confirmed without a delivery webhook.
      deliveryConfirmation: s === 'SENT' ? 'ACCEPTED_BY_PROVIDER' : null,
    };
  }), undefined, 200, buildPaginationMeta(page, limit, total));
}

const RETRY_COOLDOWN_MS = 10 * 60_000;

export async function retryOutbox(req: Request, res: Response) {
  const id = String(req.params.id || '');
  const row = await prisma.workflowOutbox.findUnique({ where: { id }, select: { id: true, kind: true, attempts: true, processedAt: true, payload: true } });
  if (!row) { sendNotFound(res, 'Message not found.'); return; }
  if (row.processedAt) { sendBadRequest(res, 'This message was already sent. It will not be sent twice.', 'ALREADY_SENT'); return; }
  if (row.attempts < OUTBOX_MAX_ATTEMPTS) { sendBadRequest(res, 'This message is still being retried automatically.', 'NOT_FAILED'); return; }
  if ((row.payload as any)?.credentialsRedacted) {
    sendBadRequest(res, 'This message carried a sign-in credential that was removed after it failed. Issue a new password reset instead.', 'CREDENTIALS_REDACTED'); return;
  }
  const recent = await prisma.validationLog.findFirst({
    where: { action: 'EMAIL_RETRY_REQUESTED', targetReference: id, timestamp: { gte: new Date(Date.now() - RETRY_COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) { sendBadRequest(res, 'A retry was requested for this message in the last 10 minutes.', 'RETRY_RATE_LIMITED'); return; }
  // Conditional update: two clicks cannot both re-queue it.
  const { count } = await prisma.workflowOutbox.updateMany({
    where: { id, processedAt: null, attempts: { gte: OUTBOX_MAX_ATTEMPTS } },
    data: { attempts: OUTBOX_MAX_ATTEMPTS - 1, availableAt: new Date(), lastError: null },
  });
  await audit(req, 'EMAIL_RETRY_REQUESTED', { entityType: 'WorkflowOutbox', targetReference: id, category: AuditCategory.EMAIL_NOTIFICATION, severity: AuditSeverity.NOTICE, details: { kind: row.kind, requeued: count === 1 } });
  sendSuccess(res, { id, result: count === 1 ? 'REQUEUED' : 'NO_CHANGE' });
}

// ── Backups ─────────────────────────────────────────────────────────────────

/** Called by the backup job itself with BACKUP_REPORT_TOKEN, not by a signed-in user. */
export async function reportBackupRun(req: Request, res: Response) {
  const expected = process.env.BACKUP_REPORT_TOKEN || '';
  const given = String(req.get('x-backup-report-token') || '');
  if (expected.length < 32 || given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    res.status(401).json({ status: 'error', code: 'BACKUP_REPORT_UNAUTHORIZED', message: 'Invalid backup report token.' }); return;
  }
  const b = req.body || {};
  const kind = ['DATABASE_BACKUP', 'RESTORE_DRILL'].includes(b.kind) ? b.kind : null;
  const status = ['SUCCEEDED', 'FAILED'].includes(b.status) ? b.status : null;
  const runKey = typeof b.runKey === 'string' && /^[\w:.-]{4,120}$/.test(b.runKey) ? b.runKey : null;
  if (!kind || !status || !runKey) { sendBadRequest(res, 'kind, status and runKey are required.', 'INVALID_BACKUP_REPORT'); return; }
  const num = (v: unknown) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
  const data = {
    kind, status,
    startedAt: b.startedAt ? new Date(b.startedAt) : null, finishedAt: b.finishedAt ? new Date(b.finishedAt) : null,
    sizeBytes: num(b.sizeBytes) === null ? null : BigInt(Math.trunc(num(b.sizeBytes)!)),
    encrypted: typeof b.encrypted === 'boolean' ? b.encrypted : null,
    manifestVerified: typeof b.manifestVerified === 'boolean' ? b.manifestVerified : null,
    missingObjects: num(b.missingObjects), objectCount: num(b.objectCount), retentionDays: num(b.retentionDays),
    error: typeof b.error === 'string' ? sanitizeProviderError(b.error) : null,
    source: typeof b.source === 'string' ? b.source.slice(0, 120) : null,
  };
  const existing = await prisma.backupRun.findUnique({ where: { runKey }, select: { id: true } });
  const row = existing
    ? await prisma.backupRun.update({ where: { runKey }, data })
    : await prisma.backupRun.create({ data: { runKey, ...data } });
  if (!existing && (status === 'FAILED' || data.manifestVerified === false || (data.missingObjects ?? 0) > 0)) {
    const admins = await prisma.user.findMany({ where: { accountStatus: 'ACTIVE', role: { name: 'SYSTEM_ADMIN' } }, select: { id: true } });
    await prisma.notification.createMany({ data: admins.map(a => ({
      userId: a.id, type: 'WARNING' as const, relatedEntityType: 'BackupRun', relatedEntityId: row.id,
      message: `${kind === 'RESTORE_DRILL' ? 'Restore drill' : 'Backup'} ${status === 'FAILED' ? 'failed' : 'finished with problems'}: ${data.error || (data.missingObjects ? `${data.missingObjects} referenced files missing` : 'manifest not verified')}.`,
    })) });
  }
  sendSuccess(res, { id: row.id, result: existing ? 'UPDATED' : 'RECORDED' });
}

const BACKUP_STALE_HOURS = 36;

export async function backupStatus() {
  const [lastBackup, lastGoodBackup, lastDrill, recent] = await Promise.all([
    prisma.backupRun.findFirst({ where: { kind: 'DATABASE_BACKUP' }, orderBy: { reportedAt: 'desc' } }),
    prisma.backupRun.findFirst({ where: { kind: 'DATABASE_BACKUP', status: 'SUCCEEDED' }, orderBy: { reportedAt: 'desc' } }),
    prisma.backupRun.findFirst({ where: { kind: 'RESTORE_DRILL' }, orderBy: { reportedAt: 'desc' } }),
    prisma.backupRun.findMany({ orderBy: { reportedAt: 'desc' }, take: 20 }),
  ]);
  const ageHours = lastGoodBackup ? (Date.now() - (lastGoodBackup.finishedAt || lastGoodBackup.reportedAt).getTime()) / 3_600_000 : null;
  const status = !lastBackup ? 'UNKNOWN'
    : lastBackup.status === 'FAILED' ? 'UNAVAILABLE'
    : ageHours === null || ageHours > BACKUP_STALE_HOURS || lastBackup.manifestVerified === false || (lastBackup.missingObjects ?? 0) > 0 ? 'DEGRADED'
    : 'OPERATIONAL';
  const view = (r: any) => r && ({ ...r, sizeBytes: r.sizeBytes === null ? null : Number(r.sizeBytes) });
  return {
    status,
    explanation: !lastBackup ? 'No backup job has reported a result yet. Enable the daily backup workflow and its BACKUP_REPORT_TOKEN.'
      : status === 'UNAVAILABLE' ? 'The latest backup failed.'
      : status === 'DEGRADED' ? (ageHours !== null && ageHours > BACKUP_STALE_HOURS ? `The last successful backup is ${Math.round(ageHours)} hours old.` : 'The latest backup finished with verification problems.')
      : 'The latest backup succeeded and its manifest was verified.',
    lastBackup: view(lastBackup), lastSuccessfulBackup: view(lastGoodBackup), lastRestoreDrill: view(lastDrill),
    history: recent.map(view),
    restore: 'Restoring production is a documented manual procedure (scripts/restore-drill.ps1 and the backup runbook); it is not available from the web.',
  };
}

export async function getBackups(_req: Request, res: Response) {
  sendSuccess(res, await backupStatus());
}

// ── Service health ──────────────────────────────────────────────────────────

type Health = 'OPERATIONAL' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'UNKNOWN';
interface Check { key: string; name: string; status: Health; detail: string; remedy?: string; checkedAt: string; metrics?: Record<string, unknown> }

let healthCache: { at: number; value: any } | null = null;
const HEALTH_TTL_MS = 30_000;

const ocrReady = () => new Promise<boolean>(resolve => {
  execFile(process.env.TESSERACT_BIN || 'tesseract', ['--version'], { timeout: 3000 }, err => resolve(!err));
});

export async function computeHealth() {
  const now = new Date();
  const at = now.toISOString();
  const checks: Check[] = [];
  const release = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || process.env.npm_package_version || 'unknown';

  checks.push({ key: 'api', name: 'API', status: 'OPERATIONAL', checkedAt: at,
    detail: `Responding. Release ${release}, up ${Math.round(process.uptime() / 60)} minutes.`, metrics: { release, uptimeSeconds: Math.round(process.uptime()) } });

  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const ms = Date.now() - t0;
    checks.push({ key: 'database', name: 'PostgreSQL', status: ms > 1500 ? 'DEGRADED' : 'OPERATIONAL', checkedAt: at, detail: `Query answered in ${ms} ms.`, metrics: { latencyMs: ms },
      ...(ms > 1500 && { remedy: 'Check the Supabase database load and connection pooler.' }) });
  } catch {
    checks.push({ key: 'database', name: 'PostgreSQL', status: 'UNAVAILABLE', checkedAt: at, detail: 'The database did not answer.', remedy: 'Check DATABASE_URL on Railway and the Supabase project status.' });
  }

  const storage = await checkStorageHealth();
  checks.push({ key: 'storage', checkedAt: at, ...storage });

  const [pending, retrying, failed, lastSent] = await Promise.all([
    prisma.workflowOutbox.count({ where: { processedAt: null, attempts: 0 } }),
    prisma.workflowOutbox.count({ where: { processedAt: null, attempts: { gt: 0, lt: OUTBOX_MAX_ATTEMPTS } } }),
    prisma.workflowOutbox.count({ where: { processedAt: null, attempts: { gte: OUTBOX_MAX_ATTEMPTS } } }),
    prisma.workflowOutbox.findFirst({ where: { processedAt: { not: null } }, orderBy: { processedAt: 'desc' }, select: { processedAt: true } }),
  ]);
  const provider = config.email.mailtrapApiToken ? 'Mailtrap API' : config.email.host ? 'SMTP' : null;
  checks.push({ key: 'email', name: 'Email delivery', checkedAt: at,
    status: !provider ? 'NOT_CONFIGURED' : failed > 0 ? 'DEGRADED' : 'OPERATIONAL',
    detail: !provider ? 'No email provider is configured.' : `${provider}. ${pending} pending, ${retrying} retrying, ${failed} failed.${lastSent?.processedAt ? ` Last accepted ${lastSent.processedAt.toISOString()}.` : ''}`,
    ...(failed > 0 && { remedy: 'Review failed messages under Email delivery.' }),
    ...(!provider && { remedy: 'Set MAILTRAP_API_TOKEN (or SMTP_*) on Railway.' }),
    metrics: { provider, pending, retrying, failed, lastAcceptedAt: lastSent?.processedAt || null } });

  const w = outboxWorkerState();
  const oldest = await prisma.workflowOutbox.findFirst({ where: { processedAt: null, attempts: { lt: OUTBOX_MAX_ATTEMPTS } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
  const beatAgeS = w.lastHeartbeat ? (Date.now() - w.lastHeartbeat.getTime()) / 1000 : null;
  checks.push({ key: 'worker', name: 'Background worker', checkedAt: at,
    status: !w.enabled ? 'NOT_CONFIGURED' : beatAgeS === null ? 'UNKNOWN' : beatAgeS > 120 ? 'DEGRADED' : 'OPERATIONAL',
    detail: !w.enabled ? 'Email delivery is disabled in this process.' : beatAgeS === null ? 'No worker cycle has run in this process yet.' : `Last cycle ${Math.round(beatAgeS)} s ago.${oldest ? ` Oldest queued message from ${oldest.createdAt.toISOString()}.` : ' Queue empty.'}`,
    metrics: { lastHeartbeat: w.lastHeartbeat, queueDepth: pending + retrying, oldestQueuedAt: oldest?.createdAt || null } });

  const since = new Date(Date.now() - 7 * 86_400_000);
  const [ok, ready] = await Promise.all([
    prisma.validationLog.count({ where: { action: 'PDS_OCR_COMPLETED', timestamp: { gte: since } } }),
    ocrReady(),
  ]);
  checks.push({ key: 'ocr', name: 'OCR', checkedAt: at, status: ready ? 'OPERATIONAL' : 'UNAVAILABLE',
    detail: ready ? `Tesseract is installed. ${ok} forms read in the last 7 days.` : 'The Tesseract program is not available on this server. Uploads still work; forms are read manually.',
    ...(!ready && { remedy: 'Install tesseract-ocr and poppler-utils in the backend image.' }) });

  const backup = await backupStatus();
  checks.push({ key: 'backup', name: 'Backups', checkedAt: at, status: backup.status as Health, detail: backup.explanation,
    ...(backup.status !== 'OPERATIONAL' && { remedy: 'See Backup & recovery.' }) });

  const https = /^https:\/\//.test(config.clientUrl);
  checks.push({ key: 'config', name: 'Domain and app compatibility', checkedAt: at, status: https || config.env !== 'production' ? 'OPERATIONAL' : 'DEGRADED',
    detail: `Public URL ${config.clientUrl}${https ? ' (HTTPS)' : ''}. Minimum phone app build ${config.minAppBuild || 'not enforced'}.`,
    metrics: { clientUrl: config.clientUrl, https, minAppBuild: config.minAppBuild, environment: config.env } });

  return { checkedAt: at, checks };
}

export async function getHealth(req: Request, res: Response) {
  const fresh = req.query.refresh === '1';
  if (!fresh && healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) { sendSuccess(res, { ...healthCache.value, cached: true }); return; }
  try {
    const value = await computeHealth();
    healthCache = { at: Date.now(), value };
    sendSuccess(res, { ...value, cached: false });
  } catch (err) {
    logger.error({ err }, 'Health check failed');
    sendError(res, 'The health check could not complete.', 500);
  }
}

// ── Operational exports ─────────────────────────────────────────────────────

const EXPORT_ROW_LIMIT = 10_000;
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  // Leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

type ReportDef = { title: string; columns: string[]; rows: (q: Request['query'], from: Date, to: Date) => Promise<unknown[][]> };

export const REPORTS: Record<string, ReportDef> = {
  accounts: {
    title: 'Account inventory', columns: ['id', 'email', 'role', 'status', 'must_change_password', 'locked_until', 'device_verification', 'last_login', 'created_at'],
    rows: async q => (await prisma.user.findMany({
      where: { ...(typeof q.role === 'string' && q.role && { role: { name: q.role as any } }), ...(typeof q.status === 'string' && q.status && { accountStatus: q.status as any }) },
      orderBy: { id: 'asc' }, take: EXPORT_ROW_LIMIT + 1,
      select: { id: true, email: true, accountStatus: true, mustChangePassword: true, lockedUntil: true, deviceVerification: true, lastLogin: true, createdAt: true, role: { select: { name: true } } },
    })).map(u => [u.id, u.email, u.role.name, u.accountStatus, u.mustChangePassword, u.lockedUntil, u.deviceVerification, u.lastLogin, u.createdAt]),
  },
  sessions: {
    title: 'Active sessions', columns: ['session_id', 'account', 'client', 'created_at', 'last_used_at', 'expires_at'],
    rows: async () => (await prisma.refreshToken.findMany({
      where: { revoked: false, expiresAt: { gt: new Date() } }, orderBy: { id: 'asc' }, take: EXPORT_ROW_LIMIT + 1,
      select: { id: true, client: true, createdAt: true, lastUsedAt: true, expiresAt: true, user: { select: { email: true } } },
    })).map(s => [s.id, s.user.email, s.client, s.createdAt, s.lastUsedAt, s.expiresAt]),
  },
  devices: {
    title: 'Trusted devices', columns: ['device_id', 'account', 'label', 'ip_address', 'created_at', 'last_used_at', 'expires_at', 'revoked_at'],
    rows: async () => (await prisma.trustedDevice.findMany({
      orderBy: { id: 'asc' }, take: EXPORT_ROW_LIMIT + 1,
      select: { id: true, label: true, ipAddress: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true, user: { select: { email: true } } },
    })).map(d => [d.id, d.user.email, d.label, d.ipAddress, d.createdAt, d.lastUsedAt, d.expiresAt, d.revokedAt]),
  },
  'auth-failures': {
    title: 'Authentication failures', columns: ['event_id', 'timestamp', 'actor_email', 'action', 'ip_address', 'failure_reason'],
    rows: async (_q, from, to) => (await prisma.validationLog.findMany({
      where: { category: AuditCategory.AUTHENTICATION, outcome: { in: ['FAILURE', 'DENIED'] }, timestamp: { gte: from, lte: to } },
      orderBy: { id: 'asc' }, take: EXPORT_ROW_LIMIT + 1,
      select: { id: true, timestamp: true, actorEmail: true, action: true, ipAddress: true, failureReason: true },
    })).map(e => [e.id, e.timestamp, e.actorEmail, e.action, e.ipAddress, e.failureReason]),
  },
  'access-denials': {
    title: 'Access-denial register', columns: ['event_id', 'timestamp', 'actor_email', 'actor_role', 'target_type', 'target_id', 'ip_address'],
    rows: async (_q, from, to) => (await prisma.validationLog.findMany({
      where: { outcome: 'DENIED', timestamp: { gte: from, lte: to } }, orderBy: { id: 'asc' }, take: EXPORT_ROW_LIMIT + 1,
      select: { id: true, timestamp: true, actorEmail: true, actorRole: true, targetType: true, targetId: true, ipAddress: true },
    })).map(e => [e.id, e.timestamp, e.actorEmail, e.actorRole, e.targetType, e.targetId, e.ipAddress]),
  },
  'privileged-changes': {
    title: 'Privileged changes', columns: ['event_id', 'timestamp', 'actor_email', 'action', 'target_type', 'target_id', 'severity'],
    rows: async (_q, from, to) => (await prisma.validationLog.findMany({
      where: { category: { in: [AuditCategory.ROLES_PERMISSIONS, AuditCategory.ACCOUNT_LIFECYCLE] }, timestamp: { gte: from, lte: to } },
      orderBy: { id: 'asc' }, take: EXPORT_ROW_LIMIT + 1,
      select: { id: true, timestamp: true, actorEmail: true, action: true, targetType: true, targetId: true, severity: true },
    })).map(e => [e.id, e.timestamp, e.actorEmail, e.action, e.targetType, e.targetId, e.severity]),
  },
  'email-failures': {
    title: 'Email delivery failures', columns: ['message_id', 'kind', 'recipient', 'attempts', 'created_at', 'error'],
    rows: async () => (await prisma.workflowOutbox.findMany({
      where: { processedAt: null, attempts: { gte: OUTBOX_MAX_ATTEMPTS } }, orderBy: { createdAt: 'asc' }, take: EXPORT_ROW_LIMIT + 1,
      select: { id: true, kind: true, attempts: true, createdAt: true, lastError: true, payload: true },
    })).map(m => [m.id, m.kind, maskEmail((m.payload as any)?.recipientEmail), m.attempts, m.createdAt, sanitizeProviderError(m.lastError)]),
  },
  backups: {
    title: 'Backup and restore status', columns: ['run_key', 'kind', 'status', 'started_at', 'finished_at', 'size_bytes', 'encrypted', 'manifest_verified', 'missing_objects', 'error'],
    rows: async (_q, from, to) => (await prisma.backupRun.findMany({ where: { reportedAt: { gte: from, lte: to } }, orderBy: { reportedAt: 'asc' }, take: EXPORT_ROW_LIMIT + 1 }))
      .map(b => [b.runKey, b.kind, b.status, b.startedAt, b.finishedAt, b.sizeBytes === null ? null : Number(b.sizeBytes), b.encrypted, b.manifestVerified, b.missingObjects, b.error]),
  },
};

export async function exportReport(req: Request, res: Response) {
  const type = String(req.params.type || '');
  const def = REPORTS[type];
  if (!def) { sendBadRequest(res, `Unknown report. Available: ${Object.keys(REPORTS).join(', ')}.`, 'UNKNOWN_REPORT'); return; }
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(to.getTime() - 30 * 86_400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) { sendBadRequest(res, 'Invalid date range.', 'INVALID_RANGE'); return; }
  const rows = await def.rows(req.query, from, to);
  if (rows.length > EXPORT_ROW_LIMIT) {
    sendBadRequest(res, `More than ${EXPORT_ROW_LIMIT} rows. Narrow the date range or filters.`, 'EXPORT_TOO_LARGE'); return;
  }
  const body = [def.columns.join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n');
  const checksum = crypto.createHash('sha256').update(body).digest('hex');
  const filters = Object.fromEntries(Object.entries(req.query).filter(([k]) => ['role', 'status', 'from', 'to'].includes(k)));
  const header = [
    `# ${def.title}`,
    `# exported_at=${new Date().toISOString()} exported_by=${req.user!.email}`,
    `# range=${from.toISOString()}..${to.toISOString()} filters=${JSON.stringify(filters)}`,
    `# rows=${rows.length} sha256(body)=${checksum}`,
  ].join('\n');
  await audit(req, 'OPERATIONAL_REPORT_EXPORTED', {
    category: AuditCategory.REPORTS_EXPORTS, severity: rows.length > 1000 ? AuditSeverity.WARNING : AuditSeverity.NOTICE,
    targetReference: type, details: { report: type, rows: rows.length, checksum, filters, from, to },
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="digital201-${type}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Export-Checksum', checksum);
  res.setHeader('X-Export-Rows', String(rows.length));
  res.send(`${header}\n${body}\n`);
}
