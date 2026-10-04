/**
 * Empties every table (keeping the schema and the migration history), so the database can be
 * seeded fresh:   npm run db:reset   then   npm run prisma:seed
 *
 * Safety:
 *  - refuses a non-local host unless ALLOW_REMOTE_DB_WRITE=<that exact host> (same guard as the seed);
 *  - refuses unless CONFIRM_RESET=<database name> matches the database it is about to empty.
 * It has no passwords and creates no accounts: the seed does that, with SEED_ADMIN_PASSWORD.
 * Uploaded files in object storage are not touched; delete those separately.
 */
const path = require('path');
const { assertSafeDatabaseWrite, databaseHost } = require('./local-db-guard.cjs');
const { PrismaClient } = require('@prisma/client');

async function main() {
  assertSafeDatabaseWrite('database reset');
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  if (process.env.CONFIRM_RESET !== name) {
    throw new Error(`Refusing to empty "${name}" on ${databaseHost(url)}. Re-run with CONFIRM_RESET=${name} if that is the database you mean.`);
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const tables = (await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`).map(r => r.tablename);
    if (!tables.length) throw new Error('No tables found. Apply the migrations first (npx prisma migrate deploy).');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
    console.log(`Emptied ${tables.length} tables in "${name}" on ${databaseHost(url)}. Next: npm run prisma:seed`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
