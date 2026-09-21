import pino from 'pino';
import { config } from '../config';

/**
 * Structured application logger. Emits JSON on stdout for the platform's log
 * collector; morgan still prints human-readable request lines in development.
 *
 * Use `req.log` inside request handlers so entries carry the request id.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (config.env === 'production' ? 'info' : 'debug'),
  // Credentials and tokens must never reach the log sink.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'newPassword',
      'initialPassword',
      'passwordHash',
      'accessToken',
      'refreshToken',
      '*.password',
      '*.passwordHash',
      '*.initialPassword',
    ],
    censor: '[redacted]',
  },
});
