import multer from 'multer';
import path from 'path';

export const CSV_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

/** One CSV file in memory (Excel saves CSV as text/csv or application/vnd.ms-excel depending on the machine). */
export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CSV_UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (extension === '.csv' || extension === '.txt') { callback(null, true); return; }
    callback(new Error('Choose a .csv file (in Excel: Save As, CSV).'));
  },
});
