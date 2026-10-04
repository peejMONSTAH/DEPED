import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { personnelDocumentUpload } from '../middleware/personnel-document-upload.middleware';
import { csvUpload } from '../middleware/csv-upload.middleware';
import { getImportTemplate, previewPersonnelImport, runPersonnelImport } from '../controllers/personnel-import.controller';
import {
  getUsers, createUser, getUserById, updateUser, deleteUser, distributeCredentials, getAccountOnboarding, resendInvitation, resetUserPassword,
  extractAccountRequestPds, submitAccountRequest, getAccountRequests, approveAccountRequest, rejectAccountRequest,
} from '../controllers/users.controller';
import { newHiringEnabled } from '../utils/new-hiring.util';
import { handOverSeat, seatHandoverCandidates, seatHandoverOptions } from '../controllers/seat-handover.controller';
import { hrDirectEnabled } from '../utils/review-lane.util';
import { sendSuccess } from '../utils/response.util';

const router = Router();

// All user routes require authentication
router.use(authenticate);

// Bulk-adding people from an HR file. HRMO and System Administrator only; defined before '/:id'.
router.get('/import/template', authorize('SYSTEM_ADMIN', 'HRMO'), getImportTemplate);
router.post('/import/preview', authorize('SYSTEM_ADMIN', 'HRMO'), csvUpload.single('file'), previewPersonnelImport);
router.post('/import', authorize('SYSTEM_ADMIN', 'HRMO'), csvUpload.single('file'), runPersonnelImport);
router.get('/requests', authorize('SYSTEM_ADMIN', 'AO_II', 'HRMO'), getAccountRequests);

// Which optional workflow features are on, so the app shows only controls that work. Any signed-in user.
router.get('/workflow-features', (_req, res) => { sendSuccess(res, { hrDirectReview: hrDirectEnabled(), newHiring: newHiringEnabled() }); });

// Handing an AO II or HRMO seat to someone else (e.g. after a promotion). Defined before '/:id'.
router.get('/seat-handover/options', authorize('SYSTEM_ADMIN', 'HRMO'), seatHandoverOptions);
router.get('/seat-handover/candidates', authorize('SYSTEM_ADMIN', 'HRMO'), seatHandoverCandidates);
router.post('/seat-handover', authorize('SYSTEM_ADMIN', 'HRMO'), handOverSeat);
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
router.get('/:id/onboarding', authorize('AO_II', 'HRMO', 'SYSTEM_ADMIN'), getAccountOnboarding);
router.post('/:id/resend-invitation', authorize('AO_II', 'HRMO', 'SYSTEM_ADMIN'), resendInvitation);
router.post('/:id/reset-password', authorize('SYSTEM_ADMIN', 'HRMO'), resetUserPassword);

export default router;
