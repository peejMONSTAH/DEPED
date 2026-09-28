import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  exportReport, getBackups, getHealth, listDevices, listOutbox, listSessions, reportBackupRun,
  requireDeviceVerification, retryOutbox, revokeAccountSessions, revokeDevice, revokeSession,
} from '../controllers/system-admin.controller';

/**
 * System Administration API. authenticate() already refuses inactive or locked
 * accounts and any request but change-password while a password change is due;
 * authorize('SYSTEM_ADMIN') limits every route to System Administrators. None
 * of these routes can validate, approve, rate, rank or select anything.
 */
const router = Router();

// Machine-to-machine: the backup job reports its result with BACKUP_REPORT_TOKEN.
router.post('/operations/backups/report', reportBackupRun);

router.use(authenticate, authorize('SYSTEM_ADMIN'));

router.get('/sessions', listSessions);
router.delete('/sessions/:id', revokeSession);
router.delete('/accounts/:id/sessions', revokeAccountSessions);
router.get('/devices', listDevices);
router.delete('/devices/:id', revokeDevice);
router.post('/accounts/:id/require-device-verification', requireDeviceVerification);

router.get('/operations/health', getHealth);
router.get('/operations/email', listOutbox);
router.post('/operations/email/:id/retry', retryOutbox);
router.get('/operations/backups', getBackups);

router.get('/reports/:type/export', exportReport);

export default router;
