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
    documentAiLocation: process.env.DOCUMENT_AI_LOCATION || 'us',
    documentAiProcessorId: process.env.DOCUMENT_AI_PROCESSOR_ID || '',
    ocrProvider: process.env.OCR_PROVIDER || '',
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
    from: process.env.EMAIL_FROM || 'Digital 201 <noreply@deped.gov.ph>',
  },

  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '300', 10),
    loginMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10),
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
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    allowedExtensions: ['.pdf', '.png', '.jpg', '.jpeg'],
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
  if (!config.db.url) {
    throw new Error('FATAL: DATABASE_URL is required in production.');
  }
  if (!process.env.CORS_ORIGIN || !process.env.CLIENT_URL) {
    throw new Error('FATAL: CORS_ORIGIN and CLIENT_URL must be explicitly configured in production.');
  }
  for (const [name, value] of [['CORS_ORIGIN', config.cors.origin], ['CLIENT_URL', config.clientUrl]]) {
    const url = new URL(value);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
      throw new Error(`FATAL: ${name} must use HTTPS outside localhost.`);
    }
  }
}
