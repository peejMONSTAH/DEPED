import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { transactionAccessFilter } from '../utils/transaction-access.util';
import { getStationScope, personnelScopeFilter } from '../utils/scope.util';
import { sendSuccess } from '../utils/response.util';

export function provisioningPredicates(now: Date) {
  const usable: Prisma.UserWhereInput = {
    accountStatus: 'ACTIVE', mustChangePassword: false,
    OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
  };
  const incomplete: Prisma.UserWhereInput = { OR: [{ personnel: null }, { personnel: { profileComplete: false } }] };
  const needsAction: Prisma.UserWhereInput = { OR: [
    { accountStatus: { not: 'ACTIVE' } }, { mustChangePassword: true }, { lockedUntil: { gt: now } }, incomplete,
  ] };
  return { usable, incomplete, needsAction };
}

/** Database aggregates, independent of list page sizes. */
export async function getDashboardSummary(req: Request, res: Response) {
  const now = new Date();
  if (req.user?.role === 'SYSTEM_ADMIN') {
    const { usable, incomplete, needsAction } = provisioningPredicates(now);
    const [total, active, requiringAction, pendingRequests, pendingDistribution, passwordChanges, incompleteProfiles, roles] = await prisma.$transaction([
      prisma.user.count(), prisma.user.count({ where: usable }), prisma.user.count({ where: needsAction }),
      prisma.accountCreationRequest.count({ where: { status: 'PENDING' } }),
      prisma.user.count({ where: { accountStatus: 'PENDING' } }),
      prisma.user.count({ where: { accountStatus: 'ACTIVE', mustChangePassword: true } }),
      prisma.user.count({ where: incomplete }),
      prisma.role.findMany({ select: { name: true, _count: { select: { users: true } } } }),
    ], { isolationLevel: 'RepeatableRead' });
    sendSuccess(res, { total, active, requiringAction, pendingRequests, pendingDistribution, passwordChanges, incompleteProfiles,
      roleCounts: Object.fromEntries(roles.map(r => [r.name, r._count.users])),
    });
    return;
  }
  // Every count below runs inside the caller's scope, so a station's dashboard
  // discloses nothing about other stations' activity.
  const where = await transactionAccessFilter(req.user);
  const personnelWhere = personnelScopeFilter(await getStationScope(req.user), 'review');
  // Calendar boundaries are fixed to the division's timezone, not the host's timezone.
  const localNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const monday = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((localNow.getUTCDay() + 6) % 7));
  const start = new Date(monday.getTime() - 8 * 60 * 60 * 1000);
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  const result = await prisma.$transaction(async db => {
    const [totalTransactions, pendingQueue, approvedCount, totalPersonnel, teachingCount, nonTeachingCount] = await Promise.all([
      db.transaction.count({ where }),
      db.transaction.count({ where: { AND: [where, { status: { in: ['DRAFT', 'PENDING_VALIDATION', 'FOR_APPROVAL', 'DEFICIENCY', 'ESCALATED'] } }] } }),
      db.transaction.count({ where: { AND: [where, { status: { in: ['APPROVED', 'COMPLETED'] } }] } }),
      db.personnel.count({ where: personnelWhere }),
      db.personnel.count({ where: { AND: [personnelWhere, { user: { role: { name: 'TEACHING_PERSONNEL' } } }] } }),
      db.personnel.count({ where: { AND: [personnelWhere, { user: { role: { name: 'NON_TEACHING_PERSONNEL' } } }] } }),
    ]);
    const weeklyStats = await Promise.all(days.map(async (day, i) => {
      const dayFilter = { AND: [where, { createdAt: { gte: new Date(start.getTime() + i * 86400000), lt: new Date(start.getTime() + (i + 1) * 86400000) } }] };
      const [count, progressed] = await Promise.all([
        db.transaction.count({ where: dayFilter }),
        db.transaction.count({ where: { AND: [dayFilter, { status: { in: ['APPROVED', 'COMPLETED', 'FOR_APPROVAL'] } }] } }),
      ]);
      return { day, count, rate: count ? Math.round(progressed / count * 100) : 0 };
    }));
    return { totalTransactions, pendingQueue, approvedCount, totalPersonnel, teachingCount, nonTeachingCount, weeklyStats };
  }, { isolationLevel: 'RepeatableRead', timeout: 15000 });
  sendSuccess(res, result);
}
