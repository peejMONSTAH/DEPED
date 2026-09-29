import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { uploadDocument, getDocument, downloadDocumentFile, getExtractionReview, confirmExtractionReview, getDocumentViewToken } from '../controllers/documents.controller';
import { precheckTransactionDocument } from '../controllers/document-precheck.controller';
import multer from 'multer';
import { unsupportedUploadError } from '../utils/upload-errors.util';
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
      cb(unsupportedUploadError(config.documents.maxSizeBytes));
    }
  },
});

const router = Router();
router.use(authenticate);

// Transaction-scoped document upload (supports both /documents and /upload)
router.post('/transactions/:transactionId/documents', authorize('TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL', 'AO_II', 'SYSTEM_ADMIN'), upload.single('file'), uploadDocument);
router.post('/transactions/:transactionId/upload', authorize('TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL', 'AO_II', 'SYSTEM_ADMIN'), upload.single('file'), uploadDocument);

// Standalone document routes
router.get('/:documentId/view-token', getDocumentViewToken);
router.get('/:documentId/file', downloadDocumentFile);
router.get('/:documentId/download', downloadDocumentFile);
router.get('/:documentId/precheck', authorize('AO_II', 'HRMO', 'SYSTEM_ADMIN'), precheckTransactionDocument);
router.get('/:documentId/extraction-review', getExtractionReview);
router.put('/:documentId/extraction-review', authorize('TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL', 'AO_II', 'HRMO', 'SYSTEM_ADMIN'), confirmExtractionReview);
router.get('/:documentId', getDocument);

export default router;
