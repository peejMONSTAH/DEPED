/**
 * Read-only review of station assignments. Run after `prisma migrate deploy`.
 *
 * AO II visibility is resolved from personnel.school alone (src/utils/scope.util.ts):
 * an officer without a school sees only their own record, and a personnel record
 * without a school is invisible to every AO II and handled by HRMO. District
 * never widens an officer's reach. This reports both gaps before anyone notices
 * in production.
 */
import prisma from '../src/config/prisma';
import { UserRole } from '@prisma/client';

const SUBJECT_ROLES: UserRole[] = [UserRole.TEACHING_PERSONNEL, UserRole.NON_TEACHING_PERSONNEL];

const label = (value: string | null) => value ?? '(none)';

async function main() {
  const officers = await prisma.user.findMany({
    where: { role: { name: UserRole.AO_II } },
    select: { email: true, personnel: { select: { school: true, district: true } } },
    orderBy: { email: 'asc' },
  });

  console.log('\n=== AO II officers ===');
  const strandedOfficers: string[] = [];
  for (const officer of officers) {
    const school = officer.personnel?.school ?? null;
    const district = officer.personnel?.district ?? null;
    if (!school) strandedOfficers.push(officer.email);

    // citext: a plain equality is the exact, case-insensitive match authorization uses.
    const reach = school
      ? await prisma.personnel.count({
          where: { school: { equals: school }, user: { role: { name: { in: SUBJECT_ROLES } } } },
        })
      : 0;

    console.log(`  ${officer.email.padEnd(38)} school=${label(school).padEnd(46)} district=${label(district).padEnd(12)} sees ${reach} personnel`);
  }
  if (!officers.length) console.log('  (no AO II accounts)');

  const stations = await prisma.personnel.groupBy({
    by: ['school', 'district'],
    _count: { _all: true },
    orderBy: { school: 'asc' },
  });

  console.log('\n=== Personnel per station ===');
  for (const station of stations) {
    console.log(`  ${label(station.school).padEnd(46)} ${label(station.district).padEnd(12)} ${station._count._all}`);
  }

  const unassigned = await prisma.personnel.count({
    where: { school: null, user: { role: { name: { in: SUBJECT_ROLES } } } },
  });

  console.log('\n=== Attention ===');
  if (strandedOfficers.length) {
    console.log(`  ${strandedOfficers.length} AO II account(s) have no school and will see only their own record:`);
    strandedOfficers.forEach(email => console.log(`    - ${email}`));
  } else {
    console.log('  Every AO II account has a school.');
  }
  console.log(
    unassigned
      ? `  ${unassigned} teaching/non-teaching record(s) have no school: invisible to every AO II, handled by HRMO until one is assigned.`
      : '  Every teaching/non-teaching record has a school.',
  );
  console.log();
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
