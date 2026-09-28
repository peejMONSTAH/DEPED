const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = p => fs.readFileSync(path.join(__dirname, '../src', p), 'utf8');

test('operational reports are downloaded from the server, never built in the browser', () => {
  const reports = src('pages/admin/Reports.tsx');
  assert.match(reports, /\/admin\/reports\/\$\{type\}\/export/);
  assert.doesNotMatch(reports, /new Blob\(\[csv/, 'no client-side CSV');
  assert.doesNotMatch(reports, /audit-logs\?limit=500/, 'no export from a loaded page of data');
  for (const hr of ['promotion', 'plantilla', 'demographic', 'ranking']) assert.doesNotMatch(reports, new RegExp(`type: '[^']*${hr}`, 'i'), `no HR report: ${hr}`);
});

test('each admin page reads its own API and shows loading, error and empty states without fallback data', () => {
  for (const [file, api] of [['AccessSessions.tsx', '/admin/${tab}'], ['EmailDelivery.tsx', '/admin/operations/email'], ['ServiceHealth.tsx', '/admin/operations/health']]) {
    const page = src(`pages/admin/${file}`);
    assert.ok(page.includes(api), `${file} calls ${api}`);
    assert.match(page, /role="alert"/, `${file} error state`);
    assert.match(page, /aria-busy="true"/, `${file} loading state`);
    assert.match(page, /set\w+\(null\)/, `${file} clears data on failure instead of keeping stale or sample data`);
  }
  assert.match(src('pages/admin/AccessSessions.tsx'), /sysops-empty/);
  assert.match(src('pages/admin/EmailDelivery.tsx'), /sysops-empty/);
});

test('destructive admin actions ask for confirmation and a reason', () => {
  const page = src('pages/admin/AccessSessions.tsx');
  assert.match(page, /confirm\(\{ title, message, confirmLabel: title, tone: 'danger', reason:/);
  assert.match(page, /confirmOwn: s\.account\.id === user\?\.id/, 'own sessions are flagged, not silently revoked');
});

test('health distinguishes every status and never claims more than a check proved', () => {
  const page = src('pages/admin/ServiceHealth.tsx');
  for (const s of ['OPERATIONAL', 'DEGRADED', 'UNAVAILABLE', 'NOT_CONFIGURED', 'UNKNOWN']) assert.match(page, new RegExp(`${s}: '`));
  assert.doesNotMatch(page, /100% secure|fully protected/i);
  assert.doesNotMatch(page, /restore now|onClick=\{[^}]*restore/i, 'no restore action');
});

test('admin lists stack instead of scrolling sideways', () => {
  const css = src('pages/admin/system-operations.css');
  assert.match(css, /\.adm-list>li\{display:flex;flex-wrap:wrap/);
  assert.match(css, /\.adm-list__main\{[^}]*min-width:0/);
});
