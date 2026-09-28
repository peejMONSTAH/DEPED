import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { getNotifications, markAsRead, markAsUnread, markAllRead, streamNotifications } from '../controllers/notifications.controller';

const router = Router();
router.use(authenticate);

router.get('/stream', streamNotifications);
router.get('/', getNotifications);
router.put('/:id/read', markAsRead);
router.put('/:id/unread', markAsUnread);
router.put('/read-all', markAllRead);

export default router;
