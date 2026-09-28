import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getDashboardSummary, getSystemOperations } from '../controllers/dashboard.controller';

const router = Router();
router.get('/', authenticate, authorize('SYSTEM_ADMIN', 'AO_II', 'HRMO'), getDashboardSummary);
router.get('/system-operations', authenticate, authorize('SYSTEM_ADMIN'), getSystemOperations);
export default router;
