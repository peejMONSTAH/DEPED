import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, refreshToken, logout, changePassword, magicLogin } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { config } from '../config';

const router = Router();

// SEC-H2: DEMO MODE — Auth rate limiter disabled for demo purposes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.MAX_SAFE_INTEGER, // DEMO: effectively disabled
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many authentication attempts. Please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
});

/**
 * POST /auth/login — Authenticate user, return access + refresh tokens
 */
router.post('/login', authLimiter, login);

/**
 * POST /auth/magic-login — 1-click passwordless authentication from email
 */
router.post('/magic-login', authLimiter, magicLogin);

/**
 * POST /auth/refresh-token — Get new access token via refresh token
 */
router.post('/refresh-token', refreshToken);

/**
 * POST /auth/logout — Invalidate refresh token
 */
router.post('/logout', authenticate, logout);

/**
 * POST /auth/change-password — Compulsory password change on first login
 */
router.post('/change-password', authenticate, changePassword);

export default router;

