/** Keep this registry aligned with the personnel district/school choices. */
const SCHOOLS_BY_DISTRICT: Record<string, readonly string[]> = {
  'District 1': [
    'Matulas Elementary School', 'Morales Elementary School',
    'Salkan Elementary School', 'Koronadal Central Elementary School 1',
  ],
  'District 6': [
    'Mariano Villegas Elementary School', 'Carpenter Hill Elementary School',
    'Mama Mapambucol Elementary School', 'Barrio 8 Elementary School',
    'Mangga Elementary School', 'El Gawel Elementary School',
    'Takilay Elementary School',
  ],
};

export const validPlantillaLocation = (department: unknown, division: unknown): boolean => {
  if (typeof department !== 'string' || typeof division !== 'string') return false;
  const cleanDepartment = department.trim();
  const cleanDivision = division.trim();
  if (cleanDivision === 'SDO Koronadal City' && cleanDepartment === 'Schools Division Office') return true;
  const district = cleanDivision.replace(/^SDO Koronadal City\s*-\s*/i, '');
  return (SCHOOLS_BY_DISTRICT[district] || []).includes(cleanDepartment)
    || (Boolean(SCHOOLS_BY_DISTRICT[district]) && cleanDepartment === 'All Schools in District');
};
