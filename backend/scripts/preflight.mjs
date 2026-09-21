/**
 * Checks whether this checkout is ready to deploy, and says what is missing.
 *
 * Reads only: it inspects local configuration and the migrations directory, and
 * never connects to production. Exits non-zero when something would stop the
 * release, so it can gate a pipeline.
 *
 *   node backend/scripts/preflight.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(backendRoot, '..');

const results = [];
const check = (label, ok, detail = '') => results.push({ label, ok, detail });

// --- environment -----------------------------------------------------------
const envPath = path.join(backendRoot, '.env');
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
check('backend/.env exists', fs.existsSync(envPath));

for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
  const v = env[key] || '';
  check(`${key} is a real secret`, v.length >= 32 && !/placeholder|here|changeme/i.test(v),
    v ? `${v.length} chars` : 'missing');
}
for (const key of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SMTP_HOST']) {
  check(`${key} is set`, Boolean(env[key]));
}
// The boot check refuses a non-HTTPS origin outside localhost, so the API will
// not start in production until these carry the real domain.
for (const key of ['CORS_ORIGIN', 'CLIENT_URL']) {
  const v = env[key] || '';
  let ok = false;
  let detail = 'missing';
  try {
    const u = new URL(v);
    ok = u.protocol === 'https:';
    detail = ok ? v : `${v} is not HTTPS`;
  } catch { detail = v ? `${v} is not a URL` : 'missing'; }
  check(`${key} is an HTTPS URL`, ok, detail);
}
check("NODE_ENV is 'production'", env.NODE_ENV === 'production', env.NODE_ENV || 'unset');

// --- release tooling -------------------------------------------------------
for (const rel of [
  'scripts/backup-daily.ps1',
  'scripts/restore-drill.ps1',
  'backend/scripts/backup-storage.mjs',
  'backend/scripts/flag-leaked-passwords.ts',
]) {
  check(`${rel} present`, fs.existsSync(path.join(repoRoot, rel)));
}

const deployment = fs.existsSync(path.join(repoRoot, 'DEPLOYMENT.md'))
  ? fs.readFileSync(path.join(repoRoot, 'DEPLOYMENT.md'), 'utf8') : '';
check('DEPLOYMENT.md documents the release steps',
  ['migrate deploy', 'flag-leaked-passwords', 'restore-drill'].every(t => deployment.includes(t)));

// --- migrations ------------------------------------------------------------
const migrationsDir = path.join(backendRoot, 'prisma', 'migrations');
const migrations = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir).filter(d => fs.existsSync(path.join(migrationsDir, d, 'migration.sql')))
  : [];
check('migrations present', migrations.length > 0, `${migrations.length} found`);

// --- report ----------------------------------------------------------------
const pad = Math.max(...results.map(r => r.label.length));
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.label.padEnd(pad)}  ${r.detail}`);
}

console.log();
if (failed === 0) {
  console.log('Preflight passed. Follow the Release Runbook in DEPLOYMENT.md.');
} else {
  console.log(`${failed} item(s) must be resolved before deploying. See the Release Runbook in DEPLOYMENT.md.`);
  console.log('Note: this checks configuration only. It cannot tell you whether migrations');
  console.log('have been applied to the live database - run "prisma migrate status" for that.');
}
process.exit(failed === 0 ? 0 : 1);
