import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { getStationScope, stationPersonnelFilter, STATION_SUBJECT_ROLES } from './scope.util';

type Actor = { userId: number; role: string; personnelId?: number | null };

/** One access policy for lists, details, requirements and document downloads. */
export async function transactionAccessFilter(user?: Actor): Promise<Prisma.TransactionWhereInput> {
  if (!user) return { id: -1 };
  if (['SYSTEM_ADMIN', 'HRMO'].includes(user.role)) return {};
  if (user.role === 'AO_II') {
    const scope = await getStationScope(user);
    return {
      OR: [
        ...(scope.personnelId ? [{ personnelId: scope.personnelId }] : []),
        { personnel: {
          AND: [stationPersonnelFilter(scope), { user: { role: { name: { in: STATION_SUBJECT_ROLES } } } }],
        } },
      ],
    };
  }
  if (['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'].includes(user.role) && user.personnelId) {
    return { personnelId: user.personnelId };
  }
  return { id: -1 };
}

export async function canAccessTransaction(user: Actor | undefined, id: number): Promise<boolean> {
  return Boolean(await prisma.transaction.findFirst({
    where: { AND: [{ id }, await transactionAccessFilter(user)] }, select: { id: true },
  }));
}
