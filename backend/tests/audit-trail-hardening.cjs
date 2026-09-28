require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeAuditDetails,
  deriveActionMetadata,
  humanizeRole,
  formatManilaTimestamp,
  computeRecordHash,
  mapToCanonicalAuditEvent,
} = require('../src/utils/audit.util');
const { AuditCategory, AuditSeverity, AuditOutcome } = require('../src/types/audit.types');
const auditRoutes = require('../src/routes/audit.routes').default;

test('metadata sanitizer recursively redacts secrets and credentials', () => {
  const dirty = {
    email: 'test@deped.gov.ph',
    password: 'superSecretPassword123!',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fakeHash',
    user: {
      accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy',
      refreshToken: 'refresh-token-secret-123',
      nested: {
        apiKey: 'sk-live-abcdef1234567890',
        deviceToken: 'device-token-secret',
        otp: '123456',
        tin: '123-456-789-000',
        validField: 'allowed value',
      },
    },
    bufferData: Buffer.from('binary-document-bytes'),
  };

  const clean = sanitizeAuditDetails(dirty);

  assert.equal(clean.email, 'test@deped.gov.ph');
  assert.equal(clean.password, '[REDACTED]');
  assert.equal(clean.passwordHash, '[REDACTED]');
  assert.equal(clean.user.accessToken, '[REDACTED]');
  assert.equal(clean.user.refreshToken, '[REDACTED]');
  assert.equal(clean.user.nested.apiKey, '[REDACTED]');
  assert.equal(clean.user.nested.deviceToken, '[REDACTED]');
  assert.equal(clean.user.nested.otp, '[REDACTED]');
  assert.equal(clean.user.nested.tin, '[REDACTED]');
  assert.equal(clean.user.nested.validField, 'allowed value');
  assert.match(clean.bufferData, /\[BUFFER: .* bytes omitted\]/);
});

test('metadata sanitizer safely truncates oversized payloads and handles circular references', () => {
  const hugeString = 'A'.repeat(5000);
  const circularObj = { name: 'test' };
  circularObj.self = circularObj;

  const sanitizedHuge = sanitizeAuditDetails({ payload: hugeString });
  assert.match(sanitizedHuge.payload, /\[TRUNCATED: 5000 chars\]/);

  const sanitizedCircular = sanitizeAuditDetails(circularObj);
  assert.equal(sanitizedCircular.name, 'test');
  assert.equal(sanitizedCircular.self, '[CIRCULAR REFERENCE]');
});

test('humanizeRole maps system role codes to official DepEd titles', () => {
  assert.equal(humanizeRole('SYSTEM_ADMIN'), 'System Administrator');
  assert.equal(humanizeRole('HRMO'), 'Human Resource Management Officer');
  assert.equal(humanizeRole('AO_II'), 'Administrative Officer II');
  assert.equal(humanizeRole('TEACHING_PERSONNEL'), 'Teaching Personnel');
  assert.equal(humanizeRole('NON_TEACHING_PERSONNEL'), 'Non-Teaching Personnel');
  assert.equal(humanizeRole(null), 'System / Automated');
});

test('action derivation classifies events into correct categories, severities, and outcomes', () => {
  // Login events
  const loginSuccess = deriveActionMetadata('LOGIN_SUCCESS', 'User', 'SUCCESS');
  assert.equal(loginSuccess.category, AuditCategory.AUTHENTICATION);
  assert.equal(loginSuccess.severity, AuditSeverity.INFO);
  assert.equal(loginSuccess.outcome, AuditOutcome.SUCCESS);
  assert.equal(loginSuccess.actionLabel, 'Signed in successfully');

  const loginFailed = deriveActionMetadata('LOGIN_FAILED', 'User', 'FAILED');
  assert.equal(loginFailed.category, AuditCategory.AUTHENTICATION);
  assert.equal(loginFailed.severity, AuditSeverity.WARNING);
  assert.equal(loginFailed.outcome, AuditOutcome.FAILURE);
  assert.equal(loginFailed.actionLabel, 'Sign-in failed');

  // Access denied
  const accessDenied = deriveActionMetadata('ACCESS_DENIED', 'Endpoint', 'FAILED');
  assert.equal(accessDenied.category, AuditCategory.ROLES_PERMISSIONS);
  assert.equal(accessDenied.severity, AuditSeverity.HIGH);
  assert.equal(accessDenied.outcome, AuditOutcome.DENIED);

  // Role changes
  const roleMod = deriveActionMetadata('ROLE_MODIFIED', 'User', 'SUCCESS');
  assert.equal(roleMod.category, AuditCategory.ROLES_PERMISSIONS);
  assert.equal(roleMod.severity, AuditSeverity.CRITICAL);
  assert.equal(roleMod.actionLabel, 'System role changed');

  // Service records
  const ownSr = deriveActionMetadata('SERVICE_RECORD_VIEWED', 'Personnel', 'SUCCESS');
  assert.equal(ownSr.actionLabel, 'Personnel viewed own service record');
  assert.equal(ownSr.category, AuditCategory.SENSITIVE_RECORD_ACCESS);

  const officerSr = deriveActionMetadata('SERVICE_RECORD_ACCESSED_BY_OFFICER', 'Personnel', 'SUCCESS');
  assert.equal(officerSr.actionLabel, 'Officer inspected personnel service record');
  assert.equal(officerSr.severity, AuditSeverity.NOTICE);
});

test('Asia/Manila timestamp formatting produces valid PHT representation', () => {
  const utcDate = new Date('2026-09-28T06:30:00.000Z');
  const formatted = formatManilaTimestamp(utcDate);
  assert.match(formatted, /PHT$/);
  // UTC 06:30 + 8h = 14:30 (2:30 PM)
  assert.match(formatted, /2:30:00/);
});

test('tamper-evidence hashing is deterministic and detects field tampering', () => {
  const hash1 = computeRecordHash(
    '2026-09-28T06:00:00.000Z',
    'LOGIN_SUCCESS',
    'Authentication',
    'SUCCESS',
    1,
    'admin@deped.gov.ph',
    'User',
    1,
    { authenticatedRole: 'SYSTEM_ADMIN' },
    'GENESIS'
  );

  const hash2 = computeRecordHash(
    '2026-09-28T06:00:00.000Z',
    'LOGIN_SUCCESS',
    'Authentication',
    'SUCCESS',
    1,
    'admin@deped.gov.ph',
    'User',
    1,
    { authenticatedRole: 'SYSTEM_ADMIN' },
    'GENESIS'
  );

  assert.equal(hash1, hash2, 'identical inputs produce identical hash');

  const reorderedHash = computeRecordHash(
    '2026-09-28T06:00:00.000Z', 'LOGIN_SUCCESS', 'Authentication', 'SUCCESS', 1,
    'admin@deped.gov.ph', 'User', 1,
    { z: 'last', authenticatedRole: 'SYSTEM_ADMIN', a: 'first' }, 'GENESIS'
  );
  const reorderedHash2 = computeRecordHash(
    '2026-09-28T06:00:00.000Z', 'LOGIN_SUCCESS', 'Authentication', 'SUCCESS', 1,
    'admin@deped.gov.ph', 'User', 1,
    { a: 'first', authenticatedRole: 'SYSTEM_ADMIN', z: 'last' }, 'GENESIS'
  );
  assert.equal(reorderedHash, reorderedHash2, 'JSON object key order does not affect integrity checks');

  // Tampered payload
  const tamperedHash = computeRecordHash(
    '2026-09-28T06:00:00.000Z',
    'LOGIN_SUCCESS',
    'Authentication',
    'SUCCESS',
    1,
    'admin@deped.gov.ph',
    'User',
    1,
    { authenticatedRole: 'TEACHING_PERSONNEL' }, // tampered!
    'GENESIS'
  );

  assert.notEqual(hash1, tamperedHash, 'tampered details produce a different hash');
});

test('mapToCanonicalAuditEvent conservatively marks missing historical fields as UNKNOWN', () => {
  const legacyRow = {
    id: 99,
    entityType: 'User',
    entityId: 5,
    action: 'LOGIN_SUCCESS',
    detailsJson: { role: 'SYSTEM_ADMIN' },
    userId: 5,
    ipAddress: null,
    userAgent: null,
    status: 'SUCCESS',
    timestamp: new Date('2025-01-01T00:00:00Z'),
    user: null, // missing relation
  };

  const canonical = mapToCanonicalAuditEvent(legacyRow);

  assert.equal(canonical.id, 99);
  assert.equal(canonical.actorRole, 'UNKNOWN');
  assert.equal(canonical.requestId, null);
  assert.equal(canonical.category, AuditCategory.AUTHENTICATION);
  assert.equal(canonical.actionLabel, 'Signed in successfully');
  assert.equal(canonical.recordHash, null, 'legacy records are not falsely presented as cryptographically verified');
});

test('audit route guards: mutations (POST, PUT, DELETE) are refused as immutable', () => {
  const router = auditRoutes;
  const immutabilityLayer = router.stack.find(s => s.route?.path === '/audit-logs*');
  assert.ok(immutabilityLayer, 'immutability layer exists on router');
  const handler = immutabilityLayer.route.stack[0].handle;

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    let statusSent = 0;
    let responseBody = null;
    let nextCalled = false;

    const mockRes = {
      status(code) { statusSent = code; return this; },
      json(body) { responseBody = body; return this; },
    };
    const mockReq = { method, url: '/audit-logs/1' };

    handler(mockReq, mockRes, () => { nextCalled = true; });

    assert.equal(statusSent, 405, `${method} must return 405 Method Not Allowed`);
    assert.equal(responseBody.code, 'AUDIT_RECORD_IMMUTABLE');
    assert.equal(nextCalled, false, 'handler must stop execution');
  }
});
