import multer from 'multer';
import path from 'path';
import { unsupportedUploadError } from '../utils/upload-errors.util';

export const PERSONNEL_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

const allowedExtensions = new Set(['.pdf', '.png', '.jpg', '.jpeg']);
const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export const personnelDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PERSONNEL_DOCUMENT_MAX_BYTES },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.has(extension) && allowedMimeTypes.has(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(unsupportedUploadError(PERSONNEL_DOCUMENT_MAX_BYTES));
  },
});

export const isValidPersonnelDocumentFile = (file?: Express.Multer.File): file is Express.Multer.File => {
  if (!file?.size || file.size > 10 * 1024 * 1024) return false;
  const extension = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(file.mimetype)) return false;
  if (file.mimetype === 'application/pdf') return file.buffer.subarray(0, 5).toString() === '%PDF-';
  if (file.mimetype === 'image/png') {
    return file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return file.buffer[0] === 255 && file.buffer[1] === 216 && file.buffer[2] === 255;
};
