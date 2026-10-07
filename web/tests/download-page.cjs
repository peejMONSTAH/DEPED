const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const src = rel => fs.readFileSync(path.join(__dirname, '../src', rel), 'utf8');

test('the download page is public and linked from the login page', () => {
  const app = src('App.tsx');
  assert.match(app, /<Route path="\/download" element=\{<DownloadPage \/>\} \/>/);
  assert.doesNotMatch(app, /RequireAuth[^\n]*\n?[^\n]*DownloadPage/, 'no sign-in needed');
  assert.match(src('pages/Login.tsx'), /<Link to="\/download"[^>]*>Get the Android app<\/Link>/);
});

test('the page offers the APK link, the local QR and a web fallback, and collects nothing', () => {
  const s = src('pages/Download.tsx');
  assert.match(s, /APK_URL = 'https:\/\/www\.mediafire\.com\/file\/eg5ginw247u0h4m\/Digital201-v1\.1\.1-20261005b\.apk\/file'/);
  assert.match(s, /Download Android APK/);
  assert.match(s, /src="\/brand\/digital201-apk-qr\.svg"/);
  assert.match(s, /alt="QR code that opens the Digital 201 Android APK download"/);
  assert.match(s, /Scan to download on your phone\./);
  assert.match(s, /to="\/login"[^>]*>Continue on the web/);
  assert.doesNotMatch(s, /<form|<input|type="email"|type="tel"/, 'no phone or email collection');
  assert.doesNotMatch(s, /Google Play|App Store/);
  assert.ok(fs.existsSync(path.join(__dirname, '../public/brand/digital201-apk-qr.svg')));
});

test('unverified release details are not shown', () => {
  const s = src('pages/Download.tsx');
  assert.doesNotMatch(s, /Version \d|\bMB\b|Android \d+|Released/i, 'version, size, date and minimum Android are omitted until verified');
});

test('the QR asset lives under /brand, not a folder that would shadow the /download route in nginx', () => {
  assert.equal(fs.existsSync(path.join(__dirname, '../public/download')), false);
});
