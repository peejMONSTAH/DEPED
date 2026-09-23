import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getDocumentTypes,
  listPersonnelDocuments,
  uploadPersonnelDocument,
  replacePersonnelDocument,
  deletePersonnelDocument,
  downloadPersonnelDocumentFile,
  getPersonnelDocumentViewToken,
  extractPersonnelDocument,
  getExtractionReview,
  applyExtractionTo201,
} from '../controllers/personnel-documents.controller';
import { config } from '../config';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg'];
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
    const isMimeAllowed = allowedMimes.includes(file.mimetype);
    const isExtAllowed = allowedExts.includes(ext);

    if (isMimeAllowed && isExtAllowed) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Strict policy: Only PDF, PNG, and JPEG files (.pdf, .png, .jpg, .jpeg) are allowed for personnel document uploads.'));
    }
  },
});

const router = Router();

// Authentication required for all personnel document routes
router.use(authenticate);

// Document types reference (accessible to all authenticated users)
router.get('/document-types', getDocumentTypes);

// Personnel document operations
router.get('/', listPersonnelDocuments);
router.post('/', upload.single('file'), uploadPersonnelDocument);
router.put('/:id', upload.single('file'), replacePersonnelDocument);
router.delete('/:id', deletePersonnelDocument);
router.get('/:id/view-token', getPersonnelDocumentViewToken);
router.get('/:id/file', downloadPersonnelDocumentFile);

// Extraction and 201 synchronization endpoints
router.post('/:id/extract', extractPersonnelDocument);
router.get('/:id/extraction-review', getExtractionReview);
router.post('/:id/apply-extraction', applyExtractionTo201);

export default router;
