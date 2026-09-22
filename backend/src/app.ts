import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import prisma from './config/prisma';

// Routes
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import personnelRoutes from './routes/personnel.routes';
import transactionsRoutes from './routes/transactions.routes';
import documentsRoutes from './routes/documents.routes';
import promotionsRoutes from './routes/promotions.routes';
import notificationsRoutes from './routes/notifications.routes';
import auditRoutes from './routes/audit.routes';
import plantillaRoutes from './routes/plantilla.routes';
import formDraftRoutes from './routes/form-drafts.routes';
import personnelDocumentsRoutes from './routes/personnel-documents.routes';
import { forwardAsyncErrors } from './middleware/async-routes';
import { auditMiddleware } from './middleware/audit.middleware';
import dashboardRoutes from './routes/dashboard.routes';

for (const router of [dashboardRoutes, authRoutes, usersRoutes, personnelRoutes, transactionsRoutes, documentsRoutes, promotionsRoutes, notificationsRoutes, auditRoutes, plantillaRoutes, formDraftRoutes, personnelDocumentsRoutes]) {
  forwardAsyncErrors(router);
}

const app = express();

// Required for correct client IPs and rate limiting behind a production reverse proxy.
if (config.env === 'production') app.set('trust proxy', 1);

// Attaches req.id and req.log so every later log line can be traced to one request.
// Request/response lines themselves stay with morgan; this logs failures only.
app.use(pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    const id = (Array.isArray(existing) ? existing[0] : existing) || randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  autoLogging: false,
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : 'silent'),
}));

// Disable ETag and prevent stale HTTP 304 caching on API responses
app.set('etag', false);
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// ─── Security & Core Middleware ────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: config.cors.origin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// EventSource carries its token in the query string; access logs must never retain it.
morgan.token('safe-url', req => (req.url || '').split('?')[0]);
app.use(morgan(':method :safe-url :status :response-time ms'));

// ─── Global Rate Limit ─────────────────────────────────────────────────────
// General API abuse protection; authentication has a separate tighter limiter.
const globalLimiter = rateLimit({
  windowMs: config.rateLimiting.windowMs || 15 * 60 * 1000,
  max: config.env === 'development' ? 5000 : config.rateLimiting.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many requests from this IP. Please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
});
app.use(globalLimiter);
app.use(auditMiddleware);

// ─── Health Check ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Digital 201 API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: config.env,
  });
});

app.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', service: 'Digital 201 API' });
  } catch {
    res.status(503).json({ status: 'not_ready', message: 'Database is unavailable.' });
  }
});

// ─── API Routes ────────────────────────────────────────────────────────────
const API_PREFIX = '/api/v1';

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, usersRoutes);
app.use(`${API_PREFIX}/dashboard`, dashboardRoutes);
app.use(`${API_PREFIX}/personnel/documents`, personnelDocumentsRoutes);
app.use(`${API_PREFIX}/personnel`, personnelRoutes);
app.use(`${API_PREFIX}/transactions`, transactionsRoutes);
app.use(`${API_PREFIX}/documents`, documentsRoutes);
app.use(`${API_PREFIX}/forms`, formDraftRoutes);
app.use(`${API_PREFIX}/promotions`, promotionsRoutes);
app.use(`${API_PREFIX}/career`, promotionsRoutes);
app.use(`${API_PREFIX}/plantilla`, plantillaRoutes);
app.use(`${API_PREFIX}/notifications`, notificationsRoutes);
app.use(`${API_PREFIX}`, auditRoutes);

// ─── Error Handlers ────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
