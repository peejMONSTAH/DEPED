import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getTransactions, createTransaction, getTransactionById, getMyTransactions,
  submitTransaction, validateTransaction, approveTransaction,
  getTransactionRequirements, streamTransactions,
} from '../controllers/transactions.controller';
import { uploadDocument } from '../controllers/documents.controller';
import multer from 'multer';
import path from 'path';
import { config } from '../config';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: config.documents.maxSizeBytes },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg'];
    const isMimeAllowed = config.documents.allowedMimeTypes.includes(file.mimetype);
    const isExtAllowed = allowedExts.includes(ext);

    if (isMimeAllowed && isExtAllowed) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Strict policy: Only PDF, PNG, and JPEG files (.pdf, .png, .jpg, .jpeg) are allowed for transaction document uploads.'));
    }
  },
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
router.post('/:id/documents', upload.single('file'), uploadDocument);
router.post('/:id/upload', upload.single('file'), uploadDocument);
router.post('/:id/validate', authorize('AO_II', 'SYSTEM_ADMIN'), validateTransaction);
router.post('/:id/approve', authorize('HRMO', 'SYSTEM_ADMIN'), approveTransaction);
router.get('/:id/requirements', getTransactionRequirements);

export default router;
