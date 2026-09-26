import { Router } from 'express';
import { login, refreshToken, logout, changePassword, magicLogin, completeAccountSetup, verifyDevice, resendCode, getDevices, removeDevice } from '../controllers/auth.controller';
import rateLimit from 'express-rate-limit';
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
 * POST /auth/complete-setup — Set the first password from the emailed setup link
 */
router.post('/complete-setup', completeAccountSetup);

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

// Codes are six digits: throttle guesses per IP on top of the per-code attempt limit.
const codeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

/**
 * POST /auth/verify-device — Finish a sign-in from a new device with the emailed code
 */
router.post('/verify-device', codeLimiter, verifyDevice);

/**
 * POST /auth/resend-code — Email a fresh sign-in code
 */
router.post('/resend-code', codeLimiter, resendCode);

/**
 * GET /auth/devices, DELETE /auth/devices/:id — Trusted devices on the Profile page
 */
router.get('/devices', authenticate, getDevices);
router.delete('/devices/:id', authenticate, removeDevice);

export default router;
