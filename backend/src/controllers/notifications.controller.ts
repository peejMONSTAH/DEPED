import { Request, Response } from 'express';
import { EventEmitter } from 'events';
import prisma from '../config/prisma';
import { sendSuccess, getPaginationParams, buildPaginationMeta } from '../utils/response.util';
import { logger } from '../utils/logger';
import { plainNotificationText } from '../utils/notification-text.util';
import { hrDirectEnabled } from '../utils/review-lane.util';
import { fallbackApprovalIds } from '../utils/transaction-review.util';

export const notificationEvents = new EventEmitter();
// One listener per open stream; the default cap of 10 would warn with a normal pilot.
notificationEvents.setMaxListeners(0);

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

/**
 * Marks notices whose requested action is already done (a returned transaction
 * that was resubmitted, a request someone already approved). History is kept;
 * the notice just stops asking for action. null = informational, not an action.
 */
/** Where the notice should open, decided by the server from the record's state and the viewer's real role. */
export interface ActionTarget { path: string; label: string; badge: string; kind: 'own' | 'review' | 'fallback' | 'view' }

export interface ActionViewer { userId?: number; /** The account's own role, never the view it is currently in. */ role?: string; personnelId?: number | null }

export const withActionState = async <T extends { relatedEntityId: number | null; relatedEntityType: string | null; type: string }>(
  rows: T[], viewer: ActionViewer | string | undefined,
): Promise<Array<T & { actionResolved: boolean | null; actionTarget?: ActionTarget }>> => {
  const v: ActionViewer = typeof viewer === 'string' ? { role: viewer } : (viewer ?? {});
  const role = v.role;
  const ids = (type: string) => [...new Set(rows.filter(n => n.relatedEntityType === type && n.relatedEntityId).map(n => n.relatedEntityId as number))];
  const txIds = [...new Set([...ids('Transaction'), ...ids('ApprovalFallback')])];
  const [txs, reqs, apps, fallbackIds] = await Promise.all([
    txIds.length ? prisma.transaction.findMany({ where: { id: { in: txIds } }, select: { id: true, status: true, personnelId: true, uploadedDocuments: { select: { validatedByUserId: true, status: true, requirementTemplateId: true } } } }) : [],
    ids('AccountCreationRequest').length ? prisma.accountCreationRequest.findMany({ where: { id: { in: ids('AccountCreationRequest') } }, select: { id: true, status: true } }) : [],
    ids('PromotionApplication').length ? prisma.promotionApplication.findMany({ where: { id: { in: ids('PromotionApplication') } }, select: { id: true, status: true, personnelId: true, scoreDetailsJson: true } }) : [],
    ids('ApprovalFallback').length ? fallbackApprovalIds() : Promise.resolve([] as number[]),
  ]);
  const tx = new Map(txs.map(t => [t.id, t]));
  const rq = new Map(reqs.map(r => [r.id, r.status as string]));
  const ap = new Map(apps.map(a => [a.id, a]));
  const fallback = new Set(fallbackIds);
  return rows.map(n => {
    let resolved: boolean | null = null;
    let target: ActionTarget | undefined;
    const id = n.relatedEntityId;
    if (id && n.type !== 'SUCCESS') {
      if (n.relatedEntityType === 'ApprovalFallback' && tx.has(id)) {
        // Actionable only while the file still waits and no HRMO can approve it.
        resolved = !(tx.get(id)!.status === 'FOR_APPROVAL' && fallback.has(id));
        target = { path: `/admin/dashboard?fallback=${id}#fallback`, label: 'Give fallback approval', badge: 'Fallback approval', kind: 'fallback' };
      } else if (n.relatedEntityType === 'Transaction' && tx.has(id)) {
        const t = tx.get(id)!;
        // The viewer's own file: they are the applicant. Anyone else's: they are a reviewer, whatever view they are in.
        const own = Boolean(v.personnelId && t.personnelId === v.personnelId);
        if (own || !role || !['AO_II', 'HRMO'].includes(role)) {
          resolved = !['DEFICIENCY', 'DRAFT'].includes(t.status);
          // A returned file opens on the first requirement that needs replacing.
          const returnedRequirement = t.status === 'DEFICIENCY' ? t.uploadedDocuments.find(d => d.status === 'REJECTED')?.requirementTemplateId : null;
          target = { path: `/personnel/checklist?txId=${id}${returnedRequirement ? `&requirement=${returnedRequirement}` : ''}`, label: resolved ? 'Open my application' : 'Fix and resubmit', badge: 'My application', kind: 'own' };
        } else if (role === 'AO_II') {
          resolved = t.status !== 'PENDING_VALIDATION';
          target = t.status === 'PENDING_VALIDATION'
            ? { path: `/admin/documents?txId=${id}`, label: 'Review documents', badge: 'Validation needed', kind: 'review' }
            : { path: `/admin/transactions/${id}`, label: 'View transaction', badge: 'Transaction', kind: 'view' };
        } else {
          // HRMO validates in its own lane and approves what another reviewer validated; a validator has nothing left on it.
          const validatedByMe = Boolean(v.userId && t.uploadedDocuments.some(d => d.validatedByUserId === v.userId));
          resolved = !(t.status === 'PENDING_VALIDATION' || (t.status === 'FOR_APPROVAL' && !(hrDirectEnabled() && validatedByMe)));
          target = t.status === 'PENDING_VALIDATION'
            ? { path: `/admin/documents?txId=${id}`, label: 'Review documents', badge: 'Validation needed', kind: 'review' }
            : t.status === 'FOR_APPROVAL' && !(hrDirectEnabled() && validatedByMe)
              ? { path: `/admin/approvals?txId=${id}`, label: 'Review for final approval', badge: 'Final approval needed', kind: 'review' }
              : { path: `/admin/transactions/${id}`, label: 'View transaction', badge: 'Transaction', kind: 'view' };
        }
      } else if (n.relatedEntityType === 'AccountCreationRequest' && rq.has(id)) resolved = rq.get(id) !== 'PENDING';
      else if (n.relatedEntityType === 'PromotionApplication' && ap.has(id)) {
        const a = ap.get(id)!; const stage = (a.scoreDetailsJson as any)?.stageStatus;
        const own = Boolean(v.personnelId && a.personnelId === v.personnelId);
        const deficientForApplicant = !(stage === 'REQUIREMENTS_DEFICIENT' && a.status === 'UNDER_REVIEW');
        // Requirements are open for a reviewer until someone checks them (submitted or resubmitted).
        const openForReviewer = a.status === 'SUBMITTED';
        resolved = own ? deficientForApplicant
          : role === 'AO_II' || role === 'HRMO' ? !openForReviewer
          : ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'].includes(role || '') ? deficientForApplicant : null;
      }
    }
    return { ...n, actionResolved: resolved, ...(target ? { actionTarget: target } : {}) };
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
    const clean = data.map(n => ({ ...n, message: plainNotificationText(n.message) }));
    // Action state follows the account's own role: an HRMO in personnel view still owes the reviews they were notified about.
    const viewer = { userId: req.user!.userId, role: req.user?.baseRole ?? req.user?.role, personnelId: req.user?.personnelId };
    sendSuccess(res, await withActionState(await withPromotionTargets(clean), viewer), undefined, 200, buildPaginationMeta(page, limit, total));
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

export const markAsUnread = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ status: 'error', message: 'Invalid notification ID.' });
      return;
    }

    await prisma.notification.updateMany({
      where: { id, userId: req.user!.userId },
      data: { isRead: false },
    });
    sendSuccess(res, { id, isRead: false }, 'Notification marked as unread.');
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to mark notification as unread');
    res.status(500).json({ status: 'error', message: 'Failed to mark notification as unread.' });
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
