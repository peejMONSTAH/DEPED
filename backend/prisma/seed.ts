import { PrismaClient, UserRole, PersonnelStatus, AccountStatus, Gender, CivilStatus } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Roles
  const roles = [
    { name: UserRole.SYSTEM_ADMIN, description: 'Manages systems, configs, and audit logs' },
    { name: UserRole.AO_II, description: 'Administrative Officer II - validates documents' },
    { name: UserRole.HRMO, description: 'HRMO - approves transactions and configs promotion rules' },
    { name: UserRole.TEACHING_PERSONNEL, description: 'DepEd Teaching Personnel' },
    { name: UserRole.NON_TEACHING_PERSONNEL, description: 'DepEd Non-Teaching Personnel' },
  ];

  for (const r of roles) {
    await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: { name: r.name, description: r.description },
    });
  }
  console.log('✓ Roles seeded successfully.');

  // Fetch created roles to get their IDs
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: UserRole.SYSTEM_ADMIN } });
  const aoRole = await prisma.role.findUniqueOrThrow({ where: { name: UserRole.AO_II } });
  const hrmoRole = await prisma.role.findUniqueOrThrow({ where: { name: UserRole.HRMO } });
  const teachingRole = await prisma.role.findUniqueOrThrow({ where: { name: UserRole.TEACHING_PERSONNEL } });
  const nonTeachingRole = await prisma.role.findUniqueOrThrow({ where: { name: UserRole.NON_TEACHING_PERSONNEL } });

  // 2. Mock Admin User
  const adminHash = await argon2.hash('Admin@SecurePass123', ARGON2_OPTIONS);
  await prisma.user.upsert({
    where: { email: 'admin@deped.koronadal.gov.ph' },
    update: {},
    create: {
      email: 'admin@deped.koronadal.gov.ph',
      passwordHash: adminHash,
      roleId: adminRole.id,
      accountStatus: AccountStatus.ACTIVE,
    },
  });

  // 3. Plantilla Catalog (Unoccupied, ready for official personnel appointment)
  await prisma.plantillaItem.upsert({
    where: { itemNumber: 'P-12345-09' },
    update: {},
    create: {
      itemNumber: 'P-12345-09',
      positionTitle: 'Teacher I',
      salaryGrade: 11,
      department: 'Elementary Teaching Division',
      division: 'CSD Koronadal City',
      isOccupied: false,
    },
  });

  await prisma.plantillaItem.upsert({
    where: { itemNumber: 'P-55442-01' },
    update: {},
    create: {
      itemNumber: 'P-55442-01',
      positionTitle: 'Registrar I',
      salaryGrade: 11,
      department: 'Records Office',
      division: 'CSD Koronadal City',
      isOccupied: false,
    },
  });

  // 6. Transaction Types
  const types = [
    { name: 'Promotion', description: 'Regular career advancement to a higher SG or position title' },
    { name: 'Reclassification', description: 'Teaching position upgrade based on educational achievement and service length' },
    { name: 'Leave Application', description: 'Personal, study, maternity or sick leave applications' },
    { name: 'Salary Adjustment', description: 'Step increment or adjustment implementation' },
  ];

  for (const t of types) {
    await prisma.transactionType.upsert({
      where: { name: t.name },
      update: { description: t.description },
      create: { name: t.name, description: t.description },
    });
  }

  // 7. Seed Active & Upcoming Promotion Cycles
  const existingCycle = await prisma.promotionCycle.findFirst({ where: { name: { contains: '2026 Regular Promotion' } } });
  if (!existingCycle) {
    await prisma.promotionCycle.create({
      data: {
        name: '2026 Regular Promotion & Vacancy Cycle (Master Teacher I, Head Teacher & Administrative Positions)',
        type: 'NATURAL_VACANCY',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-09-30'),
        status: 'ACTIVE',
        rulesConfigurationJson: { minComplianceScore: 80, depedOrder: 'DO 7 s. 2023' },
      },
    });

    await prisma.promotionCycle.create({
      data: {
        name: '2026 ERF & Reclassification Cycle (Teacher II to Teacher III / Master Teacher)',
        type: 'RECLASSIFICATION',
        startDate: new Date('2026-10-01'),
        endDate: new Date('2026-11-30'),
        status: 'PLANNING',
        rulesConfigurationJson: { minComplianceScore: 85, depedOrder: 'DO 19 & 24 s. 2025' },
      },
    });
    console.log('✓ Active & Upcoming Promotion Cycles seeded successfully.');
  }

  console.log('🌱 Seeding process complete!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
