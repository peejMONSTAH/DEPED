import { Prisma, UserRole } from '@prisma/client';
import prisma from '../config/prisma';

/**
 * Station scoping for AO II officers.
 *
 * Every rule about "which records belong to my station" lives here. Controllers must
 * not rebuild the predicate themselves: a list filter and its matching single-record
 * check have to agree, or an officer can open a record that never appears in a list.
 */

const STATION_SCOPED_ROLE: string = UserRole.AO_II;

/** Personnel an AO II may act on. Other roles are division-level and never in station scope. */
export const STATION_SUBJECT_ROLES: UserRole[] = [
  UserRole.TEACHING_PERSONNEL,
  UserRole.NON_TEACHING_PERSONNEL,
];

export interface StationScope {
  /** True only for roles confined to one station; division-level roles are unscoped. */
  isScoped: boolean;
  school?: string;
  district?: string;
  /** The officer's own personnel record, which they may always read. */
  personnelId?: number;
}

/** Matches no row, so an officer with no station assignment sees nothing rather than everything. */
const MATCH_NOTHING = { id: -1 };

const sameStation = (a?: string | null, b?: string | null): boolean =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

export const getStationScope = async (
  user?: { userId: number; role?: string },
): Promise<StationScope> => {
  if (!user || user.role !== STATION_SCOPED_ROLE) return { isScoped: false };

  const record = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { personnel: { select: { id: true, school: true, district: true } } },
  });

  const personnel = record?.personnel;
  return {
    isScoped: true,
    school: personnel?.school?.trim() || undefined,
    district: personnel?.district?.trim() || undefined,
    personnelId: personnel?.id,
  };
};

/** False when a scoped officer has no station on file and so can be shown an explicit error. */
export const hasStationAssignment = (scope: StationScope): boolean =>
  !scope.isScoped || Boolean(scope.school || scope.district);

/** Safe to spread into any Personnel where-clause: unscoped yields {}, unassigned yields no rows. */
export const stationPersonnelFilter = (scope: StationScope): Prisma.PersonnelWhereInput => {
  if (!scope.isScoped) return {};
  const own: Prisma.PersonnelWhereInput[] = scope.personnelId ? [{ id: scope.personnelId }] : [];

  if (scope.school) {
    return { OR: [...own, { school: { equals: scope.school, mode: 'insensitive' } }] };
  }
  if (scope.district) {
    return { OR: [...own, { district: { equals: scope.district, mode: 'insensitive' } }] };
  }
  return scope.personnelId ? { id: scope.personnelId } : MATCH_NOTHING;
};

export const stationPlantillaFilter = (scope: StationScope): Prisma.PlantillaItemWhereInput => {
  if (!scope.isScoped) return {};
  if (scope.school) return { department: { equals: scope.school, mode: 'insensitive' } };
  if (scope.district) return { division: { equals: scope.district, mode: 'insensitive' } };
  return MATCH_NOTHING;
};

/** The single-record counterpart of stationPersonnelFilter. */
export const isWithinStation = (
  scope: StationScope,
  personnel?: { id: number; school?: string | null; district?: string | null } | null,
): boolean => {
  if (!scope.isScoped) return true;
  if (!personnel) return false;
  if (scope.personnelId && scope.personnelId === personnel.id) return true;
  if (scope.school) return sameStation(personnel.school, scope.school);
  if (scope.district) return sameStation(personnel.district, scope.district);
  return false;
};

/** Promotion cycles are opened per district; an unassigned officer never matches one. */
export const isWithinDistrict = (scope: StationScope, district?: string | null): boolean => {
  if (!scope.isScoped) return true;
  if (!district || district === 'ALL' || district === 'DIVISION_WIDE') return true;
  return sameStation(scope.district, district);
};
