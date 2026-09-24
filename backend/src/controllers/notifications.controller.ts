import { Request, Response } from 'express';
import { EventEmitter } from 'events';
import prisma from '../config/prisma';
import { sendSuccess, getPaginationParams, buildPaginationMeta } from '../utils/response.util';
import { logger } from '../utils/logger';

export const notificationEvents = new EventEmitter();

export const notifyUserNotifications = (userIds: number | number[]) => {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  notificationEvents.emit('notification', { userIds: ids, timestamp: Date.now() });
};

/**
 * GET /notifications/stream — Real-time Server-Sent Events (SSE) stream for user notifications
 */
export const streamNotifications = (req: Request, res: Response): void => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const userId = req.user!.userId;

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);

  const onNotification = (data: any) => {
    if (data.userIds && data.userIds.includes(userId)) {
      res.write(`data: ${JSON.stringify({ type: 'NOTIFICATION', timestamp: Date.now() })}\n\n`);
    }
  };

  notificationEvents.on('notification', onNotification);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    notificationEvents.off('notification', onNotification);
    clearInterval(heartbeat);
  });
};

/**
 * Stable deep-link ids for promotion notifications. Only ids are added, never
 * record contents: the Promotions page re-fetches both through its own
 * station-scoped endpoints, so a link grants no access by itself. Rows written
 * before application-level notifications keep working as cycle-only links.
 */
export const withPromotionTargets = async <T extends { relatedEntityId: number | null; relatedEntityType: string | null }>(
  rows: T[],
): Promise<Array<T & { promotionCycleId?: number; promotionApplicationId?: number }>> => {
  const appIds = [...new Set(rows
    .filter(n => n.relatedEntityType === 'PromotionApplication' && n.relatedEntityId)
    .map(n => n.relatedEntityId as number))];
  const cycleByApp = new Map<number, number>();
  if (appIds.length > 0) {
    const apps = await prisma.promotionApplication.findMany({
      where: { id: { in: appIds } },
      select: { id: true, promotionCycleId: true },
    });
    apps.forEach(a => cycleByApp.set(a.id, a.promotionCycleId));
  }
  return rows.map(n => {
    if (n.relatedEntityType === 'PromotionCycle' && n.relatedEntityId) {
      return { ...n, promotionCycleId: n.relatedEntityId };
    }
    if (n.relatedEntityType === 'PromotionApplication' && n.relatedEntityId) {
      const promotionCycleId = cycleByApp.get(n.relatedEntityId);
      // A deleted application still links, and the page reports it missing.
      return { ...n, promotionApplicationId: n.relatedEntityId, ...(promotionCycleId ? { promotionCycleId } : {}) };
    }
    return n;
  });
};

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query as Record<string, unknown>);
    const { status } = req.query;
    const isSysAdmin = req.user?.role === 'SYSTEM_ADMIN';

    const where: any = { userId: req.user!.userId };
    if (status === 'unread') where.isRead = false;
    if (status === 'read') where.isRead = true;

    // Strict Role Separation: System Administrators only receive System Admin related items
    // (Account Creation Requests, User Credentials, Password Resets, System Logs),
    // strictly excluding Promotion Cycles, Applications, and 201 Transactions.
    if (isSysAdmin) {
      where.NOT = [
        { relatedEntityType: { in: ['PromotionCycle', 'PromotionApplication', 'Transaction'] } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.notification.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.notification.count({ where }),
    ]);
    sendSuccess(res, await withPromotionTargets(data), undefined, 200, buildPaginationMeta(page, limit, total));
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to get notifications');
    res.status(500).json({ status: 'error', message: 'Failed to retrieve notifications.' });
  }
};

export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ status: 'error', message: 'Invalid notification ID.' });
      return;
    }

    await prisma.notification.updateMany({
      where: { id, userId: req.user!.userId },
      data: { isRead: true },
    });
    sendSuccess(res, { id, isRead: true }, 'Notification marked as read.');
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to mark notification as read');
    res.status(500).json({ status: 'error', message: 'Failed to mark notification as read.' });
  }
};

export const markAllRead = async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, isRead: false },
      data: { isRead: true },
    });
    sendSuccess(res, null, 'All notifications marked as read.');
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to mark all notifications as read');
    res.status(500).json({ status: 'error', message: 'Failed to mark notifications as read.' });
  }
};
