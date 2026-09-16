import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getMyProfile, updateMyProfile, getPersonnelById, getAllPersonnel, updatePersonnelById,
  getMyServiceRecord, getPersonnelServiceRecord,
} from '../controllers/personnel.controller';

const router = Router();
router.use(authenticate);

router.get('/me', getMyProfile);
router.get('/profile', getMyProfile);
router.get('/me/service-record', getMyServiceRecord);
router.get('/service-records', getMyServiceRecord);
router.put('/me', updateMyProfile);
router.put('/profile', updateMyProfile);
router.get('/', authorize('AO_II', 'HRMO'), getAllPersonnel);
router.get('/:id', authorize('AO_II', 'HRMO'), getPersonnelById);
router.get('/:id/service-record', authorize('AO_II', 'HRMO'), getPersonnelServiceRecord);
router.put('/:id', authorize('AO_II', 'HRMO'), updatePersonnelById);

export default router;
