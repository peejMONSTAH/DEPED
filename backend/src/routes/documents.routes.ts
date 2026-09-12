import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { uploadDocument, getDocument, downloadDocumentFile } from '../controllers/documents.controller';
import multer from 'multer';
import { config } from '../config';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: config.documents.maxSizeBytes },
  fileFilter: (_req, file, cb) => {
    if (config.documents.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPEG, PNG, and TIFF are allowed.'));
    }
  },
});

const router = Router();
router.use(authenticate);

// Transaction-scoped document upload (supports both /documents and /upload)
router.post('/transactions/:transactionId/documents', authorize('TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL', 'AO_II', 'SYSTEM_ADMIN'), upload.single('file'), uploadDocument);
router.post('/transactions/:transactionId/upload', authorize('TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL', 'AO_II', 'SYSTEM_ADMIN'), upload.single('file'), uploadDocument);

// Standalone document routes
router.get('/:documentId/file', downloadDocumentFile);
router.get('/:documentId/download', downloadDocumentFile);
router.get('/:documentId', getDocument);

export default router;
