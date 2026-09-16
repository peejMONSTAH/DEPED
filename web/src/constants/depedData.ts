// Official DepEd Region XII (SOCCSKSARGEN) & City Schools Division of Koronadal Data

export const TEACHING_POSITIONS = [
  // 1. Teaching Personnel — Current ECP Positions
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

  // Special Science / Special Needs Education Titles
  'Teacher III (Special Science Teacher I)',
  'Teacher VI (Special Science Teacher II)',
  'Teacher IV (Special Needs Education Teacher I)',
  'Teacher V (Special Needs Education Teacher II)',
  'Teacher VI (Special Needs Education Teacher III)',
  'Teacher VII (Special Needs Education Teacher IV)',
  'Master Teacher I (Special Needs Education Master Teacher I / former SNET V)',
  'Special Science Teacher I',
  'Special Science Teacher II',
  'Special Needs Education Teacher I',
  'Special Needs Education Teacher II',
  'Special Needs Education Teacher III',
  'Special Needs Education Teacher IV',
  'Special Education (SPED) Teacher I',
  'Special Education (SPED) Teacher II',
  'Special Education (SPED) Teacher III',

  // 2. School Administration / School Heads — Current ECP Titles
  'School Principal I',
  'School Principal II',
  'School Principal III',
  'School Principal IV',

  // Existing / Legacy Positions
  'Head Teacher I',
  'Head Teacher II',
  'Head Teacher III',
  'Head Teacher IV',
  'Head Teacher V',
  'Head Teacher VI',
  'Assistant School Principal I',
  'Assistant Principal I',
  'Assistant Special School Principal I',
  'Assistant School Principal II',
  'Assistant Principal II',
  'Assistant School Principal III',
  'Assistant Principal III',
  'Special School Principal I',
  'Special School Principal II',
];

export const NON_TEACHING_POSITIONS = [
  // Newer DepEd Staffing Framework — Counselor Series
  'School Counselor Associate I',
  'School Counselor Associate II',
  'School Counselor Associate III',
  'School Counselor Associate IV',
  'School Counselor Associate V',
  'School Counselor I',
  'School Counselor II',
  'School Counselor III',
  'School Counselor IV',
  'Schools Division Counselor',

  // Administrative & Office Staff Roles
  'Administrative Officer I',
  'Administrative Officer II (AO II / SO II)',
  'Administrative Officer II (SO II)',
  'Administrative Officer II',
  'Administrative Officer IV',
  'Administrative Officer V (HRMO)',
  'Administrative Officer V',
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

/**
 * Official DepEd Salary Grade (SG) Mapping per Position
 * Based on DBM National Compensation Guidelines, ECP DO No. 19 & 24, s. 2025, and DO No. 7, s. 2023.
 */
export const POSITION_SALARY_GRADE_MAP: Record<string, number> = {
  // 1. Teaching Personnel — Current ECP Positions
  'Teacher I': 11,
  'Teacher II': 12,
  'Teacher III': 13,
  'Teacher IV': 14,
  'Teacher V': 15,
  'Teacher VI': 16,
  'Teacher VII': 17,
  'Master Teacher I': 18,
  'Master Teacher II': 19,
  'Master Teacher III': 20,
  'Master Teacher IV': 21,
  'Master Teacher V': 22,

  // Special Science / Special Needs Education Titles
  'Teacher III (Special Science Teacher I)': 13,
  'Teacher VI (Special Science Teacher II)': 16,
  'Teacher IV (Special Needs Education Teacher I)': 14,
  'Teacher V (Special Needs Education Teacher II)': 15,
  'Teacher VI (Special Needs Education Teacher III)': 16,
  'Teacher VII (Special Needs Education Teacher IV)': 17,
  'Master Teacher I (Special Needs Education Master Teacher I / former SNET V)': 18,
  'Special Science Teacher I': 13,
  'Special Science Teacher II': 16,
  'Special Needs Education Teacher I': 14,
  'Special Needs Education Teacher II': 15,
  'Special Needs Education Teacher III': 16,
  'Special Needs Education Teacher IV': 17,
  'Special Education (SPED) Teacher I': 14,
  'Special Education (SPED) Teacher II': 15,
  'Special Education (SPED) Teacher III': 16,

  // 2. School Administration / School Heads — Current ECP Titles
  'School Principal I': 19,
  'School Principal II': 20,
  'School Principal III': 21,
  'School Principal IV': 22,

  // Existing / Legacy Positions
  'Head Teacher I': 14,
  'Head Teacher II': 15,
  'Head Teacher III': 16,
  'Head Teacher IV': 17,
  'Head Teacher V': 18,
  'Head Teacher VI': 19,
  'Assistant School Principal I': 18,
  'Assistant Principal I': 18,
  'Assistant Special School Principal I': 18,
  'Assistant School Principal II': 19,
  'Assistant Principal II': 19,
  'Assistant School Principal III': 20,
  'Assistant Principal III': 20,
  'Special School Principal I': 19,
  'Special School Principal II': 20,

  // Newer DepEd Staffing Framework — Counselor Series
  'School Counselor Associate I': 11,
  'School Counselor Associate II': 12,
  'School Counselor Associate III': 13,
  'School Counselor Associate IV': 14,
  'School Counselor Associate V': 15,
  'School Counselor I': 16,
  'School Counselor II': 18,
  'School Counselor III': 20,
  'School Counselor IV': 22,
  'Schools Division Counselor': 24,

  // Administrative & Office Staff Roles
  'Administrative Officer I': 10,
  'Administrative Officer II (AO II / SO II)': 11,
  'Administrative Officer II (SO II)': 11,
  'Administrative Officer II': 11,
  'Administrative Officer IV': 15,
  'Administrative Officer V (HRMO)': 18,
  'Administrative Officer V': 18,
  'Administrative Assistant I': 7,
  'Administrative Assistant II': 8,
  'Administrative Assistant III': 9,
  'Administrative Aide I': 1,
  'Administrative Aide III': 3,
  'Administrative Aide IV': 4,
  'Administrative Aide VI': 6,
  'Guidance Counselor I': 11,
  'Guidance Counselor II': 12,
  'Guidance Counselor III': 13,
  'School Librarian I': 11,
  'School Librarian II': 15,
  'Information Technology Officer I': 19,
  'Accountant I': 12,
  'Accountant II': 16,
  'Registrar I': 11,
  'Registrar II': 15,
  'Records Officer I': 10,
};

/**
 * Returns the official automatic Salary Grade for any DepEd position title.
 * Performs direct lookup, case-insensitive comparison, and hierarchical pattern matching.
 */
export const getAutoSalaryGrade = (positionTitle?: string): number => {
  const title = (positionTitle || '').trim().toLowerCase();
  // Match the most specific title first. "Head Teacher" must not match "Teacher".
  const entry = Object.entries(POSITION_SALARY_GRADE_MAP)
    .sort(([a], [b]) => b.length - a.length)
    .find(([position]) => {
      const key = position.toLowerCase();
      return title === key || title.startsWith(key + ' (') || title.startsWith(key + ' -') || title.startsWith(key + ' [');
    });
  // Unknown titles require an explicit, HR-verified grade; never assume SG 11.
  return entry?.[1] ?? 0;
};

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

export const NAME_SUFFIX_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'Jr.', label: 'Jr.' },
  { value: 'Sr.', label: 'Sr.' },
  { value: 'II', label: 'II' },
  { value: 'III', label: 'III' },
  { value: 'IV', label: 'IV' },
  { value: 'V', label: 'V' },
  { value: 'VI', label: 'VI' },
  { value: 'VII', label: 'VII' },
  { value: 'VIII', label: 'VIII' },
  { value: 'IX', label: 'IX' },
  { value: 'X', label: 'X' },
] as const;
