const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, name);

const { PreviewController, describePreviewError } = require('../src/components/common/document-preview.ts');

/** Fake object URLs that record every create and revoke. */
const fakeUrls = () => {
  let n = 0;
  const created = [];
  const revoked = [];
  return {
    created, revoked,
    create: blob => { const url = `blob:test/${++n}`; created.push({ url, blob }); return url; },
    revoke: url => revoked.push(url),
  };
};

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const doc = (label, type = 'application/pdf') => ({ blob: new Blob([label], { type }), type });

test('a successful preview leaves the loading state and publishes the blob URL', async () => {
  const urls = fakeUrls();
  const states = [];
  const c = new PreviewController(s => states.push(s), urls);
  await c.load(async () => doc('a'));
  assert.deepEqual(states.map(s => s.status), ['loading', 'ready']);
  assert.equal(states.at(-1).url, 'blob:test/1');
  assert.equal(states.at(-1).type, 'application/pdf');
});

test('PDF, PNG and JPEG previews all resolve to ready', async () => {
  for (const type of ['application/pdf', 'image/png', 'image/jpeg']) {
    let last;
    const c = new PreviewController(s => { last = s; }, fakeUrls());
    await c.load(async () => doc('x', type));
    assert.equal(last.status, 'ready');
    assert.equal(last.type, type);
  }
});

test('an API failure shows a retryable error, clears loading, and retry succeeds', async () => {
  const urls = fakeUrls();
  let last;
  const c = new PreviewController(s => { last = s; }, urls);
  await c.load(async () => { throw { response: { status: 500 } }; });
  assert.equal(last.status, 'error');
  assert.equal(last.url, null);
  assert.match(last.error, /Failed to load document preview/);
  await c.load(async () => doc('retry'));
  assert.equal(last.status, 'ready');
  assert.equal(last.error, null);
});

test('errors are specific and never echo the request URL or storage path', () => {
  assert.match(describePreviewError({ response: { status: 401 } }), /Session expired/);
  assert.match(describePreviewError({ response: { status: 403 } }), /authorization/);
  assert.match(describePreviewError({ response: { status: 404 } }), /unavailable/);
  assert.match(describePreviewError({ code: 'ECONNABORTED' }), /too long/);
  const leaky = describePreviewError({ response: { status: 500, data: { message: 'ENOENT uploads/personnel/12/secret.pdf' } } });
  assert.doesNotMatch(leaky, /uploads|secret/);
});

test('rapidly switching documents never shows a stale preview and aborts the superseded request', async () => {
  const urls = fakeUrls();
  const states = [];
  const c = new PreviewController(s => states.push(s), urls);
  const first = deferred();
  const signals = [];
  const firstLoad = c.load(signal => { signals.push(signal); return first.promise; });
  const secondLoad = c.load(async signal => { signals.push(signal); return doc('second'); });
  await secondLoad;
  first.resolve(doc('first'));
  await firstLoad;
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  assert.equal(states.at(-1).status, 'ready');
  assert.equal(urls.created.length, 1, 'the stale response must not even create a blob URL');
  assert.equal(await urls.created[0].blob.text(), 'second');
});

test('a stale failure after switching does not overwrite the current preview', async () => {
  const states = [];
  const c = new PreviewController(s => states.push(s), fakeUrls());
  const first = deferred();
  const firstLoad = c.load(() => first.promise);
  await c.load(async () => doc('second'));
  first.reject({ response: { status: 500 } });
  await firstLoad;
  assert.equal(states.at(-1).status, 'ready');
});

test('the previous preview stays visible while the next one loads, then is revoked exactly once', async () => {
  const urls = fakeUrls();
  const states = [];
  const c = new PreviewController(s => states.push(s), urls);
  await c.load(async () => doc('a'));
  const next = deferred();
  const loading = c.load(() => next.promise);
  assert.equal(states.at(-1).status, 'loading');
  assert.equal(states.at(-1).url, 'blob:test/1', 'no blank viewport between documents');
  assert.deepEqual(urls.revoked, []);
  next.resolve(doc('b'));
  await loading;
  assert.equal(states.at(-1).url, 'blob:test/2');
  assert.deepEqual(urls.revoked, ['blob:test/1']);
});

test('closing during loading does not update unmounted state and revokes every URL once', async () => {
  const urls = fakeUrls();
  const states = [];
  const c = new PreviewController(s => states.push(s), urls);
  await c.load(async () => doc('a'));
  const pending = deferred();
  let signal;
  const loading = c.load(s => { signal = s; return pending.promise; });
  c.dispose();
  const publishedAtClose = states.length;
  pending.resolve(doc('late'));
  await loading;
  assert.equal(signal.aborted, true);
  assert.equal(states.length, publishedAtClose, 'no state published after dispose');
  assert.equal(urls.created.length, 1);
  assert.deepEqual(urls.revoked, ['blob:test/1']);
  c.dispose();
  c.clear();
  await c.load(async () => doc('after'));
  assert.deepEqual(urls.revoked, ['blob:test/1'], 'repeated cleanup must not revoke twice');
  assert.equal(states.length, publishedAtClose);
});

test('publishing a blob URL cannot restart the fetch (the old reload loop)', async () => {
  const modal = fs.readFileSync(require.resolve('../src/pages/admin/AnnexCVerificationModal.tsx'), 'utf8');
  assert.match(modal, /\}, \[activeDocId, retryNonce\]\);/);
  assert.doesNotMatch(modal, /cleanBlobUrl|\[blobUrl\]/);
  assert.match(modal, /previewRequestOptions\(signal\)/);
});
