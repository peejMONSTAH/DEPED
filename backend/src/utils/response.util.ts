import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  status: 'success' | 'error';
  message?: string;
  data?: T;
  code?: string;
  pagination?: PaginationMeta;
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
  pagination?: PaginationMeta
): Response => {
  const response: ApiResponse<T> = { status: 'success', data };
  if (message) response.message = message;
  if (pagination) response.pagination = pagination;
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
