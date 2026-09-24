import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { personnelDocumentUpload } from '../middleware/personnel-document-upload.middleware';
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

const router = Router();

// Authentication required for all personnel document routes
router.use(authenticate);

// Document types reference (accessible to all authenticated users)
router.get('/document-types', getDocumentTypes);

// Personnel document operations
router.get('/', listPersonnelDocuments);
router.post('/', personnelDocumentUpload.single('file'), uploadPersonnelDocument);
router.put('/:id', personnelDocumentUpload.single('file'), replacePersonnelDocument);
router.delete('/:id', deletePersonnelDocument);
router.get('/:id/view-token', getPersonnelDocumentViewToken);
router.get('/:id/file', downloadPersonnelDocumentFile);

// Extraction and 201 synchronization endpoints
router.post('/:id/extract', extractPersonnelDocument);
router.get('/:id/extraction-review', getExtractionReview);
router.post('/:id/apply-extraction', applyExtractionTo201);

export default router;
