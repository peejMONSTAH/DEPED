import { Request, Response } from 'express';
import { Prisma, UserRole } from '@prisma/client';
import prisma from '../config/prisma';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound } from '../utils/response.util';
import { recordAuditLog } from '../utils/audit.util';
import { invalidateAuthUserCache } from '../middleware/auth.middleware';
import { notifyUserNotifications } from './notifications.controller';

/**
 * Handing an administrative seat (AO II or HRMO) to someone else, e.g. when the
 * officer is promoted out of it.
 *
 * An AO II's station is the school on their own personnel record, and every
 * station-scoped list is computed from that. The successor can come from anywhere
 * in the division; taking an AO II seat moves their own record to the seat's
 * station (school and district), and from then on the station's open cases are
 * theirs: nothing else is copied or moved. The outgoing officer goes back to being
 * non-teaching staff and loses the administrative role.
 *
 * HRMO hands over AO II seats. Only a System Administrator hands over an HRMO
 * seat, as with every other grant or removal of a division-level role.
 */

const SEAT_ROLES: UserRole[] = [UserRole.AO_II, UserRole.HRMO];
const CANDIDATE_ROLES: UserRole[] = [UserRole.TEACHING_PERSONNEL, UserRole.NON_TEACHING_PERSONNEL];

const seatUserSelect = {
  id: true, email: true, accountStatus: true, roleId: true,
  role: { select: { name: true } },
  personnel: { select: { id: true, firstName: true, lastName: true, school: true, district: true, designation: true } },
} satisfies Prisma.UserSelect;
type SeatUser = Prisma.UserGetPayload<{ select: typeof seatUserSelect }>;

const fullName = (u: { email: string; personnel: { firstName: string; lastName: string } | null }) =>
  u.personnel ? `${u.personnel.firstName} ${u.personnel.lastName}`.trim() : u.email;

const canHandOver = (actorRole: string | undefined, seatRole: string) =>
  actorRole === 'SYSTEM_ADMIN' || (actorRole === 'HRMO' && seatRole === 'AO_II');

/** GET /users/seat-handover/options: who can hand over, and who could take over. */
export const seatHandoverOptions = async (req: Request, res: Response): Promise<void> => {
  const actorRole = req.user?.role;
  const seatRoles: UserRole[] = SEAT_ROLES.filter(r => canHandOver(actorRole, r));
  const [seats, candidates] = await Promise.all([
    prisma.user.findMany({
      where: { accountStatus: 'ACTIVE', role: { name: { in: seatRoles } }, personnel: { isNot: null }, NOT: { id: req.user!.userId } },
      select: seatUserSelect,
      orderBy: { email: 'asc' },
    }),
    prisma.user.findMany({
      where: {
        accountStatus: 'ACTIVE', personnel: { isNot: null },
        role: { name: { in: actorRole === 'SYSTEM_ADMIN' ? [...CANDIDATE_ROLES, UserRole.AO_II] : CANDIDATE_ROLES } },
      },
      select: seatUserSelect,
      orderBy: { email: 'asc' },
    }),
  ]);
  const shape = (u: SeatUser) => ({
    userId: u.id, name: fullName(u), role: u.role.name,
    school: u.personnel?.school ?? null, district: u.personnel?.district ?? null, designation: u.personnel?.designation ?? null,
  });
  sendSuccess(res, { seats: seats.map(shape), candidates: candidates.map(shape) });
};

/** POST /users/seat-handover { outgoingUserId, successorUserId } */
export const handOverSeat = async (req: Request, res: Response): Promise<void> => {
  const successorUserId = Number(req.body?.successorUserId);
  // The Personnel record knows the officer by personnel id; accept either.
  let outgoingUserId = Number(req.body?.outgoingUserId);
  if (!Number.isSafeInteger(outgoingUserId) && Number.isSafeInteger(Number(req.body?.outgoingPersonnelId))) {
    const holder = await prisma.personnel.findUnique({ where: { id: Number(req.body.outgoingPersonnelId) }, select: { userId: true } });
    outgoingUserId = Number(holder?.userId);
  }
  if (!Number.isSafeInteger(outgoingUserId) || !Number.isSafeInteger(successorUserId) || outgoingUserId <= 0 || successorUserId <= 0) {
    sendBadRequest(res, 'Choose the officer leaving the seat and the person taking it over.', 'HANDOVER_INPUT'); return;
  }
  if (outgoingUserId === successorUserId) { sendBadRequest(res, 'The successor must be a different person.', 'HANDOVER_SAME_PERSON'); return; }
  if (outgoingUserId === req.user!.userId) { sendForbidden(res, 'You cannot hand over your own seat. Ask another administrator.'); return; }

  const [outgoing, successor] = await Promise.all([
    prisma.user.findUnique({ where: { id: outgoingUserId }, select: seatUserSelect }),
    prisma.user.findUnique({ where: { id: successorUserId }, select: seatUserSelect }),
  ]);
  if (!outgoing || !successor) { sendNotFound(res, 'One of these accounts was not found.'); return; }

  const seatRole = outgoing.role.name;
  if (!SEAT_ROLES.includes(seatRole)) { sendBadRequest(res, 'That account does not hold an administrative seat.', 'HANDOVER_NOT_A_SEAT'); return; }
  if (!canHandOver(req.user?.role, seatRole)) {
    sendForbidden(res, seatRole === 'HRMO' ? 'Only a System Administrator can hand over an HRMO seat.' : 'Only HRMO or a System Administrator can hand over this seat.'); return;
  }
  if (successor.accountStatus !== 'ACTIVE' || !successor.personnel || !outgoing.personnel) {
    sendBadRequest(res, 'The successor needs an active account and a personnel record.', 'HANDOVER_SUCCESSOR_INACTIVE'); return;
  }
  const successorOk = CANDIDATE_ROLES.includes(successor.role.name) || (req.user?.role === 'SYSTEM_ADMIN' && successor.role.name === 'AO_II');
  if (!successorOk) { sendBadRequest(res, 'The successor must be a teaching or non-teaching staff member.', 'HANDOVER_SUCCESSOR_ROLE'); return; }
  if (seatRole === 'AO_II' && !(outgoing.personnel.school || '').trim()) {
    sendBadRequest(res, 'The outgoing officer has no station on record, so there is no station to hand over. Set their station first.', 'HANDOVER_NO_STATION'); return;
  }
  const sameStation = (successor.personnel.school || '').trim().toLowerCase() === (outgoing.personnel.school || '').trim().toLowerCase();
  const movedFrom = seatRole === 'AO_II' && !sameStation ? { school: successor.personnel.school, district: successor.personnel.district } : null;

  const [seatRoleRow, staffRoleRow] = await Promise.all([
    prisma.role.findUnique({ where: { name: seatRole } }),
    prisma.role.findUnique({ where: { name: 'NON_TEACHING_PERSONNEL' } }),
  ]);
  if (!seatRoleRow || !staffRoleRow) { sendBadRequest(res, 'The role records are missing.', 'HANDOVER_ROLES'); return; }

  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: outgoing.id }, data: { roleId: staffRoleRow.id } });
    await tx.user.update({ where: { id: successor.id }, data: { roleId: seatRoleRow.id } });
    // An AO II's station is the school on their own record, so a successor from elsewhere moves there.
    if (movedFrom) await tx.personnel.update({ where: { id: successor.personnel!.id }, data: { school: outgoing.personnel!.school, district: outgoing.personnel!.district } });
    // A role is an authorization scope: sessions issued under the old one end.
    await tx.refreshToken.updateMany({ where: { userId: { in: [outgoing.id, successor.id] }, revoked: false }, data: { revoked: true } });
  });
  invalidateAuthUserCache(outgoing.id);
  invalidateAuthUserCache(successor.id);

  const station = outgoing.personnel.school || 'the division';
  await recordAuditLog({
    entityType: 'User', entityId: successor.id, action: 'SEAT_HANDOVER',
    details: { seat: seatRole, station, outgoingUserId: outgoing.id, successorUserId: successor.id, successorMovedFrom: movedFrom },
    beforeValue: { outgoing: seatRole, successor: successor.role.name },
    afterValue: { outgoing: 'NON_TEACHING_PERSONNEL', successor: seatRole },
    targetReference: `${seatRole} seat, ${station}: ${fullName(outgoing)} to ${fullName(successor)}`,
    userId: req.user!.userId, status: 'SUCCESS',
  });
  res.locals.auditLogged = true;

  const label = seatRole === 'AO_II' ? 'AO II' : 'HRMO';
  await prisma.notification.createMany({
    data: [
      { userId: successor.id, message: `You now hold the ${label} seat for ${station}${movedFrom ? `; your station is now ${station}` : ''}. Sign in again to see your administrator workspace. Open cases for your station are now yours to review.`, type: 'INFO' as const, relatedEntityType: 'User', relatedEntityId: successor.id },
      { userId: outgoing.id, message: `Your ${label} seat for ${station} was handed over to ${fullName(successor)}. Sign in again; you continue as staff.`, type: 'INFO' as const, relatedEntityType: 'User', relatedEntityId: outgoing.id },
    ],
  });
  notifyUserNotifications([successor.id, outgoing.id]);

  sendSuccess(res, {
    seat: seatRole, station, successorMoved: Boolean(movedFrom),
    outgoing: { userId: outgoing.id, name: fullName(outgoing), nowRole: 'NON_TEACHING_PERSONNEL' },
    successor: { userId: successor.id, name: fullName(successor), nowRole: seatRole },
  }, `${fullName(successor)} now holds the ${label} seat for ${station}.`);
};

/** GET /users/seat-handover/candidates?q= : search the whole division for someone to take a seat. */
export const seatHandoverCandidates = async (req: Request, res: Response): Promise<void> => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) { sendSuccess(res, []); return; }
  const excludeUserId = Number(req.query.excludeUserId) || -1;
  const rows = await prisma.user.findMany({
    where: {
      accountStatus: 'ACTIVE', id: { not: excludeUserId },
      role: { name: { in: req.user?.role === 'SYSTEM_ADMIN' ? [...CANDIDATE_ROLES, UserRole.AO_II] : CANDIDATE_ROLES } },
      personnel: {
        is: {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { employeeId: { contains: q, mode: 'insensitive' } },
            { designation: { contains: q, mode: 'insensitive' } },
            { school: { contains: q, mode: 'insensitive' } },
          ],
        },
      },
    },
    select: seatUserSelect,
    orderBy: { email: 'asc' },
    take: 15,
  });
  sendSuccess(res, rows.map(u => ({
    userId: u.id, personnelId: u.personnel!.id, name: fullName(u), role: u.role.name,
    designation: u.personnel?.designation ?? null, school: u.personnel?.school ?? null, district: u.personnel?.district ?? null,
  })));
};
