import { Router } from 'express';
import { login, refreshToken, logout, changePassword, magicLogin } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * POST /auth/login — Authenticate user, return access + refresh tokens
 */
router.post('/login', login);

/**
 * POST /auth/magic-login — 1-click passwordless authentication from email
 */
router.post('/magic-login', magicLogin);

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
