/**
 * District and school filtering for the Plantilla Registry. Matching is exact
 * (case- and space-insensitive): the old substring test let "District 1" also
 * match "District 10". A plantilla item's division reads either "District 1"
 * or "SDO Koronadal City - District 1"; its department is the school name.
 *
 * This only narrows what the server already returned: GET /plantilla is
 * HRMO-only and division-scoped on the server, so no filter here can widen
 * what an account may see.
 */

export interface DistrictOption { name: string; schools: string[] }

const norm = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

export const districtOfDivision = (division: string, districts: DistrictOption[]): string | null => {
  const value = norm(division);
  const match = districts.find(d => value === norm(d.name) || value.endsWith(` - ${norm(d.name)}`));
  return match ? match.name : null;
};

/** Schools offered for the selected district; every school when no district is chosen. */
export const schoolOptionsFor = (district: string, districts: DistrictOption[]): string[] =>
  district === 'ALL'
    ? districts.flatMap(d => d.schools)
    : districts.find(d => d.name === district)?.schools ?? [];

/** A school that is not in the newly chosen district is cleared rather than silently hiding everything. */
export const schoolAfterDistrictChange = (school: string, district: string, districts: DistrictOption[]): string =>
  school === 'ALL' || schoolOptionsFor(district, districts).includes(school) ? school : 'ALL';

export const matchesLocation = (
  item: { division: string; department: string },
  filters: { district: string; school: string },
  districts: DistrictOption[],
): boolean => {
  if (filters.district !== 'ALL' && districtOfDivision(item.division, districts) !== filters.district) return false;
  if (filters.school !== 'ALL' && norm(item.department) !== norm(filters.school)) return false;
  return true;
};
