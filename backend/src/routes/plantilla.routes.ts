import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getPlantillaItems,
  getAvailablePlantillaItems,
  createPlantillaItem,
  updatePlantillaItem,
  deletePlantillaItem,
  assignPersonnelToPlantilla,
} from '../controllers/plantilla.controller';

const router = Router();
router.use(authenticate);

// Public / Personnel View: Available items open for ranking and application
router.get('/available', getAvailablePlantillaItems);

// Admin & Staff Management - Exclusive to HRMO & SYSTEM_ADMIN (reports)
router.get('/', authorize('HRMO', 'SYSTEM_ADMIN'), getPlantillaItems);
router.post('/', authorize('HRMO'), createPlantillaItem);
router.put('/:id', authorize('HRMO'), updatePlantillaItem);
router.delete('/:id', authorize('HRMO'), deletePlantillaItem);
router.post('/:id/assign', authorize('HRMO'), assignPersonnelToPlantilla);

export default router;
