import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getAuditLogs, getComplianceReport, getDemographicsReport } from '../controllers/audit.controller';

const router = Router();
router.use(authenticate);

router.get('/audit-logs', authorize('SYSTEM_ADMIN', 'HRMO', 'AO_II'), getAuditLogs);
router.get('/reports/compliance-summary', authorize('SYSTEM_ADMIN'), getComplianceReport);
router.get('/reports/personnel-demographics', authorize('SYSTEM_ADMIN'), getDemographicsReport);

export default router;
