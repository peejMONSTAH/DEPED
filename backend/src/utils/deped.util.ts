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
