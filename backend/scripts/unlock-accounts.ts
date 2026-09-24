import prisma from '../src/config/prisma';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertSafeDatabaseWrite } = require('./local-db-guard.cjs');

async function unlockAllLockedAccounts() {
  assertSafeDatabaseWrite('unlock all locked accounts');
  const result = await prisma.user.updateMany({
    where: { accountStatus: 'LOCKED' },
    data: {
      accountStatus: 'ACTIVE',
      lockedUntil: null,
      failedLoginAttempts: 0,
    },
  });
  console.log(`✅ Unlocked ${result.count} account(s).`);
  await prisma.$disconnect();
}

unlockAllLockedAccounts().catch((e) => {
  console.error(e);
  process.exit(1);
});
