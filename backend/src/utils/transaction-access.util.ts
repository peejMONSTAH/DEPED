import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { getStationScope, transactionScopeFilter, ScopeAccess, ScopeActor } from './scope.util';

/** One access policy for lists, details, requirements and document downloads. */
export async function transactionAccessFilter(
  user?: ScopeActor | null,
  access: ScopeAccess = 'read',
): Promise<Prisma.TransactionWhereInput> {
  return transactionScopeFilter(await getStationScope(user), access);
}

export async function canAccessTransaction(
  user: ScopeActor | undefined | null,
  id: number,
  access: ScopeAccess = 'read',
): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  return Boolean(await prisma.transaction.findFirst({
    where: { AND: [{ id }, await transactionAccessFilter(user, access)] }, select: { id: true },
  }));
}
