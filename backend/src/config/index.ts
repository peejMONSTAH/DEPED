import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),

  db: {
    url: process.env.DATABASE_URL || '',
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET || 'hris-documents',
  },

  google: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || '',
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  clientUrl: process.env.CLIENT_URL || process.env.CORS_ORIGIN || 'http://localhost:5173',

  email: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'Eminence DepEd HRIS <noreply@deped.gov.ph>',
  },

  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100000', 10),
    loginMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '100000', 10),
  },

  session: {
    timeoutMinutes: 30,
    mobileTimeoutMinutes: 60,
    maxConcurrentSessions: 3,
    lockoutDurationMinutes: 15,
    maxFailedAttempts: 5,
  },

  documents: {
    maxSizeBytes: 10 * 1024 * 1024, // 10 MB
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'],
    maxPerTransaction: 50,
  },
};

// Enforce strict security check at startup
if (config.env === 'production') {
  const insecureSecrets = [
    'dev-access-secret-change-in-production',
    'dev-refresh-secret-change-in-production',
    'your-access-token-secret-here',
    'your-refresh-token-secret-here',
    'default',
    'secret',
  ];
  if (!process.env.JWT_ACCESS_SECRET || insecureSecrets.includes(config.jwt.accessSecret)) {
    throw new Error('FATAL: JWT_ACCESS_SECRET is unconfigured or using an insecure default value in production!');
  }
  if (!process.env.JWT_REFRESH_SECRET || insecureSecrets.includes(config.jwt.refreshSecret)) {
    throw new Error('FATAL: JWT_REFRESH_SECRET is unconfigured or using an insecure default value in production!');
  }
}
