import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Clearing tables to allow schema change...');
  try {
    // Truncate tables with CASCADE to clean the database
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "users", "personnel", "roles", "refresh_tokens", "transactions", "plantilla_items", "transaction_types" CASCADE;`);
    console.log('✓ Tables cleared successfully.');
  } catch (error) {
    console.error('Failed to clear tables (might be because tables do not exist yet, which is fine):', error);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
