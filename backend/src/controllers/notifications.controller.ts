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
    sendSuccess(res, data, undefined, 200, buildPaginationMeta(page, limit, total));
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
