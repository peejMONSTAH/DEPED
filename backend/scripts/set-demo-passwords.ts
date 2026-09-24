import argon2 from 'argon2';
import prisma from '../src/config/prisma';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertSafeDatabaseWrite } = require('./local-db-guard.cjs');

const QUICK_LOGIN_EMAILS = [
  // QuickRoleSwitcher
  'admin@deped.gov',
  'kces@deped.gov',
  'hrmo@deped.gov',
  'ben@deped.koronadal.gov',
  'barrio8@deped.gov',
  // Login.tsx handleQuickLogin
  'admin@deped.koronadal.gov.ph',
  'ao2_clara@deped.koronadal.gov.ph',
  'hrmo@deped.koronadal.gov.ph',
  'personnel@deped.koronadal.gov.ph',
  'nonteaching@deped.koronadal.gov.ph',
];

async function main() {
  // Demo passwords are for a local database only; there is no override.
  assertSafeDatabaseWrite('set demo passwords', { allowRemote: false });
  const hash = await argon2.hash('admin123', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
    saltLength: 16,
  });

  let updated = 0;
  for (const email of QUICK_LOGIN_EMAILS) {
    const result = await prisma.user.updateMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      data: { passwordHash: hash },
    });
    if (result.count > 0) {
      console.log(`✅ Updated: ${email}`);
      updated += result.count;
    } else {
      console.log(`⚠️  Not found: ${email}`);
    }
  }

  console.log(`\nDone. ${updated} account(s) updated to password "admin123".`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
