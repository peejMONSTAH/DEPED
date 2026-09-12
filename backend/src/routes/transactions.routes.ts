import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getTransactions, createTransaction, getTransactionById, getMyTransactions,
  submitTransaction, validateTransaction, approveTransaction,
  getTransactionRequirements, streamTransactions, demoAutoUploadDocuments,
} from '../controllers/transactions.controller';
import { uploadDocument } from '../controllers/documents.controller';
import multer from 'multer';
import { config } from '../config';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: config.documents.maxSizeBytes },
});

const router = Router();

router.use(authenticate);

// Real-time SSE stream for live transaction state broadcasting (Authenticated)
router.get('/stream', streamTransactions);

router.get('/my-transactions', getMyTransactions);
router.get('/', getTransactions);
router.post('/', createTransaction);
router.get('/:id', getTransactionById);
router.post('/:id/submit', submitTransaction);
router.put('/:id/submit', submitTransaction);
router.post('/:id/demo-upload', demoAutoUploadDocuments);
router.post('/:id/documents', upload.single('file'), uploadDocument);
router.post('/:id/upload', upload.single('file'), uploadDocument);
router.post('/:id/validate', authorize('AO_II', 'SYSTEM_ADMIN'), validateTransaction);
router.post('/:id/approve', authorize('HRMO', 'SYSTEM_ADMIN'), approveTransaction);
router.get('/:id/requirements', getTransactionRequirements);

export default router;
