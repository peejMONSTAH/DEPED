import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getDashboardSummary } from '../controllers/dashboard.controller';

const router = Router();
router.get('/', authenticate, authorize('SYSTEM_ADMIN', 'AO_II', 'HRMO'), getDashboardSummary);
export default router;
