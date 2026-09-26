import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),

  db: {
    url: process.env.DATABASE_URL || '',
  },

  jwt: {
    // No fallback: an unset secret must fail at boot, not silently sign real tokens.
    accessSecret: process.env.JWT_ACCESS_SECRET || '',
    refreshSecret: process.env.JWT_REFRESH_SECRET || '',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET || 'hris-documents',
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
    // Mailtrap's HTTPS sending API. Used instead of SMTP when set: hosts such as
    // Railway block outbound SMTP ports, where SMTP connections just hang.
    mailtrapApiToken: process.env.MAILTRAP_API_TOKEN || '',
  },

  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '300', 10),
    loginMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10),
  },

  // Sign-in from an unrecognised device asks for a code emailed to the account.
  deviceVerification: {
    enabled: process.env.DEVICE_VERIFICATION_ENABLED !== 'false',
    trustDays: parseInt(process.env.DEVICE_TRUST_DAYS || '30', 10),
    codeMinutes: 10,
    maxAttempts: 5,
    resendSeconds: 60,
  },

  session: {
    // The web app signs out after this long without input (web/src/hooks/useIdleSignOut).
    webIdleMinutes: 30,
    // Server side: a browser session unused this long cannot be refreshed. Idle
    // limit plus one access-token lifetime, so an active user is never cut off.
    webRefreshIdleMinutes: 45,
    maxConcurrentSessions: 3,
    lockoutDurationMinutes: 15,
    maxFailedAttempts: 5,
  },

  // Phone-app builds below this are refused with "update the app" (0 = off). Raise it
  // when a release must reach everyone, e.g. MIN_APP_BUILD=2.
  minAppBuild: parseInt(process.env.MIN_APP_BUILD || '0', 10),

  documents: {
    maxSizeBytes: 10 * 1024 * 1024, // 10 MB
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    allowedExtensions: ['.pdf', '.png', '.jpg', '.jpeg'],
    maxPerTransaction: 50,
  },
};

// ─── Startup configuration checks ──────────────────────────────────────────
// Each requirement is asserted in the environment that actually needs it, so a
// misconfigured deployment fails immediately instead of at the first request.
const failures: string[] = [];
const isProduction = config.env === 'production';

const insecureSecrets = [
  'dev-access-secret-change-in-production',
  'dev-refresh-secret-change-in-production',
  'your-access-token-secret-here',
  'your-refresh-token-secret-here',
  'default',
  'secret',
];

// Required everywhere: these sign real sessions and address the real database.
for (const [name, value] of [
  ['JWT_ACCESS_SECRET', config.jwt.accessSecret],
  ['JWT_REFRESH_SECRET', config.jwt.refreshSecret],
] as const) {
  if (!value) failures.push(`${name} is required.`);
  else if (insecureSecrets.includes(value)) failures.push(`${name} is set to a known placeholder value.`);
  else if (isProduction && value.length < 32) failures.push(`${name} must be at least 32 characters in production.`);
}
if (!config.db.url) failures.push('DATABASE_URL is required.');

// Document storage falls back to local disk unless Supabase is selected.
if (isProduction || process.env.DOCUMENT_STORAGE === 'supabase') {
  if (!config.supabase.url) failures.push('SUPABASE_URL is required when document storage uses Supabase.');
  if (!config.supabase.serviceKey) failures.push('SUPABASE_SERVICE_KEY is required when document storage uses Supabase.');
}

if (isProduction) {
  if (!config.email.host && !config.email.mailtrapApiToken) failures.push('SMTP_HOST or MAILTRAP_API_TOKEN is required in production.');
  if (!process.env.CORS_ORIGIN || !process.env.CLIENT_URL) {
    failures.push('CORS_ORIGIN and CLIENT_URL must be explicitly configured in production.');
  }
  for (const [name, value] of [['CORS_ORIGIN', config.cors.origin], ['CLIENT_URL', config.clientUrl]] as const) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
        failures.push(`${name} must use HTTPS outside localhost.`);
      }
    } catch {
      failures.push(`${name} is not a valid URL.`);
    }
  }
}

if (failures.length) {
  throw new Error(`FATAL: invalid configuration.\n  - ${failures.join('\n  - ')}`);
}
