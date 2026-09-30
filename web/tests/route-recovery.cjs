const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
require.extensions['.tsx'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText, name);
const { RouteErrorBoundary, RouteLoading, isPageDownloadError } = require('../src/routes/RouteContent.tsx');

test('recognises browser module failures without misclassifying application errors', () => {
  for (const message of [
    'Failed to fetch dynamically imported module: /assets/Profile-old.js',
    'Importing a module script failed.',
    'error loading dynamically imported module',
    'Loading chunk 3 failed.',
    'Unable to preload CSS for /assets/profile.css',
  ]) assert.equal(isPageDownloadError(new TypeError(message)), true, message);
  assert.equal(isPageDownloadError(new Error('Cannot read properties of undefined')), false);
});

test('download failure shows an explicit reload and unsaved-work notice, never reloads itself', () => {
  let reloads = 0;
  global.window = { location: { reload() { reloads++; } } };
  try {
    const boundary = new RouteErrorBoundary({ resetKey: '/personnel/profile', children: React.createElement('p', null, 'Profile') });
    boundary.state = { ...boundary.state, ...RouteErrorBoundary.getDerivedStateFromError(new TypeError('Failed to fetch dynamically imported module: /old.js')) };
    const html = renderToStaticMarkup(boundary.render());
    assert.match(html, /role="alert"/);
    assert.match(html, /Reload page/);
    assert.match(html, /unsaved changes/);
    assert.doesNotMatch(html, /Try again/); // React.lazy caches this rejection; remounting cannot reload it.
    assert.equal(reloads, 0);
  } finally { delete global.window; }
});

test('render failures offer retry and navigation clears an error without resetting query-only form state', () => {
  const boundary = new RouteErrorBoundary({ resetKey: '/personnel/profile', children: React.createElement('p', null, 'Profile') });
  boundary.state = { ...boundary.state, ...RouteErrorBoundary.getDerivedStateFromError(new Error('render failed')) };
  assert.match(renderToStaticMarkup(boundary.render()), /Try again/);
  assert.equal(RouteErrorBoundary.getDerivedStateFromProps({ resetKey: '/personnel/profile' }, boundary.state), null);
  const next = RouteErrorBoundary.getDerivedStateFromProps({ resetKey: '/personnel/home' }, boundary.state);
  assert.equal(next.error, null);
  boundary.state = { ...boundary.state, ...next };
  assert.equal(renderToStaticMarkup(boundary.render()), '<p>Profile</p>');
});

test('loading is announced as a status', () => {
  const html = renderToStaticMarkup(React.createElement(RouteLoading));
  assert.match(html, /role="status"/);
  assert.match(html, /Loading page/);
});
