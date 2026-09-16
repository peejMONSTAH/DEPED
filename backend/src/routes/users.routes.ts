import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getUsers, createUser, getUserById, updateUser, deleteUser, distributeCredentials, resetUserPassword,
  submitAccountRequest, getAccountRequests, approveAccountRequest, rejectAccountRequest,
} from '../controllers/users.controller';

const router = Router();

// All user routes require authentication
router.use(authenticate);

router.get('/requests', authorize('SYSTEM_ADMIN', 'AO_II', 'HRMO'), getAccountRequests);
router.post('/requests', authorize('AO_II', 'HRMO', 'SYSTEM_ADMIN'), submitAccountRequest);
router.post('/requests/:id/approve', authorize('SYSTEM_ADMIN', 'HRMO'), approveAccountRequest);
router.post('/requests/:id/reject', authorize('SYSTEM_ADMIN', 'HRMO'), rejectAccountRequest);

router.get('/', authorize('SYSTEM_ADMIN', 'AO_II', 'HRMO'), getUsers);
router.post('/', authorize('SYSTEM_ADMIN', 'HRMO'), createUser);
router.get('/:id', authorize('SYSTEM_ADMIN', 'AO_II', 'HRMO'), getUserById);
router.put('/:id', authorize('SYSTEM_ADMIN', 'HRMO'), updateUser);
router.delete('/:id', authorize('SYSTEM_ADMIN', 'HRMO'), deleteUser);
router.post('/:id/distribute-credentials', authorize('AO_II', 'HRMO', 'SYSTEM_ADMIN'), distributeCredentials);
router.post('/:id/reset-password', authorize('SYSTEM_ADMIN', 'HRMO'), resetUserPassword);

export default router;
