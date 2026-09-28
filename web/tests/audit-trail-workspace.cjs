const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readSrc = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

test('AuditLog workspace: loading, error, empty, and populated states are distinct', () => {
  const code = readSrc('pages/admin/AuditLog.tsx');

  // Loading state
  assert.match(code, /Loading security audit trail records…/);

  // Error state - must preserve the exact assertion required by gap-fixes.cjs
  assert.match(code, /Audit trail unavailable/);
  assert.match(code, /role="alert"/);

  // Empty state
  assert.match(code, /No audit log records found/);
  assert.match(code, /No recorded events matched your search query/);

  // Populated state with table and mobile cards
  assert.match(code, /<table className="audit-table">/);
  assert.match(code, /className="audit-mobile-feed"/);
});

test('AuditLog workspace: role labels are humanized and not displayed as raw uppercase enums', () => {
  const code = readSrc('pages/admin/AuditLog.tsx');

  // Role options in filter dropdown
  assert.match(code, /label: 'System Administrator'/);
  assert.match(code, /label: 'Administrative Officer II'/);
  assert.match(code, /label: 'Human Resource Management Officer'|label: 'HRMO'/);
  assert.match(code, /label: 'Teaching Personnel'/);
  assert.match(code, /label: 'Non-Teaching Personnel'/);

  // Renders actorRoleLabel
  assert.match(code, /log\.actorRoleLabel \|\| log\.role/);
});

test('AuditLog workspace: outcome and severity combine visible text with accessible badges', () => {
  const code = readSrc('pages/admin/AuditLog.tsx');

  // Text inside outcome badges, not color alone
  assert.match(code, /● SUCCESS/);
  assert.match(code, /⊘ DENIED/);
  assert.match(code, /✕ FAILED/);

  // Severity pills with text
  assert.match(code, /audit-severity-pill sev-\$\{log\.severity\.toLowerCase\(\)\}/);
});

test('AuditLog workspace: expandable forensic drawer uses accessible keyboard controls', () => {
  const code = readSrc('pages/admin/AuditLog.tsx');

  // Toggle button with aria-expanded
  assert.match(code, /aria-expanded=\{isExpanded\}/);
  assert.match(code, /aria-label=\{`\$\{isExpanded \? 'Close' : 'Inspect'\} details for event #\$\{log\.id\}`\}/);

  // Forensic details
  assert.match(code, /audit-forensic-grid/);
  assert.match(code, /Tamper-Evident Hash/);
  assert.match(code, /Request Correlation ID/);
});

test('AuditLog workspace: export is database-backed and triggers server export endpoints', () => {
  const code = readSrc('pages/admin/AuditLog.tsx');

  // Database-backed CSV endpoint
  assert.match(code, /apiClient\.get\('\/audit-logs\/export\/csv'/);

  // Database-backed JSON endpoint
  assert.match(code, /apiClient\.get\('\/audit-logs\/export\/json'/);

  // Handles export loading state and toast feedback
  assert.match(code, /setExporting\(true\)/);
  assert.match(code, /addToast\(.*'SUCCESS'\)/);
  assert.match(code, /addToast\(.*'ERROR'\)/);
});

test('AuditLog workspace: responsive CSS eliminates page-level horizontal clipping', () => {
  const css = readSrc('pages/admin/audit-workspace.css');

  // Desktop table scroll container
  assert.match(css, /\.audit-table-scroll\s*\{[^}]*overflow-x:\s*auto/);

  // Mobile feed displays on small viewports while table collapses
  assert.match(css, /@media\s*\(max-width:\s*768px\)/);
  assert.match(css, /\.audit-table-scroll\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.audit-mobile-feed\s*\{[^}]*display:\s*flex/);

  // Reduced motion support
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

  // Truncation safety
  assert.match(css, /text-overflow:\s*ellipsis/);
});
