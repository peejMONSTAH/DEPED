import { Prisma, UserRole } from '@prisma/client';
import prisma from '../config/prisma';

/**
 * Organizational scope: whose records an account may see or act on.
 *
 * Every rule about "which records belong to my station" lives here. Controllers
 * never rebuild the predicate. Collection queries spread the Prisma filters
 * below; single-record checks run the *same* filter against one id. A list and
 * its detail endpoint therefore cannot disagree, so no record can be opened by
 * id that would not also appear in the list.
 *
 *   SYSTEM_ADMIN, HRMO    DIVISION  every record
 *   AO_II                 STATION   teaching and non-teaching personnel whose
 *                                   school is the officer's own school, plus the
 *                                   officer's own record (read only). With no
 *                                   school on file: own record only.
 *   TEACHING_PERSONNEL,   SELF      their own record only
 *   NON_TEACHING_PERSONNEL
 *   anything else         NONE      nothing
 *
 * An AO II's station is personnel.school of the officer's own record, read from
 * the database on every request. It is never taken from the client, never
 * widened to the district, and never partially matched: the column is citext,
 * so the comparison is a case-insensitive exact `=`, and the database
 * canonicalises whitespace on write (migration 202609230001). Prisma's
 * `mode: 'insensitive'` must not be used here; it compiles to ILIKE, where `_`
 * and `%` in a station name are wildcards.
 */

/** Personnel an AO II may act on. Other roles are division-level and never in station scope. */
export const STATION_SUBJECT_ROLES: UserRole[] = [
  UserRole.TEACHING_PERSONNEL,
  UserRole.NON_TEACHING_PERSONNEL,
];

const DIVISION_ROLES: string[] = [UserRole.SYSTEM_ADMIN, UserRole.HRMO];

export type ScopeKind = 'DIVISION' | 'STATION' | 'SELF' | 'NONE';

/**
 * `read`: records the account may open. For an AO II this includes their own record.
 * `review`: records the account may act on as a reviewer (validate, verify, register,
 * distribute credentials). Never the reviewer's own record.
 */
export type ScopeAccess = 'read' | 'review';

export interface StationScope {
  kind: ScopeKind;
  /** False only for DIVISION. */
  isScoped: boolean;
  role?: string;
  /** The officer's station, whitespace-normalised. Present only for STATION. */
  school?: string;
  /** The officer's district. Used by promotion-cycle district rules; it never widens scope. */
  district?: string;
  /** The caller's own personnel record. */
  personnelId?: number;
}

export interface ScopeActor {
  userId: number;
  role?: string;
  /** Set by authenticate() from the database, never from the request. */
  personnelId?: number | null;
}

const isPositiveId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/**
 * The rule the database applies on write: collapse whitespace runs to one space,
 * trim, and treat an empty result as no station.
 */
export const normalizeStationName = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/[ \t\n\v\f\r]+/g, ' ').trim();
  return normalized || undefined;
};

/** The comparison key citext uses: normalised and case-folded. Undefined means no station. */
export const stationKey = (value: unknown): string | undefined => normalizeStationName(value)?.toLowerCase();

/** Exact, case-insensitive station equality. Never a prefix or substring test, and no station never matches. */
export const sameStation = (a: unknown, b: unknown): boolean => {
  const left = stationKey(a);
  return Boolean(left && left === stationKey(b));
};

const NO_SCOPE: StationScope = { kind: 'NONE', isScoped: true };

export const getStationScope = async (user?: ScopeActor | null): Promise<StationScope> => {
  if (!user || !isPositiveId(user.userId)) return NO_SCOPE;
  const { role } = user;

  if (role && DIVISION_ROLES.includes(role)) return { kind: 'DIVISION', isScoped: false, role };

  if (role && (STATION_SUBJECT_ROLES as string[]).includes(role)) {
    return isPositiveId(user.personnelId)
      ? { kind: 'SELF', isScoped: true, role, personnelId: user.personnelId }
      : { ...NO_SCOPE, role };
  }

  if (role === UserRole.AO_II) {
    const record = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { personnel: { select: { id: true, school: true, district: true } } },
    });
    const personnel = record?.personnel;
    if (!personnel) return { ...NO_SCOPE, role };
    const school = normalizeStationName(personnel.school);
    const district = normalizeStationName(personnel.district);
    return school
      ? { kind: 'STATION', isScoped: true, role, school, district, personnelId: personnel.id }
      : { kind: 'SELF', isScoped: true, role, district, personnelId: personnel.id };
  }

  return { ...NO_SCOPE, role };
};

/** False when an AO II has no station on file, so they can be shown an explicit error. */
export const hasStationAssignment = (scope: StationScope): boolean =>
  scope.kind === 'DIVISION' || scope.kind === 'STATION';

const subjectPersonnel: Prisma.PersonnelWhereInput = {
  user: { role: { name: { in: STATION_SUBJECT_ROLES } } },
};

/**
 * Personnel an account may read or review. Safe to spread into any Personnel
 * where-clause: DIVISION yields {}, anything unresolved matches no row.
 */
export const personnelScopeFilter = (
  scope: StationScope,
  access: ScopeAccess = 'read',
): Prisma.PersonnelWhereInput => {
  switch (scope.kind) {
    case 'DIVISION':
      return {};
    case 'STATION': {
      // Prisma drops an `undefined` condition, which would turn this into
      // "every record". The kind guarantees a school, but never rely on that.
      if (!scope.school) return { id: -1 };
      const station: Prisma.PersonnelWhereInput = {
        AND: [
          { school: { equals: scope.school } },
          subjectPersonnel,
          ...(isPositiveId(scope.personnelId) ? [{ NOT: { id: scope.personnelId } }] : []),
        ],
      };
      if (access === 'review' || !isPositiveId(scope.personnelId)) return station;
      return { OR: [{ id: scope.personnelId }, station] };
    }
    case 'SELF':
      return access === 'read' && isPositiveId(scope.personnelId) ? { id: scope.personnelId } : { id: -1 };
    default:
      return { id: -1 };
  }
};

/** The read filter, under the name the controllers already use. */
export const stationPersonnelFilter = (scope: StationScope): Prisma.PersonnelWhereInput =>
  personnelScopeFilter(scope, 'read');

export const transactionScopeFilter = (
  scope: StationScope,
  access: ScopeAccess = 'read',
): Prisma.TransactionWhereInput => {
  switch (scope.kind) {
    case 'DIVISION':
      return {};
    case 'SELF':
      return access === 'read' && isPositiveId(scope.personnelId) ? { personnelId: scope.personnelId } : { id: -1 };
    case 'STATION':
      return { personnel: personnelScopeFilter(scope, access) };
    default:
      return { id: -1 };
  }
};

export const promotionApplicationScopeFilter = (
  scope: StationScope,
  access: ScopeAccess = 'read',
): Prisma.PromotionApplicationWhereInput => {
  switch (scope.kind) {
    case 'DIVISION':
      return {};
    case 'SELF':
      return access === 'read' && isPositiveId(scope.personnelId) ? { personnelId: scope.personnelId } : { id: -1 };
    case 'STATION':
      return { personnel: personnelScopeFilter(scope, access) };
    default:
      return { id: -1 };
  }
};

/** Accounts an account may manage: those of the personnel it may review. */
export const userReviewFilter = (scope: StationScope): Prisma.UserWhereInput => {
  switch (scope.kind) {
    case 'DIVISION':
      return {};
    case 'STATION':
      return { personnel: personnelScopeFilter(scope, 'review') };
    default:
      return { id: -1 };
  }
};

/** The plantilla registry is division-level; any narrower scope sees none of it. */
export const stationPlantillaFilter = (scope: StationScope): Prisma.PlantillaItemWhereInput =>
  scope.kind === 'DIVISION' ? {} : { id: -1 };

/** Plantilla choices for account assignment. Division roles see every item;
 * an AO II sees only exact-station items, and every other scope fails closed. */
export const plantillaAssignmentScopeFilter = (scope: StationScope): Prisma.PlantillaItemWhereInput => {
  if (scope.kind === 'DIVISION') return {};
  if (scope.kind === 'STATION' && scope.school) return { department: { equals: scope.school } };
  return { id: -1 };
};

/**
 * The single-record counterpart of personnelScopeFilter. It runs the same
 * predicate, so it cannot allow a record the list would hide. Callers load and
 * 404 missing records themselves; this answers only "is it in scope".
 */
export const personnelInScope = async (
  scope: StationScope,
  personnelId: unknown,
  access: ScopeAccess = 'read',
): Promise<boolean> => {
  if (!isPositiveId(personnelId)) return false;
  switch (scope.kind) {
    case 'DIVISION':
      return true;
    case 'SELF':
      return access === 'read' && scope.personnelId === personnelId;
    case 'STATION':
      return Boolean(await prisma.personnel.findFirst({
        where: { AND: [{ id: personnelId }, personnelScopeFilter(scope, access)] },
        select: { id: true },
      }));
    default:
      return false;
  }
};

/** The single-record counterpart of userReviewFilter. Callers allow an account's own id separately. */
export const userInScope = async (scope: StationScope, userId: unknown): Promise<boolean> => {
  if (!isPositiveId(userId)) return false;
  if (scope.kind === 'DIVISION') return true;
  if (scope.kind !== 'STATION') return false;
  return Boolean(await prisma.user.findFirst({
    where: { AND: [{ id: userId }, userReviewFilter(scope)] },
    select: { id: true },
  }));
};

export const canAccessPersonnel = async (
  user: ScopeActor | undefined | null,
  personnelId: unknown,
  access: ScopeAccess = 'read',
): Promise<boolean> => personnelInScope(await getStationScope(user), personnelId, access);

const DIVISION_WIDE_DISTRICTS = ['all', 'division_wide', 'all districts / division-wide'];

/**
 * Promotion cycles may be restricted to one district. This is a workflow rule
 * applied in addition to station scope; it never grants access on its own.
 */
export const isWithinDistrict = (scope: StationScope, district?: string | null): boolean => {
  if (scope.kind === 'DIVISION') return true;
  if (scope.kind !== 'STATION') return false;
  const cycleDistrict = normalizeStationName(district);
  if (!cycleDistrict || DIVISION_WIDE_DISTRICTS.includes(cycleDistrict.toLowerCase())) return true;
  return sameStation(scope.district, cycleDistrict);
};

/**
 * Active AO II accounts responsible for a station. Empty when the record has no
 * station: those records belong to no AO II and are routed to HRMO instead.
 */
export const stationOfficerUserIds = async (school: unknown): Promise<number[]> => {
  const station = normalizeStationName(school);
  if (!station) return [];
  const officers = await prisma.user.findMany({
    where: { accountStatus: 'ACTIVE', role: { name: UserRole.AO_II }, personnel: { school: { equals: station } } },
    select: { id: true },
  });
  return officers.map(officer => officer.id);
};
