import prisma from '../config/prisma';

export interface AOSchoolScope {
  isAo: boolean;
  schoolName?: string;
  districtName?: string;
  aoPersonnelId?: number;
}

const DISTRICT_1_SCHOOLS = [
  'Matulas Elementary School',
  'Morales Elementary School',
  'Salkan Elementary School',
  'Koronadal Central Elementary School 1',
  'Koronadal Central Elementary School I',
];

const DISTRICT_6_SCHOOLS = [
  'Mariano Villegas Elementary School',
  'Carpenter Hill Elementary School',
  'Mama Mapambucol Elementary School',
  'Barrio 8 Elementary School',
  'Mangga Elementary School',
  'El Gawel Elementary School',
  'Takilay Elementary School',
];

const KNOWN_SCHOOLS = [
  ...DISTRICT_1_SCHOOLS,
  ...DISTRICT_6_SCHOOLS,
  'Koronadal National Comprehensive High School',
];

export const getAOSchoolScope = async (user?: { userId: number; role?: string }): Promise<AOSchoolScope> => {
  if (!user || user.role !== 'AO_II') {
    return { isAo: false };
  }

  const aoUser = await prisma.user.findUnique({
    where: { id: user.userId },
    include: { personnel: true },
  });

  if (!aoUser || !aoUser.personnel) {
    return { isAo: true };
  }

  const p = aoUser.personnel;
  const text = `${p.firstName || ''} ${p.lastName || ''} ${p.address || ''} ${p.designation || ''} ${aoUser.email || ''}`.toLowerCase();

  let matchedSchool: string | undefined;
  let districtName: string | undefined;

  for (const s of DISTRICT_1_SCHOOLS) {
    if (text.includes(s.toLowerCase())) {
      matchedSchool = s;
      districtName = 'District 1';
      break;
    }
  }

  if (!districtName) {
    for (const s of DISTRICT_6_SCHOOLS) {
      if (text.includes(s.toLowerCase())) {
        matchedSchool = s;
        districtName = 'District 6';
        break;
      }
    }
  }

  if (!matchedSchool) {
    for (const s of KNOWN_SCHOOLS) {
      if (text.includes(s.toLowerCase())) {
        matchedSchool = s;
        break;
      }
    }
  }

  if (!districtName) {
    if (text.includes('district 1') || text.includes('district1') || text.includes('dist 1') || text.includes('dist1') || text.includes('ao1') || text.includes('ao_1')) {
      districtName = 'District 1';
    } else if (text.includes('district 6') || text.includes('district6') || text.includes('dist 6') || text.includes('dist6') || text.includes('ao6') || text.includes('ao_6')) {
      districtName = 'District 6';
    }
  }

  if (!matchedSchool && p.lastName && p.lastName !== 'Staff') {
    matchedSchool = p.lastName;
  }

  return {
    isAo: true,
    schoolName: matchedSchool,
    districtName,
    aoPersonnelId: p.id,
  };
};
