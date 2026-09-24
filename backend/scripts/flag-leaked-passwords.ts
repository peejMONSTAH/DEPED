/**
 * One-off remediation to run once, right after 202609210001_force_password_change.
 *
 * That migration defaults existing rows to must_change_password = false so the
 * deploy does not lock out anyone mid-shift. But accounts created before it still
 * hold the shared literals the admin UI used to issue (Personnel@Pass123,
 * Reset@Pass2026!). Those are the accounts actually at risk: the password is
 * known, unchanged, and now permanent unless something flags them.
 *
 * Checks each stored hash against the known literals and flags only the matches.
 * Accounts whose holder already chose their own password are left alone.
 *
 *   npx ts-node scripts/flag-leaked-passwords.ts            # report only
 *   npx ts-node scripts/flag-leaked-passwords.ts --apply    # flag the matches
 */
import prisma from '../src/config/prisma';
import { verifyPassword } from '../src/utils/hash.util';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertSafeDatabaseWrite } = require('./local-db-guard.cjs');

// Every shared literal this codebase ever issued. Add to this list, never remove:
// a password that leaked once stays leaked.
const KNOWN_ISSUED_LITERALS = [
  'Personnel@Pass123',
  'Reset@Pass2026!',
  // Published in prisma/seed.ts and scripts/set-demo-passwords.ts (public repository).
  'Admin@SecurePass123',
  'admin123',
];

const apply = process.argv.includes('--apply');

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, passwordHash: true, mustChangePassword: true, accountStatus: true },
  });

  console.log(`Checking ${users.length} account(s) against ${KNOWN_ISSUED_LITERALS.length} known issued password(s).`);

  const exposed: number[] = [];
  for (const user of users) {
    if (user.mustChangePassword) continue; // already gated
    for (const literal of KNOWN_ISSUED_LITERALS) {
      if (await verifyPassword(user.passwordHash, literal)) {
        exposed.push(user.id);
        break;
      }
    }
  }

  // Deliberately does not print which account matched which password: that would
  // put a working credential in the terminal, a log file and the shell history.
  console.log(`Accounts still holding a shared issued password: ${exposed.length}`);
  console.log(`Accounts already gated or holding their own password: ${users.length - exposed.length}`);

  if (exposed.length === 0) {
    console.log('Nothing to remediate.');
    return;
  }

  if (!apply) {
    console.log('\nReport only. Re-run with --apply to require a password change on those accounts.');
    return;
  }

  // Reporting is read-only; flagging writes, so it needs a deliberate target.
  assertSafeDatabaseWrite('flag leaked passwords');
  const result = await prisma.user.updateMany({
    where: { id: { in: exposed } },
    data: { mustChangePassword: true },
  });
  console.log(`Flagged ${result.count} account(s). They can sign in, but the API will accept nothing but change-password until each sets their own.`);
}

main()
  .catch(error => { console.error('Remediation failed:', error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
