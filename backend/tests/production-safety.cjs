require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const { assertSafeDatabaseWrite } = require('../scripts/local-db-guard.cjs');

const REMOTE = 'postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
const LOCAL = 'postgresql://u:p@localhost:5432/digital201';

test('database-writing developer tasks refuse a remote database', () => {
  assert.doesNotThrow(() => assertSafeDatabaseWrite('seed', { env: { DATABASE_URL: LOCAL } }));
  assert.doesNotThrow(() => assertSafeDatabaseWrite('seed', { env: { DATABASE_URL: 'postgresql://u:p@127.0.0.1/x' } }));
  assert.throws(() => assertSafeDatabaseWrite('seed', { env: { DATABASE_URL: REMOTE } }), /Refusing to run "seed" against the remote database at aws-0-ap-southeast-1\.pooler\.supabase\.com/);
  // DIRECT_URL is what Prisma Migrate and the seed actually connect through.
  assert.throws(() => assertSafeDatabaseWrite('migrate', { env: { DATABASE_URL: LOCAL, DIRECT_URL: REMOTE } }), /remote database/);
  assert.throws(() => assertSafeDatabaseWrite('seed', { env: {} }), /missing/);
  assert.throws(() => assertSafeDatabaseWrite('seed', { env: { DATABASE_URL: 'not a url' } }), /malformed/);
});

test('a remote run needs the exact host named, and demo passwords never run remotely', () => {
  const host = 'aws-0-ap-southeast-1.pooler.supabase.com';
  assert.doesNotThrow(() => assertSafeDatabaseWrite('flag', { env: { DATABASE_URL: REMOTE, ALLOW_REMOTE_DB_WRITE: host } }));
  assert.throws(() => assertSafeDatabaseWrite('flag', { env: { DATABASE_URL: REMOTE, ALLOW_REMOTE_DB_WRITE: 'true' } }), /remote database/, 'a generic "true" is not enough');
  assert.throws(() => assertSafeDatabaseWrite('demo', { allowRemote: false, env: { DATABASE_URL: REMOTE, ALLOW_REMOTE_DB_WRITE: host } }), /never runs against a remote database/);
});

test('every writing script and npm task is guarded', () => {
  assert.match(read('scripts/set-demo-passwords.ts'), /assertSafeDatabaseWrite\('set demo passwords', \{ allowRemote: false \}\)/);
  assert.match(read('scripts/unlock-accounts.ts'), /assertSafeDatabaseWrite\('unlock all locked accounts'\)/);
  assert.match(read('scripts/flag-leaked-passwords.ts'), /assertSafeDatabaseWrite\('flag leaked passwords'\);\s*const result = await prisma\.user\.updateMany/, 'reporting stays read-only and unguarded; flagging is guarded');
  assert.match(read('prisma/seed.ts'), /assertSafeDatabaseWrite\('prisma seed'\)/);
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts['prisma:migrate'], /^node scripts\/local-db-guard\.cjs "prisma migrate dev" && prisma migrate dev$/);
  assert.match(pkg.scripts['prisma:seed'], /^node scripts\/local-db-guard\.cjs/);
});

test('no seed or demo password is left in the seed file, and published ones are flagged as leaked', () => {
  const seed = read('prisma/seed.ts');
  assert.doesNotMatch(seed, /Admin@SecurePass123/);
  assert.match(seed, /process\.env\.SEED_ADMIN_PASSWORD/);
  const leaked = read('scripts/flag-leaked-passwords.ts');
  for (const literal of ['Admin@SecurePass123', 'admin123', 'Personnel@Pass123', 'Reset@Pass2026!']) assert.ok(leaked.includes(`'${literal}'`), literal);
});

test('email is delivered only by production processes unless explicitly enabled', () => {
  const { isOutboxDeliveryEnabled } = require('../src/services/workflow-outbox.service');
  assert.equal(isOutboxDeliveryEnabled({ NODE_ENV: 'production' }), true);
  assert.equal(isOutboxDeliveryEnabled({ NODE_ENV: 'development' }), false);
  assert.equal(isOutboxDeliveryEnabled({}), false);
  assert.equal(isOutboxDeliveryEnabled({ NODE_ENV: 'development', WORKFLOW_OUTBOX_ENABLED: 'true' }), true);
  assert.equal(isOutboxDeliveryEnabled({ NODE_ENV: 'production', WORKFLOW_OUTBOX_ENABLED: 'false' }), false, 'restore drills can still switch it off');
  const service = read('src/services/workflow-outbox.service.ts');
  assert.match(service, /export async function processWorkflowOutbox\(\): Promise<void> \{\s*\/\/[^\n]*\n\s*if \(!isOutboxDeliveryEnabled\(\)\) return;/, 'the on-demand sends after each action are gated too, not only the timer');
  assert.match(read('Dockerfile'), /^ENV NODE_ENV=production$/m, 'the production image keeps delivering');
});

test('only a System Administrator manages HRMO and System Administrator accounts', () => {
  const { canManageAccount } = require('../src/utils/role-assignment.util');
  assert.equal(canManageAccount('SYSTEM_ADMIN', 'SYSTEM_ADMIN'), true);
  assert.equal(canManageAccount('SYSTEM_ADMIN', 'HRMO'), true);
  for (const target of ['HRMO', 'SYSTEM_ADMIN']) assert.equal(canManageAccount('HRMO', target), false, `HRMO -> ${target}`);
  for (const target of ['AO_II', 'TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL']) assert.equal(canManageAccount('HRMO', target), true, `HRMO -> ${target}`);
  assert.equal(canManageAccount('AO_II', 'TEACHING_PERSONNEL'), true);
  for (const target of ['AO_II', 'HRMO', 'SYSTEM_ADMIN']) assert.equal(canManageAccount('AO_II', target), false, `AO_II -> ${target}`);
  assert.equal(canManageAccount('TEACHING_PERSONNEL', 'TEACHING_PERSONNEL'), false);

  const users = read('src/controllers/users.controller.ts');
  const guarded = (fn, subject) => {
    const start = users.indexOf(`export const ${fn} = async`);
    const body = users.slice(start, users.indexOf('\nexport const ', start + 10));
    assert.match(body, new RegExp(`if \\(!canManageAccount\\(req\\.user\\?\\.role, ${subject}\\.role\\.name\\)\\) \\{ sendForbidden\\(res, MANAGE_REFUSAL\\); return; \\}`), fn);
  };
  guarded('updateUser', 'existing');
  guarded('deleteUser', 'existing');
  guarded('resetUserPassword', 'user');
  guarded('distributeCredentials', 'user');
});
