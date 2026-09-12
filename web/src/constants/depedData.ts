// Official DepEd Region XII (SOCCSKSARGEN) & City Schools Division of Koronadal Data

export const TEACHING_POSITIONS = [
  'Teacher I',
  'Teacher II',
  'Teacher III',
  'Teacher IV',
  'Teacher V',
  'Teacher VI',
  'Teacher VII',
  'Master Teacher I',
  'Master Teacher II',
  'Master Teacher III',
  'Master Teacher IV',
  'Master Teacher V',
  'Special Education (SPED) Teacher I',
  'Special Education (SPED) Teacher II',
  'Special Education (SPED) Teacher III',
  'Special Science Teacher I',
  'Head Teacher I',
  'Head Teacher II',
  'Head Teacher III',
  'Head Teacher IV',
  'Head Teacher V',
  'Head Teacher VI',
  'Assistant Principal I',
  'Assistant Principal II',
  'School Principal I',
  'School Principal II',
  'School Principal III',
  'School Principal IV',
];

export const NON_TEACHING_POSITIONS = [
  'Administrative Officer I',
  'Administrative Officer II (AO II / SO II)',
  'Administrative Officer II (SO II)',
  'Administrative Officer IV',
  'Administrative Officer V (HRMO)',
  'Administrative Assistant I',
  'Administrative Assistant II',
  'Administrative Assistant III',
  'Administrative Aide I',
  'Administrative Aide III',
  'Administrative Aide IV',
  'Administrative Aide VI',
  'Guidance Counselor I',
  'Guidance Counselor II',
  'Guidance Counselor III',
  'School Librarian I',
  'School Librarian II',
  'Information Technology Officer I',
  'Accountant I',
  'Accountant II',
  'Registrar I',
  'Registrar II',
  'Records Officer I',
];

export interface DepEdDistrict {
  id: number;
  name: string;
  code: string;
  schools: string[];
}

export const DEPED_KORONADAL_DISTRICTS: DepEdDistrict[] = [
  {
    id: 1,
    name: 'District 1',
    code: 'DISTRICT_1',
    schools: [
      'Matulas Elementary School',
      'Morales Elementary School',
      'Salkan Elementary School',
      'Koronadal Central Elementary School 1',
    ],
  },
  {
    id: 6,
    name: 'District 6',
    code: 'DISTRICT_6',
    schools: [
      'Mariano Villegas Elementary School',
      'Carpenter Hill Elementary School',
      'Mama Mapambucol Elementary School',
      'Barrio 8 Elementary School',
      'Mangga Elementary School',
      'El Gawel Elementary School',
      'Takilay Elementary School',
    ],
  },
];

export const DEPED_REGION_12_SCHOOLS = DEPED_KORONADAL_DISTRICTS.flatMap(d => d.schools);
