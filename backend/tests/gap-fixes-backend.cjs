require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('only AO II validates and only HRMO approves HR transactions', () => {
  const routes = read('src/routes/transactions.routes.ts');
  assert.match(routes, /router\.post\('\/:id\/validate', authorize\('AO_II'\), validateTransaction\);/);
  assert.match(routes, /router\.post\('\/:id\/approve', authorize\('HRMO'\), approveTransaction\);/);
  assert.match(read('src/controllers/transactions.controller.ts'), /if \(!\['PENDING_VALIDATION', 'DEFICIENCY'\]\.includes\(transaction\.status\)\)/, 'no phantom RETURNED status');
});

test('account requests are reviewed by the System Administrator only', () => {
  const routes = read('src/routes/users.routes.ts');
  assert.match(routes, /router\.post\('\/requests\/:id\/approve', authorize\('SYSTEM_ADMIN'\), approveAccountRequest\);/);
  assert.match(routes, /router\.post\('\/requests\/:id\/reject', authorize\('SYSTEM_ADMIN'\), rejectAccountRequest\);/);
  assert.match(read('src/controllers/users.controller.ts'), /\/\/ Only the reviewing System Administrator lists every request[^\n]*\n\s*const isSysAdmin = req\.user\?\.role === 'SYSTEM_ADMIN';/);
});

test('applicant numbers come from the application id: unique across cycles, current year', () => {
  const { applicantNumberFor } = require('../src/utils/applicant-number.util');
  assert.equal(applicantNumberFor(7, new Date('2026-09-24T00:00:00')), 'APP-2026-00007');
  assert.equal(applicantNumberFor(7, new Date('2027-01-02T00:00:00')), 'APP-2027-00007', 'the year is not fixed at 2026');
  assert.notEqual(applicantNumberFor(1), applicantNumberFor(2), 'distinct applications never share a number');
  const controller = read('src/controllers/promotions.controller.ts');
  assert.doesNotMatch(controller, /APP-2026-\$\{String\(appCount \+ 1\)/, 'no per-cycle counter that collides across cycles');
  assert.doesNotMatch(controller, /req\.body\?\.applicationCode \|\|/, 'a client-sent code is not trusted');
  assert.equal((controller.match(/applicantNumberFor\(created\.id,/g) || []).length, 2, 'both application paths number from the new row');
});

test('an undelivered email records the real reason instead of a generic message', async () => {
  const { describeSmtpFailure, EmailDeliveryError } = require('../src/services/email.service');
  assert.equal(describeSmtpFailure({ code: 'EAUTH', responseCode: 535, response: '535 5.7.8 Invalid login' }), 'SMTP delivery failed: EAUTH 535 535 5.7.8 Invalid login');
  assert.equal(describeSmtpFailure({ message: 'getaddrinfo ENOTFOUND smtp.example' }), 'SMTP delivery failed: getaddrinfo ENOTFOUND smtp.example');
  assert.ok(new EmailDeliveryError('x') instanceof Error);
  const service = read('src/services/email.service.ts');
  assert.doesNotMatch(service, /return false;/, 'failures are thrown with their reason, never swallowed as false');
  assert.match(service, /throw new EmailDeliveryError\(NOT_CONFIGURED\)/);
});

test('reserved transaction statuses are documented as unused', () => {
  assert.match(read('prisma/schema.prisma'), /ESCALATED, COMPLETED and ARCHIVED are reserved: no code sets them today/);
});
