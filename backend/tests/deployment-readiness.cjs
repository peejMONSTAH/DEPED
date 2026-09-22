require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = p => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const backend = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const exists = p => fs.existsSync(path.join(__dirname, '..', '..', p));

test('backups cover object storage, not just the database', () => {
  const daily = repo('scripts/backup-daily.ps1');
  assert.match(daily, /backup-storage\.mjs/, 'the daily backup must export document object storage');
  assert.match(daily, /throw/, 'a failed storage export must fail the backup, not warn');
  assert.ok(exists('backend/scripts/backup-storage.mjs'));
});

test('the storage backup reconciles against the rows that reference it', () => {
  const storage = backend('scripts/backup-storage.mjs');
  // Downloading objects is not enough: a backup missing a referenced document
  // must fail rather than sit on disk looking complete.
  assert.match(storage, /referencedButMissing/);
  assert.match(storage, /process\.exit\(1\)/);
  assert.match(storage, /uploadedDocument/, 'must check documents attached to transactions');
  assert.match(storage, /personnelFile/, 'must check documents in the 201 file');
});

test('a restore drill exists and boots the API, not just pg_restore', () => {
  assert.ok(exists('scripts/restore-drill.ps1'), 'a backup nobody has restored is a hope, not a backup');
  const drill = repo('scripts/restore-drill.ps1');
  assert.match(drill, /pg_restore/);
  assert.match(drill, /src\/index\.ts/, 'the drill must start the API against the restored database');
  assert.match(drill, /WORKFLOW_OUTBOX_ENABLED = 'false'/, 'restored outbox emails must not be sent');
  assert.match(drill, /Get-FileHash/, 'restore must check the backup manifest');
  assert.match(repo('scripts/backup-daily.ps1'), /--extension=citext/, 'public-schema backups must include email column dependencies');
});

test('remediation exists for accounts still holding a shared issued password', () => {
  // The forced-change migration defaults existing rows to false so the deploy
  // locks nobody out, which leaves pre-existing shared passwords unremediated.
  assert.ok(exists('backend/scripts/flag-leaked-passwords.ts'));
  const script = backend('scripts/flag-leaked-passwords.ts');
  assert.match(script, /Personnel@Pass123/);
  assert.match(script, /Reset@Pass2026/);
  assert.match(script, /--apply/, 'must report before it mutates');
  assert.ok(!/console\.log\([^)]*passwordHash/.test(script), 'must not print credentials');
});

test('server field errors can reach the field that caused them', () => {
  const hook = repo('web/src/hooks/useFormErrors.ts');
  assert.match(hook, /setFromResponse/);
  // validateBody sends "field: message"; the hook has to parse that exact shape.
  assert.match(hook, /\^\(\[A-Za-z0-9_\.\[\\]\]\+\)/);
  const promotions = repo('web/src/pages/admin/PromotionManagement.tsx');
  assert.match(promotions, /cycleErrors\.setFromResponse/, 'the cycle form should route 400s to its fields');
  assert.match(promotions, /<FieldError message=\{cycleErrors\.errors\.name\}/);
});
