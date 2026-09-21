/**
 * Read-only review of the station backfill. Run after `prisma migrate deploy`.
 *
 * AO II visibility is now resolved from personnel.school / personnel.district, so any
 * officer without one sees nothing, and any personnel record without one is invisible
 * to every officer. This reports both before anyone notices in production.
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
    if (!school && !district) strandedOfficers.push(officer.email);

    const reach = school
      ? await prisma.personnel.count({
          where: { school: { equals: school, mode: 'insensitive' }, user: { role: { name: { in: SUBJECT_ROLES } } } },
        })
      : district
        ? await prisma.personnel.count({
            where: { district: { equals: district, mode: 'insensitive' }, user: { role: { name: { in: SUBJECT_ROLES } } } },
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
    where: { school: null, district: null, user: { role: { name: { in: SUBJECT_ROLES } } } },
  });

  console.log('\n=== Attention ===');
  if (strandedOfficers.length) {
    console.log(`  ${strandedOfficers.length} AO II account(s) have no station and will see nothing:`);
    strandedOfficers.forEach(email => console.log(`    - ${email}`));
  } else {
    console.log('  Every AO II account has a station.');
  }
  console.log(
    unassigned
      ? `  ${unassigned} teaching/non-teaching record(s) have no station and are invisible to every AO II.`
      : '  Every teaching/non-teaching record has a station.',
  );
  console.log();
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
