import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

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

const app = express();

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
app.use(morgan(config.env === 'development' ? 'dev' : 'combined'));

// ─── Global Rate Limit ─────────────────────────────────────────────────────
// SEC-H1: DEMO MODE — Rate limiting disabled for demo purposes
const globalLimiter = rateLimit({
  windowMs: config.rateLimiting.windowMs || 15 * 60 * 1000,
  max: Number.MAX_SAFE_INTEGER, // DEMO: effectively disabled
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many requests from this IP. Please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
});
app.use(globalLimiter);

// ─── Health Check ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Eminence HRIS API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: config.env,
  });
});

// ─── API Routes ────────────────────────────────────────────────────────────
const API_PREFIX = '/api/v1';

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, usersRoutes);
app.use(`${API_PREFIX}/personnel`, personnelRoutes);
app.use(`${API_PREFIX}/transactions`, transactionsRoutes);
app.use(`${API_PREFIX}/documents`, documentsRoutes);
app.use(`${API_PREFIX}/promotions`, promotionsRoutes);
app.use(`${API_PREFIX}/career`, promotionsRoutes);
app.use(`${API_PREFIX}/plantilla`, plantillaRoutes);
app.use(`${API_PREFIX}/notifications`, notificationsRoutes);
app.use(`${API_PREFIX}`, auditRoutes);

// ─── Error Handlers ────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
