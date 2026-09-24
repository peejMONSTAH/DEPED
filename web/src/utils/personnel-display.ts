type Identity = { firstName?: string; lastName?: string; designation?: string; address?: string; school?: string };
export function personnelDisplayName(person: Identity | null | undefined, role?: string): string {
  if (!person) return '';
  if (role === 'AO_II') {
    const school = person.school
      || person.designation?.replace(/^Administrative Officer II\s*[-–—]?\s*/i, '').trim()
      || person.address?.split(',')[0]?.trim() || person.lastName || 'School station';
    return `AO II · ${school}`;
  }
  return [person.firstName, person.lastName].filter(Boolean).join(' ');
}
