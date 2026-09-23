const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

/**
 * Historically, a personnel upload that failed Google Document AI OCR crashed the
 * entire backend process, not just that one request. The controller's own
 * try/catch around `extractPdsWithDocumentAi` caught the awaited rejection
 * and logged a warning correctly, but the underlying gRPC/auth client
 * schedules background work (token refresh, keepalive) outside of that
 * promise chain; when it rejected with no handler, Node's default behaviour
 * is to crash the whole process. Every other request in flight — including
 * an unrelated user clicking "Submit Transaction to AO II" moments later —
 * then hit a dead server and looked like it silently did nothing, until the
 * platform restarted the process.
 *
 * This spawns a real child process, wires the same `unhandledRejection`
 * guard as src/index.ts, fires a background unhandled rejection, and asserts the process is still alive and able to
 * do work afterward instead of being torn down by Node's default handling.
 */
test('an unhandled background rejection no longer kills the process', async () => {
  const script = `
    process.on('unhandledRejection', (reason) => {
      console.error('handled:', reason && reason.message);
    });
    process.on('uncaughtException', (error) => {
      console.error('handled:', error && error.message);
    });
    (async () => {
      throw new Error('Could not load the default credentials.');
    })();
    setTimeout(() => {
      console.log('STILL_ALIVE');
      process.exit(0);
    }, 200);
  `;
  const child = spawn(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..') });
  let stdout = '';
  child.stdout.on('data', d => { stdout += d; });
  const exitCode = await new Promise(resolve => child.on('exit', resolve));
  assert.equal(exitCode, 0, 'the process must not be torn down by an unhandled rejection');
  assert.match(stdout, /STILL_ALIVE/, 'code scheduled after the rejection must still run');
});

test('without the guard, the same rejection would have killed the process (sanity check)', async () => {
  const script = `
    (async () => {
      throw new Error('Could not load the default credentials.');
    })();
    setTimeout(() => {
      console.log('STILL_ALIVE');
      process.exit(0);
    }, 200);
  `;
  const child = spawn(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..') });
  let stdout = '';
  child.stdout.on('data', d => { stdout += d; });
  const exitCode = await new Promise(resolve => child.on('exit', resolve));
  assert.notEqual(exitCode, 0, 'Node\'s default behaviour for an unhandled rejection is to crash — proving the guard is what fixes this, not incidental behaviour');
  assert.doesNotMatch(stdout, /STILL_ALIVE/);
});
