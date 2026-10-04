type Identity = { firstName?: string | null; lastName?: string | null; designation?: string | null; address?: string | null; school?: string | null };
export function personnelDisplayName(person: Identity | null | undefined, role?: string): string {
  if (!person) return '';
  // Older AO II accounts were station accounts named "AO II" + the school; a real person shows their own name.
  if (role === 'AO_II' && (!person.firstName || /^AO II$/i.test(person.firstName.trim()))) {
    const school = person.school
      || person.designation?.replace(/^Administrative Officer II\s*[-–—]?\s*/i, '').trim()
      || person.address?.split(',')[0]?.trim() || person.lastName || 'School station';
    return `Administrative Officer II · ${school}`;
  }
  return [person.firstName, person.lastName].filter(Boolean).join(' ');
}
