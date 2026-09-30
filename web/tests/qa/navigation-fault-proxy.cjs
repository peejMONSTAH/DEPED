// Local browser rehearsal only. Proxies the existing synthetic test bench.
// Start: node web/tests/qa/navigation-fault-proxy.cjs
// stdin: fail ProfileCompletion | delay CareerRecord 10000 | crash ProfileCompletion | normal
// Requests and HTTP failures are logged without query strings, credentials or bodies.
const http = require('node:http');
const readline = require('node:readline');
let fault = null;
readline.createInterface({ input: process.stdin }).on('line', line => {
  const [mode, chunk, ms] = line.trim().split(/\s+/);
  if (mode === 'normal') fault = null;
  else if (['fail', 'delay', 'crash'].includes(mode) && /^[A-Za-z]+$/.test(chunk)) fault = { mode, chunk, ms: Math.min(30000, Number(ms) || 10000) };
  else return console.log('Unknown command');
  console.log('FAULT', fault || 'normal');
});
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const match = fault && pathname.startsWith(`/assets/${fault.chunk}-`) && pathname.endsWith('.js') ? { ...fault } : null;
  if (match?.mode === 'fail') {
    console.log('INJECT 404', pathname);
    res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); return res.end('Missing old build chunk');
  }
  if (match?.mode === 'crash') {
    console.log('INJECT render exception', pathname);
    res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
    return res.end(`export function ${match.chunk}(){throw new Error('Synthetic route rendering failure')}`);
  }
  const forward = () => {
    const upstream = http.request({ hostname: '127.0.0.1', port: 5099, path: req.url, method: req.method, headers: { ...req.headers, host: '127.0.0.1:5099' } }, response => {
      if (response.statusCode >= 400 || pathname.endsWith('.js')) console.log(response.statusCode, pathname);
      res.writeHead(response.statusCode, { ...response.headers, 'cache-control': 'no-store' });
      response.pipe(res);
    });
    upstream.on('error', error => { console.log('UPSTREAM FAILED', pathname, error.code); res.writeHead(502); res.end('Local test bench unavailable'); });
    req.pipe(upstream);
    res.on('close', () => upstream.destroy());
  };
  if (match?.mode === 'delay') { console.log('DELAY', match.ms, pathname); setTimeout(forward, match.ms); }
  else forward();
}).listen(5101, '127.0.0.1', () => console.log('Navigation rehearsal proxy: http://127.0.0.1:5101/login'));
