/**
 * Refuses database-writing developer tasks (seed, demo passwords, migrate dev,
 * maintenance scripts) unless DATABASE_URL points at a local database.
 *
 * backend/.env has pointed at the hosted production database, so a routine
 * `npm run seed` or `prisma migrate dev` (which can offer to RESET the schema)
 * would have run against live data. A deliberate run against a remote host is
 * still possible, but only by naming that exact host:
 *
 *   ALLOW_REMOTE_DB_WRITE=<hostname> npm run seed
 *
 * Tasks created with { allowRemote: false } (demo passwords) never run remotely.
 *
 * Usage as a CLI (for npm scripts):  node scripts/local-db-guard.cjs "task name"
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'database', 'db', 'postgres', 'host.docker.internal']);

const databaseHost = (url = process.env.DATABASE_URL) => {
  try {
    return new URL(String(url)).hostname.toLowerCase();
  } catch {
    return '';
  }
};

const isLocalDatabase = (url) => LOCAL_HOSTS.has(databaseHost(url));

function assertSafeDatabaseWrite(task, { allowRemote = true, env = process.env } = {}) {
  // Prisma Migrate and the seed connect through DIRECT_URL when it is set, so
  // every configured URL must be local, not just DATABASE_URL.
  const urls = [env.DATABASE_URL, env.DIRECT_URL].filter(Boolean);
  if (!urls.length) throw new Error(`Refusing to run "${task}": DATABASE_URL is missing.`);
  for (const url of urls) assertHostAllowed(task, databaseHost(url), allowRemote, env);
}

function assertHostAllowed(task, host, allowRemote, env) {
  if (!host) throw new Error(`Refusing to run "${task}": a database URL is malformed.`);
  if (LOCAL_HOSTS.has(host)) return;
  if (allowRemote && env.ALLOW_REMOTE_DB_WRITE && env.ALLOW_REMOTE_DB_WRITE.toLowerCase() === host) return;
  throw new Error(
    `Refusing to run "${task}" against the remote database at ${host}. ` +
    (allowRemote
      ? `Point DATABASE_URL at a local or test database, or, if you really mean this host, set ALLOW_REMOTE_DB_WRITE=${host}.`
      : 'This task is for local development only and never runs against a remote database.'),
  );
}

module.exports = { assertSafeDatabaseWrite, databaseHost, isLocalDatabase, LOCAL_HOSTS };

if (require.main === module) {
  try {
    assertSafeDatabaseWrite(process.argv[2] || 'this task');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
