require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderTransactionalEmail } = require('../src/services/email.service');

const base = { recipientEmail: 'a@qa.test', recipientName: 'Liza <b>', subject: 's', heading: 'H', message: 'Line one\nLine two' };

test('every email uses one escaped, phone-friendly layout with no scripts or images', () => {
  const html = renderTransactionalEmail(base);
  assert.match(html, /Dear Liza &lt;b&gt;,/);
  assert.match(html, /Line one<br>Line two/);
  assert.match(html, /max-width:600px/);
  assert.doesNotMatch(html, /<script|<img|linear-gradient|font-size:(9|10|11)px/);
  assert.match(html, /DepEd Schools Division of Koronadal City/);
});

test('security notices are labelled as account security, not as an update', () => {
  assert.match(renderTransactionalEmail({ ...base, subject: 'New sign-in to your Digital 201 account', heading: 'New device signed in' }), />Account security</);
  assert.match(renderTransactionalEmail({ ...base, tone: 'action' }), />Action needed</);
});

test('a sign-in code is shown on its own, and details, items and credentials render when given', () => {
  const html = renderTransactionalEmail({ ...base, code: '424242', details: [{ label: 'Device', value: 'Chrome on Windows' }],
    items: [{ name: 'Oath of Office', note: 'Page 2 unsigned' }], credentials: { username: 'u@qa.test', initialPassword: 'P@ss' }, actionUrl: 'https://x.test/a?b=1&c=2' });
  assert.match(html, /letter-spacing:8px;[^>]*>424242</);
  assert.match(html, />Chrome on Windows</);
  assert.match(html, />Oath of Office<[\s\S]*Page 2 unsigned/);
  assert.match(html, /Temporary password/);
  assert.match(html, /href="https:\/\/x\.test\/a\?b=1&amp;c=2"/);
});
