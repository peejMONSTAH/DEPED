import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { personnelDocumentUpload } from '../middleware/personnel-document-upload.middleware';
import {
  getUsers, createUser, getUserById, updateUser, deleteUser, distributeCredentials, resetUserPassword,
  extractAccountRequestPds, submitAccountRequest, getAccountRequests, approveAccountRequest, rejectAccountRequest,
} from '../controllers/users.controller';

const router = Router();

// All user routes require authentication
router.use(authenticate);

router.get('/requests', authorize('SYSTEM_ADMIN', 'AO_II', 'HRMO'), getAccountRequests);
router.post('/requests/extract-pds', authorize('AO_II', 'HRMO', 'SYSTEM_ADMIN'), personnelDocumentUpload.single('pdsFile'), extractAccountRequestPds);
router.post('/requests', authorize('AO_II', 'HRMO', 'SYSTEM_ADMIN'), personnelDocumentUpload.single('pdsFile'), submitAccountRequest);
// Requests are reviewed by the System Administrator, who receives their notifications.
router.post('/requests/:id/approve', authorize('SYSTEM_ADMIN'), approveAccountRequest);
router.post('/requests/:id/reject', authorize('SYSTEM_ADMIN'), rejectAccountRequest);

router.get('/', authorize('SYSTEM_ADMIN', 'AO_II', 'HRMO'), getUsers);
router.post('/', authorize('SYSTEM_ADMIN', 'HRMO'), createUser);
router.get('/:id', authorize('SYSTEM_ADMIN', 'AO_II', 'HRMO'), getUserById);
router.put('/:id', authorize('SYSTEM_ADMIN', 'HRMO'), updateUser);
router.delete('/:id', authorize('SYSTEM_ADMIN', 'HRMO'), deleteUser);
router.post('/:id/distribute-credentials', authorize('AO_II', 'HRMO', 'SYSTEM_ADMIN'), distributeCredentials);
router.post('/:id/reset-password', authorize('SYSTEM_ADMIN', 'HRMO'), resetUserPassword);

export default router;
