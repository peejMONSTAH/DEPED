import argon2 from 'argon2';
import { AccountStatus, UserRole } from '@prisma/client';
import prisma from '../config/prisma';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

async function main() {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('bootstrap:admin is intended for a production deployment.');
  }

  const email = required('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  const password = required('BOOTSTRAP_ADMIN_PASSWORD');
  if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters and contain upper/lowercase letters, a number, and a symbol.');
  }

  const roles = [
    [UserRole.SYSTEM_ADMIN, 'Manages systems, configuration, and audit logs'],
    [UserRole.AO_II, 'Administrative Officer II - validates documents'],
    [UserRole.HRMO, 'HRMO - approves transactions and manages promotion rules'],
    [UserRole.TEACHING_PERSONNEL, 'DepEd Teaching Personnel'],
    [UserRole.NON_TEACHING_PERSONNEL, 'DepEd Non-Teaching Personnel'],
  ] as const;

  await prisma.$transaction(async tx => {
    for (const [name, description] of roles) {
      await tx.role.upsert({ where: { name }, update: { description }, create: { name, description } });
    }

    const role = await tx.role.findUniqueOrThrow({ where: { name: UserRole.SYSTEM_ADMIN } });
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`Administrator ${email} already exists; no password was changed.`);
      return;
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
    await tx.user.create({
      data: {
        email,
        passwordHash,
        roleId: role.id,
        accountStatus: AccountStatus.ACTIVE,
        mustChangePassword: true,
      },
    });
    console.log(`Created production system administrator ${email}.`);
  });
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
