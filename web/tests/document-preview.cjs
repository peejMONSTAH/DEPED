const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const axios = require('axios');

require.extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, name);

const { previewRequestPath, loadDocumentPreview } = require('../src/components/common/document-preview.ts');

test('stored personnel file URLs resolve to the authenticated endpoint, including after a fresh page load', () => {
  for (const baseUrl of ['/api/v1', 'https://api.example.test/api/v1']) {
    const client = axios.create({ baseURL: baseUrl });
    const stored = '/api/v1/personnel/documents/123/file';
    const request = previewRequestPath(stored, baseUrl);
    assert.equal(client.getUri({ url: request }), `${baseUrl}/personnel/documents/123/file`);
    assert.equal(previewRequestPath('/personnel/documents/123/file', baseUrl), '/personnel/documents/123/file');
  }
});

test('preview loads submitted PDF, PNG and JPEG bytes through the authorized client', async () => {
  for (const mime of ['application/pdf', 'image/png', 'image/jpeg']) {
    const blob = new Blob(['document bytes'], { type: mime });
    const requests = [];
    const client = { get: async (url, options) => {
      requests.push({ url, options });
      return { data: blob };
    } };
    const result = await loadDocumentPreview(client, '/api/v1/personnel/documents/123/file', '/api/v1');
    assert.equal(result.blob, blob);
    assert.equal(result.type, mime);
    assert.deepEqual(requests, [{ url: '/personnel/documents/123/file', options: { responseType: 'blob' } }]);
  }
});

test('missing, unauthorized and server failures remain visible to the viewer', async () => {
  for (const status of [401, 403, 404, 500]) {
    const failure = { response: { status } };
    await assert.rejects(loadDocumentPreview({ get: async () => { throw failure; } }, '/api/v1/personnel/documents/123/file', '/api/v1'), (error) => error === failure);
  }
});

test('new-tab token request keeps its existing relative endpoint', () => {
  const viewer = fs.readFileSync(path.join(__dirname, '../src/components/common/DocumentViewerModal.tsx'), 'utf8');
  const documents = fs.readFileSync(path.join(__dirname, '../src/pages/personnel/MyDocuments.tsx'), 'utf8');
  assert.match(viewer, /apiClient\.get\(tokenEndpoint\)/);
  assert.match(documents, /viewTokenUrl=\{`\/personnel\/documents\/\$\{previewDoc\.id\}\/view-token`\}/);
});
