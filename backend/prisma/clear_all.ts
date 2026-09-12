import { PrismaClient, UserRole, AccountStatus } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  saltLength: 16,
};

async function main() {
  console.log('🧹 Clearing all dummy data from the database...');

  try {
    // Truncate all operational and dummy tables with CASCADE
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE 
        "validation_logs",
        "notifications",
        "compliance_checks",
        "career_history_entries",
        "uploaded_documents",
        "transactions",
        "promotion_applications",
        "promotion_cycles",
        "refresh_tokens",
        "personnel",
        "users",
        "plantilla_items",
        "requirement_templates",
        "transaction_types",
        "roles"
      CASCADE;
    `);
    console.log('✓ All dummy data and records successfully wiped.');

    console.log('🌱 Restoring essential system roles and transaction types...');

    // 1. Re-seed system roles
    const roles = [
      { name: UserRole.SYSTEM_ADMIN, description: 'Manages systems, configs, and audit logs' },
      { name: UserRole.AO_II, description: 'Administrative Officer II - validates documents' },
      { name: UserRole.HRMO, description: 'HRMO - approves transactions and configs promotion rules' },
      { name: UserRole.TEACHING_PERSONNEL, description: 'DepEd Teaching Personnel' },
      { name: UserRole.NON_TEACHING_PERSONNEL, description: 'DepEd Non-Teaching Personnel' },
    ];

    for (const r of roles) {
      await prisma.role.create({
        data: { name: r.name, description: r.description },
      });
    }
    console.log('✓ Essential system roles created.');

    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: UserRole.SYSTEM_ADMIN } });
    const aoRole = await prisma.role.findUniqueOrThrow({ where: { name: UserRole.AO_II } });
    const hrmoRole = await prisma.role.findUniqueOrThrow({ where: { name: UserRole.HRMO } });

    // 2. Re-seed basic transaction types and requirement templates
    const types = [
      {
        name: 'Promotion',
        description: 'Regular career advancement to a higher SG or position title',
        requirements: [
          { name: 'Form 212 (Personal Data Sheet)', isMandatory: true, expectedDataType: 'DOCUMENT' },
          { name: 'Latest Performance Rating (IPCR/OPCR)', isMandatory: true, expectedDataType: 'RATING' },
          { name: 'Certificate of Outstanding Accomplishments', isMandatory: false, expectedDataType: 'CERTIFICATE' },
        ],
      },
      {
        name: 'Reclassification',
        description: 'Teaching position upgrade based on educational achievement and service length',
        requirements: [
          { name: 'Transcript of Records (MA/PhD Units)', isMandatory: true, expectedDataType: 'TRANSCRIPT' },
          { name: 'Service Record', isMandatory: true, expectedDataType: 'DOCUMENT' },
          { name: 'Approved Equivalent Record Form (ERF)', isMandatory: true, expectedDataType: 'DOCUMENT' },
        ],
      },
      {
        name: 'Leave Application',
        description: 'Personal, study, maternity or sick leave applications',
        requirements: [
          { name: 'Civil Service Form No. 6 (Application for Leave)', isMandatory: true, expectedDataType: 'DOCUMENT' },
          { name: 'Medical Certificate (if applicable)', isMandatory: false, expectedDataType: 'CERTIFICATE' },
        ],
      },
      {
        name: 'Salary Adjustment',
        description: 'Step increment or adjustment implementation',
        requirements: [
          { name: 'Notice of Salary Adjustment (NOSA)', isMandatory: true, expectedDataType: 'DOCUMENT' },
          { name: 'Latest Service Record', isMandatory: true, expectedDataType: 'DOCUMENT' },
        ],
      },
    ];

    for (const t of types) {
      const createdType = await prisma.transactionType.create({
        data: { name: t.name, description: t.description },
      });

      for (const req of t.requirements) {
        await prisma.requirementTemplate.create({
          data: {
            transactionTypeId: createdType.id,
            name: req.name,
            isMandatory: req.isMandatory,
            expectedDataType: req.expectedDataType,
          },
        });
      }
    }
    console.log('✓ Transaction types and requirement templates created.');

    // 3. Create default clean administrative accounts for immediate testing
    const adminHash = await argon2.hash('Admin@SecurePass123', ARGON2_OPTIONS);
    const aoHash = await argon2.hash('AO2@SecurePass123', ARGON2_OPTIONS);
    const hrmoHash = await argon2.hash('HRMO@SecurePass123', ARGON2_OPTIONS);

    await prisma.user.create({
      data: {
        email: 'admin@deped.koronadal.gov.ph',
        passwordHash: adminHash,
        roleId: adminRole.id,
        accountStatus: AccountStatus.ACTIVE,
      },
    });

    await prisma.user.create({
      data: {
        email: 'ao2@deped.koronadal.gov.ph',
        passwordHash: aoHash,
        roleId: aoRole.id,
        accountStatus: AccountStatus.ACTIVE,
      },
    });

    await prisma.user.create({
      data: {
        email: 'hrmo@deped.koronadal.gov.ph',
        passwordHash: hrmoHash,
        roleId: hrmoRole.id,
        accountStatus: AccountStatus.ACTIVE,
      },
    });

    console.log('✓ Clean system administrative accounts created.');
    console.log('🎉 Database is completely clear of dummy personnel/transaction records and ready for fresh testing!');
  } catch (error) {
    console.error('❌ Failed to clear database:', error);
    process.exit(1);
  }
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
