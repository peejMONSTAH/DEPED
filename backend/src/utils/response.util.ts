import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  status: 'success' | 'error';
  message?: string;
  data?: T;
  code?: string;
  /** Correlates a 5xx response with its server log entry. */
  requestId?: string;
  pagination?: PaginationMeta;
  meta?: Record<string, any>;
  counts?: Record<string, any>;
  filterOptions?: Record<string, any>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export const sendSuccess = <T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200,
  pagination?: PaginationMeta,
  extra?: Record<string, any>
): Response => {
  const response: ApiResponse<T> = { status: 'success', data };
  if (message) response.message = message;
  if (pagination) response.pagination = pagination;
  if (extra) {
    Object.assign(response, extra);
  }
  return res.status(statusCode).json(response);
};

export const sendCreated = <T>(res: Response, data: T, message?: string): Response =>
  sendSuccess(res, data, message, 201);

export const sendError = (
  res: Response,
  message: string,
  statusCode = 500,
  code?: string
): Response => {
  const response: ApiResponse = { status: 'error', message };
  if (code) response.code = code;
  // Server-side failures get the same traceable reference the error middleware returns.
  if (statusCode >= 500) {
    const requestId = (res.req as { id?: string } | undefined)?.id;
    if (requestId) response.requestId = requestId;
  }
  return res.status(statusCode).json(response);
};

export const sendNotFound = (res: Response, message = 'Resource not found'): Response =>
  sendError(res, message, 404, 'NOT_FOUND');

export const sendUnauthorized = (res: Response, message = 'Unauthorized'): Response =>
  sendError(res, message, 401, 'UNAUTHORIZED');

export const sendForbidden = (res: Response, message = 'Forbidden'): Response =>
  sendError(res, message, 403, 'FORBIDDEN');

export const sendBadRequest = (res: Response, message: string, code = 'VALIDATION_ERROR'): Response =>
  sendError(res, message, 400, code);

export const getPaginationParams = (query: Record<string, unknown>) => {
  const page = Math.max(1, parseInt(String(query.page || 1), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || 10), 10)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

export const buildPaginationMeta = (
  page: number,
  limit: number,
  totalItems: number
): PaginationMeta => ({
  page,
  limit,
  totalItems,
  totalPages: Math.ceil(totalItems / limit),
});
