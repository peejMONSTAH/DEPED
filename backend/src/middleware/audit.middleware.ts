import { Request, Response, NextFunction } from 'express';
import { recordAuditLog, sanitizeAuditDetails } from '../utils/audit.util';
import { verifyAccessToken } from '../utils/jwt.util';
import { logger } from '../utils/logger';
import { ClientSource, AuditOutcome, AuditSeverity, AuditCategory } from '../types/audit.types';
import { isPhoneApp } from '../services/session.service';

const IGNORED_PATHS = [
  '/health',
  '/ready',
  '/api/v1/notifications/stream',
  '/api/v1/notifications/unread',
  '/api/v1/audit-logs',
  '/api/v1/forms/transactions/draft',
  '/api/v1/auth/me',
];

export const auditMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const rawPath = req.originalUrl || req.path || '';
  if (IGNORED_PATHS.some(p => rawPath.startsWith(p))) {
    return next();
  }

  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const isSensitiveRead = req.method === 'GET' && (
    rawPath.includes('/file') ||
    rawPath.includes('/download') ||
    rawPath.includes('/service-record') ||
    rawPath.includes('/car-document')
  );

  // Allow next for non-mutating, non-sensitive reads unless response ends with 401/403
  res.on('finish', () => {
    try {
      if (res.locals?.auditLogged) {
        return;
      }

      const isDenied = res.statusCode === 401 || res.statusCode === 403;
      if (!isMutating && !isSensitiveRead && !isDenied) {
        return;
      }

      let userId = req.user?.userId;
      if (!userId && req.headers.authorization?.startsWith('Bearer ')) {
        try {
          const token = req.headers.authorization.split(' ')[1];
          const payload = verifyAccessToken(token);
          userId = payload.userId;
        } catch (_) {}
      }

      if (!userId || userId <= 0) {
        return;
      }

      // Infer clean action and entity
      const cleanPath = rawPath.split('?')[0].replace(/^\/api\/v1\//, '');
      const segments = cleanPath.split('/').filter(Boolean);
      const rootResource = (segments[0] || 'SYSTEM').toUpperCase();

      let action = `HTTP_${req.method}_${rootResource}`;
      let entityType = rootResource.charAt(0) + rootResource.slice(1).toLowerCase();
      let entityId = 0;

      // Extract entityId if present in route params or path segments
      const possibleId =
        req.params?.id ||
        req.params?.documentId ||
        req.params?.transactionId ||
        req.params?.personnelId ||
        req.params?.userId ||
        req.params?.cycleId ||
        segments.find(s => /^\d+$/.test(s));

      if (possibleId && !isNaN(Number(possibleId))) {
        entityId = Number(possibleId);
      }

      let category = undefined;
      let severity = undefined;
      let actionLabel = undefined;

      // Classify specific security actions
      if (isDenied) {
        action = 'ACCESS_DENIED';
        actionLabel = 'Unauthorized access attempt denied';
        category = AuditCategory.ROLES_PERMISSIONS;
        severity = AuditSeverity.HIGH;
      } else if (cleanPath.includes('documents') && (cleanPath.includes('/file') || cleanPath.includes('/download'))) {
        action = 'DOCUMENT_ACCESSED';
        entityType = 'Document';
        actionLabel = 'Document viewed or downloaded';
        category = AuditCategory.SENSITIVE_RECORD_ACCESS;
      } else if (cleanPath.includes('/service-record')) {
        entityType = 'Personnel';
        if (cleanPath.includes('/me/service-record') || cleanPath.endsWith('/service-records')) {
          action = 'SERVICE_RECORD_VIEWED';
          actionLabel = 'Personnel viewed own service record';
          category = AuditCategory.SENSITIVE_RECORD_ACCESS;
        } else {
          action = 'SERVICE_RECORD_ACCESSED_BY_OFFICER';
          actionLabel = 'Officer inspected personnel service record';
          category = AuditCategory.SENSITIVE_RECORD_ACCESS;
          severity = AuditSeverity.NOTICE;
        }
      } else if (cleanPath.includes('promotions/cycles') && cleanPath.endsWith('/apply')) {
        action = 'PROMOTION_APPLICATION_SUBMITTED';
        entityType = 'PromotionCycle';
        actionLabel = 'Promotion application submitted';
      } else if (cleanPath.includes('/initial-rating')) {
        action = 'PROMOTION_INITIAL_RATING_SUBMITTED';
        entityType = 'PromotionApplication';
      } else if (cleanPath.includes('/final-rating')) {
        action = 'PROMOTION_FINAL_RATING_SUBMITTED';
        entityType = 'PromotionApplication';
      } else if (cleanPath.includes('/select-promotion')) {
        action = 'PROMOTION_CANDIDATE_SELECTED';
        entityType = 'PromotionApplication';
        severity = AuditSeverity.HIGH;
      } else if (cleanPath.includes('/generate-ranking')) {
        action = 'PROMOTION_RANKING_GENERATED';
        entityType = 'PromotionCycle';
      } else if (cleanPath.includes('/car-document') || cleanPath.includes('/generate-document')) {
        action = 'CAR_DOCUMENT_GENERATED';
        entityType = 'PromotionCycle';
      } else if (cleanPath.includes('/manual-application')) {
        action = 'PROMOTION_MANUAL_APPLICATION';
        entityType = 'PromotionCycle';
      } else if (cleanPath.startsWith('personnel') && req.method === 'PUT') {
        action = '201_FILE_UPDATED';
        entityType = 'Personnel';
      } else {
        const lastMeaningfulPart = [...segments].reverse().find(s => !/^\d+$/.test(s)) || req.method;
        action = `${rootResource}_${lastMeaningfulPart.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
      }

      const clientIp = req.ip || req.socket?.remoteAddress || null;
      const userAgent = (req.headers['user-agent'] as string) || null;
      const status = res.statusCode < 400 ? 'SUCCESS' : 'FAILED';
      const outcome = isDenied ? AuditOutcome.DENIED : res.statusCode < 400 ? AuditOutcome.SUCCESS : AuditOutcome.FAILURE;

      const detailsPayload: Record<string, any> = {
        method: req.method,
        path: rawPath,
        statusCode: res.statusCode,
      };

      if (req.params && Object.keys(req.params).length > 0) {
        detailsPayload.params = req.params;
      }
      if (req.query && Object.keys(req.query).length > 0) {
        detailsPayload.query = req.query;
      }
      if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        detailsPayload.body = sanitizeAuditDetails(req.body);
      }

      const requestId = (req as any).id || (req.headers['x-request-id'] as string) || null;
      const clientSource = isPhoneApp(req) ? ClientSource.MOBILE : ClientSource.WEB;

      recordAuditLog({
        userId,
        action,
        actionLabel,
        category,
        severity,
        outcome,
        entityType,
        entityId,
        details: detailsPayload,
        ipAddress: typeof clientIp === 'string' ? clientIp.split(',')[0].trim() : null,
        userAgent,
        status,
        requestId,
        clientSource,
      }).catch(err => logger.error({ err }, '[AuditMiddleware] Error logging event'));
    } catch (err) {
      logger.error({ err: err }, '[AuditMiddleware] Unexpected error in finish handler');
    }
  });

  next();
};
