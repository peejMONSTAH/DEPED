// Gives one integration test file its own database on the server DATABASE_URL
// points at, so files can run in parallel (as CI does) without seeing each
// other's rows. Call before any Prisma client is created: it repoints
// DATABASE_URL/DIRECT_URL at the isolated database.
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

module.exports = function isolatedDatabase(prefix, client) {
  const base = new URL(process.env.DATABASE_URL || 'http://missing');
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(base.hostname) && base.pathname.endsWith('_test'),
    'Integration tests require an explicitly configured local database ending in _test. Never use production.');
  const name = `digital201_${prefix}_${process.pid}_test`;
  const url = new URL(base.href);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.href;
  process.env.DIRECT_URL = url.href;
  const admin = new client.PrismaClient({ datasources: { db: { url: base.href } } });
  return {
    url: url.href,
    /** Creates the database and applies every migration. */
    async create() {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
      execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
        cwd: path.resolve(__dirname, '../..'), env: process.env, stdio: 'pipe',
      });
    },
    async drop() {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.$disconnect();
    },
  };
};
