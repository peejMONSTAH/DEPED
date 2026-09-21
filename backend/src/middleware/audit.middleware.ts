import { Request, Response, NextFunction } from 'express';
import { recordAuditLog, sanitizeAuditDetails } from '../utils/audit.util';
import { verifyAccessToken } from '../utils/jwt.util';
import { logger } from '../utils/logger';

const IGNORED_PATHS = [
  '/health',
  '/ready',
  '/api/v1/notifications/stream',
  '/api/v1/notifications/unread',
  '/api/v1/audit-logs',
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

  if (!isMutating && !isSensitiveRead) {
    return next();
  }

  res.on('finish', () => {
    try {
      if (res.locals.auditLogged) {
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
        req.params.id ||
        req.params.documentId ||
        req.params.transactionId ||
        req.params.personnelId ||
        req.params.userId ||
        req.params.cycleId ||
        segments.find(s => /^\d+$/.test(s));

      if (possibleId && !isNaN(Number(possibleId))) {
        entityId = Number(possibleId);
      }

      // Generate recognizable action names for standard operations
      if (cleanPath.includes('documents') && (cleanPath.includes('/file') || cleanPath.includes('/download'))) {
        action = 'DOCUMENT_ACCESSED';
        entityType = 'Document';
      } else if (cleanPath.includes('promotions/cycles') && cleanPath.endsWith('/apply')) {
        action = 'PROMOTION_APPLICATION_SUBMITTED';
        entityType = 'PromotionCycle';
      } else if (cleanPath.includes('/initial-rating')) {
        action = 'PROMOTION_INITIAL_RATING_SUBMITTED';
        entityType = 'PromotionApplication';
      } else if (cleanPath.includes('/final-rating')) {
        action = 'PROMOTION_FINAL_RATING_SUBMITTED';
        entityType = 'PromotionApplication';
      } else if (cleanPath.includes('/select-promotion')) {
        action = 'PROMOTION_CANDIDATE_SELECTED';
        entityType = 'PromotionApplication';
      } else if (cleanPath.includes('/generate-ranking')) {
        action = 'PROMOTION_RANKING_GENERATED';
        entityType = 'PromotionCycle';
      } else if (cleanPath.includes('/car-document') || cleanPath.includes('/generate-document')) {
        action = 'CAR_DOCUMENT_GENERATED';
        entityType = 'PromotionCycle';
      } else if (cleanPath.includes('/manual-application')) {
        action = 'PROMOTION_MANUAL_APPLICATION';
        entityType = 'PromotionCycle';
      } else if (cleanPath.startsWith('forms/transactions')) {
        action = 'FORM_DRAFT_SAVED';
        entityType = 'FormDraft';
      } else if (cleanPath.startsWith('notifications')) {
        action = 'NOTIFICATION_STATUS_UPDATED';
        entityType = 'Notification';
      } else if (cleanPath.startsWith('personnel') && req.method === 'PUT') {
        action = '201_FILE_UPDATED';
        entityType = 'Personnel';
      } else {
        const lastMeaningfulPart = [...segments].reverse().find(s => !/^\d+$/.test(s)) || req.method;
        action = `${rootResource}_${lastMeaningfulPart.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
      }

      const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || req.socket?.remoteAddress || null;
      const userAgent = (req.headers['user-agent'] as string) || null;
      const status = res.statusCode < 400 ? 'SUCCESS' : 'FAILED';

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

      recordAuditLog({
        userId,
        action,
        entityType,
        entityId,
        details: detailsPayload,
        ipAddress: typeof clientIp === 'string' ? clientIp.split(',')[0].trim() : null,
        userAgent,
        status,
      }).catch(err => logger.error({ err }, '[AuditMiddleware] Error logging event'));
    } catch (err) {
      logger.error({ err: err }, '[AuditMiddleware] Unexpected error in finish handler');
    }
  });

  next();
};
