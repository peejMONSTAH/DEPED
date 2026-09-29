/**
 * Upload rejections the user can act on, with stable codes for the web and phone
 * clients. The size is read from the limit actually in force.
 */
const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

export const unsupportedUploadError = (maxBytes: number) =>
  Object.assign(new Error(`This file type is not accepted. Choose a PDF, PNG or JPEG file up to ${mb(maxBytes)}.`), {
    statusCode: 415, code: 'UPLOAD_UNSUPPORTED_TYPE',
  });

/** Turns multer's own errors (size and count limits) into a clear 4xx; anything else is left alone. */
export const uploadLimitError = (err: any, maxBytes: number): (Error & { statusCode: number; code: string }) | null => {
  if (err?.name !== 'MulterError') return null;
  if (err.code === 'LIMIT_FILE_SIZE') {
    return Object.assign(new Error(`This file is larger than ${mb(maxBytes)}. Choose a smaller PDF, PNG or JPEG, or scan it at a lower resolution.`), { statusCode: 413, code: 'UPLOAD_TOO_LARGE' });
  }
  return Object.assign(new Error('Upload one file at a time, using the file field provided.'), { statusCode: 400, code: 'UPLOAD_INVALID' });
};
