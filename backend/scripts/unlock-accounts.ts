import prisma from '../src/config/prisma';

async function unlockAllLockedAccounts() {
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
