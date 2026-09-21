import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { sendBadRequest } from '../utils/response.util';

/**
 * Validates and replaces `req.body` with the parsed result, so handlers work with
 * typed, trimmed values instead of raw client input.
 *
 * Generalises the inline pattern already used in routes/form-drafts.routes.ts.
 */
export const validateBody = (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue.path.join('.');
      sendBadRequest(res, field ? `${field}: ${issue.message}` : issue.message, 'VALIDATION_ERROR');
      return;
    }
    req.body = result.data;
    next();
  };
