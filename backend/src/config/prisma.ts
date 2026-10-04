import { PrismaClient } from '@prisma/client';
import { nameCaseMiddleware } from '../utils/name-case.util';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Prevent multiple Prisma instances in dev (Next.js HMR style)
const prisma = global.__prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Applied once: the client is reused across reloads in development.
if (!global.__prisma) prisma.$use(nameCaseMiddleware);

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export default prisma;
