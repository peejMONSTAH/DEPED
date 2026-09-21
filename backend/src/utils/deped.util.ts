import prisma from '../config/prisma';

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

export const CAREER_LADDERS: Record<string, string[]> = {
  TEACHING: [
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
  ],
  SCHOOL_HEAD: [
    'Head Teacher I',
    'Head Teacher II',
    'Head Teacher III',
    'Head Teacher IV',
    'Head Teacher V',
    'Head Teacher VI',
    'Assistant School Principal I',
    'Assistant School Principal II',
    'Assistant School Principal III',
    'School Principal I',
    'School Principal II',
    'School Principal III',
    'School Principal IV',
  ],
  ADMIN_OFFICER: [
    'Administrative Officer I',
    'Administrative Officer II',
    'Administrative Officer IV',
    'Administrative Officer V',
  ],
  ADMIN_ASSISTANT: [
    'Administrative Assistant I',
    'Administrative Assistant II',
    'Administrative Assistant III',
  ],
  ADMIN_AIDE: [
    'Administrative Aide I',
    'Administrative Aide III',
    'Administrative Aide IV',
    'Administrative Aide VI',
  ],
  GUIDANCE_COUNSELOR: [
    'Guidance Counselor I',
    'Guidance Counselor II',
    'Guidance Counselor III',
  ],
  SCHOOL_COUNSELOR: [
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
  ],
  LIBRARIAN: [
    'School Librarian I',
    'School Librarian II',
  ],
  REGISTRAR: [
    'Registrar I',
    'Registrar II',
  ],
  ACCOUNTANT: [
    'Accountant I',
    'Accountant II',
  ],
};

const TITLE_ALIASES: Record<string, string> = {
  // Teaching aliases
  'teacher 1': 'Teacher I',
  'teacher i': 'Teacher I',
  't1': 'Teacher I',
  't 1': 'Teacher I',
  't-1': 'Teacher I',
  'teacher 2': 'Teacher II',
  'teacher ii': 'Teacher II',
  't2': 'Teacher II',
  't 2': 'Teacher II',
  't-2': 'Teacher II',
  'teacher 3': 'Teacher III',
  'teacher iii': 'Teacher III',
  't3': 'Teacher III',
  't 3': 'Teacher III',
  't-3': 'Teacher III',
  'teacher 4': 'Teacher IV',
  'teacher iv': 'Teacher IV',
  't4': 'Teacher IV',
  't 4': 'Teacher IV',
  't-4': 'Teacher IV',
  'teacher 5': 'Teacher V',
  'teacher v': 'Teacher V',
  't5': 'Teacher V',
  't 5': 'Teacher V',
  't-5': 'Teacher V',
  'teacher 6': 'Teacher VI',
  'teacher vi': 'Teacher VI',
  't6': 'Teacher VI',
  't 6': 'Teacher VI',
  't-6': 'Teacher VI',
  'teacher 7': 'Teacher VII',
  'teacher vii': 'Teacher VII',
  't7': 'Teacher VII',
  't 7': 'Teacher VII',
  't-7': 'Teacher VII',
  // Master Teacher aliases
  'master teacher 1': 'Master Teacher I',
  'master teacher i': 'Master Teacher I',
  'mt1': 'Master Teacher I',
  'mt 1': 'Master Teacher I',
  'mt-1': 'Master Teacher I',
  'mt i': 'Master Teacher I',
  'master teacher 2': 'Master Teacher II',
  'master teacher ii': 'Master Teacher II',
  'mt2': 'Master Teacher II',
  'mt 2': 'Master Teacher II',
  'mt-2': 'Master Teacher II',
  'mt ii': 'Master Teacher II',
  'master teacher 3': 'Master Teacher III',
  'master teacher iii': 'Master Teacher III',
  'mt3': 'Master Teacher III',
  'mt 3': 'Master Teacher III',
  'mt-3': 'Master Teacher III',
  'mt iii': 'Master Teacher III',
  'master teacher 4': 'Master Teacher IV',
  'master teacher iv': 'Master Teacher IV',
  'mt4': 'Master Teacher IV',
  'mt 4': 'Master Teacher IV',
  'mt-4': 'Master Teacher IV',
  'mt iv': 'Master Teacher IV',
  'master teacher 5': 'Master Teacher V',
  'master teacher v': 'Master Teacher V',
  'mt5': 'Master Teacher V',
  'mt 5': 'Master Teacher V',
  'mt-5': 'Master Teacher V',
  'mt v': 'Master Teacher V',
  // Special Science / SPED mappings to Teaching Ladder positions
  'special science teacher 1': 'Teacher III',
  'special science teacher i': 'Teacher III',
  'special science teacher 2': 'Teacher VI',
  'special science teacher ii': 'Teacher VI',
  'special needs education teacher 1': 'Teacher IV',
  'special needs education teacher i': 'Teacher IV',
  'sped teacher 1': 'Teacher IV',
  'sped teacher i': 'Teacher IV',
  'special education teacher 1': 'Teacher IV',
  'special education teacher i': 'Teacher IV',
  'special needs education teacher 2': 'Teacher V',
  'special needs education teacher ii': 'Teacher V',
  'sped teacher 2': 'Teacher V',
  'sped teacher ii': 'Teacher V',
  'special education teacher 2': 'Teacher V',
  'special education teacher ii': 'Teacher V',
  'special needs education teacher 3': 'Teacher VI',
  'special needs education teacher iii': 'Teacher VI',
  'sped teacher 3': 'Teacher VI',
  'sped teacher iii': 'Teacher VI',
  'special education teacher 3': 'Teacher VI',
  'special education teacher iii': 'Teacher VI',
  'special needs education teacher 4': 'Teacher VII',
  'special needs education teacher iv': 'Teacher VII',
  'sped teacher 4': 'Teacher VII',
  'sped teacher iv': 'Teacher VII',
  'special needs education master teacher 1': 'Master Teacher I',
  'special needs education master teacher i': 'Master Teacher I',
  // School Head aliases
  'head teacher 1': 'Head Teacher I',
  'head teacher i': 'Head Teacher I',
  'ht 1': 'Head Teacher I',
  'ht i': 'Head Teacher I',
  'head teacher 2': 'Head Teacher II',
  'head teacher ii': 'Head Teacher II',
  'ht 2': 'Head Teacher II',
  'ht ii': 'Head Teacher II',
  'head teacher 3': 'Head Teacher III',
  'head teacher iii': 'Head Teacher III',
  'ht 3': 'Head Teacher III',
  'ht iii': 'Head Teacher III',
  'head teacher 4': 'Head Teacher IV',
  'head teacher iv': 'Head Teacher IV',
  'ht 4': 'Head Teacher IV',
  'ht iv': 'Head Teacher IV',
  'head teacher 5': 'Head Teacher V',
  'head teacher v': 'Head Teacher V',
  'ht 5': 'Head Teacher V',
  'ht v': 'Head Teacher V',
  'head teacher 6': 'Head Teacher VI',
  'head teacher vi': 'Head Teacher VI',
  'ht 6': 'Head Teacher VI',
  'ht vi': 'Head Teacher VI',
  'assistant school principal 1': 'Assistant School Principal I',
  'assistant school principal i': 'Assistant School Principal I',
  'assistant principal 1': 'Assistant School Principal I',
  'assistant principal i': 'Assistant School Principal I',
  'assistant school principal 2': 'Assistant School Principal II',
  'assistant school principal ii': 'Assistant School Principal II',
  'assistant principal 2': 'Assistant School Principal II',
  'assistant principal ii': 'Assistant School Principal II',
  'assistant school principal 3': 'Assistant School Principal III',
  'assistant school principal iii': 'Assistant School Principal III',
  'assistant principal 3': 'Assistant School Principal III',
  'assistant principal iii': 'Assistant School Principal III',
  'school principal 1': 'School Principal I',
  'school principal i': 'School Principal I',
  'principal 1': 'School Principal I',
  'principal i': 'School Principal I',
  'school principal 2': 'School Principal II',
  'school principal ii': 'School Principal II',
  'principal 2': 'School Principal II',
  'principal ii': 'School Principal II',
  'school principal 3': 'School Principal III',
  'school principal iii': 'School Principal III',
  'principal 3': 'School Principal III',
  'principal iii': 'School Principal III',
  'school principal 4': 'School Principal IV',
  'school principal iv': 'School Principal IV',
  'principal 4': 'School Principal IV',
  'principal iv': 'School Principal IV',
  // Administrative Officer aliases
  'administrative officer 1': 'Administrative Officer I',
  'administrative officer i': 'Administrative Officer I',
  'ao 1': 'Administrative Officer I',
  'ao i': 'Administrative Officer I',
  'administrative officer 2': 'Administrative Officer II',
  'administrative officer ii': 'Administrative Officer II',
  'ao 2': 'Administrative Officer II',
  'ao ii': 'Administrative Officer II',
  'ao ii so ii': 'Administrative Officer II',
  'administrative officer 4': 'Administrative Officer IV',
  'administrative officer iv': 'Administrative Officer IV',
  'ao 4': 'Administrative Officer IV',
  'ao iv': 'Administrative Officer IV',
  'administrative officer 5': 'Administrative Officer V',
  'administrative officer v': 'Administrative Officer V',
  'ao 5': 'Administrative Officer V',
  'ao v': 'Administrative Officer V',
  // Administrative Assistant aliases
  'administrative assistant 1': 'Administrative Assistant I',
  'administrative assistant i': 'Administrative Assistant I',
  'adas 1': 'Administrative Assistant I',
  'adas i': 'Administrative Assistant I',
  'administrative assistant 2': 'Administrative Assistant II',
  'administrative assistant ii': 'Administrative Assistant II',
  'adas 2': 'Administrative Assistant II',
  'adas ii': 'Administrative Assistant II',
  'administrative assistant 3': 'Administrative Assistant III',
  'administrative assistant iii': 'Administrative Assistant III',
  'adas 3': 'Administrative Assistant III',
  'adas iii': 'Administrative Assistant III',
  // Administrative Aide aliases
  'administrative aide 1': 'Administrative Aide I',
  'administrative aide i': 'Administrative Aide I',
  'ada 1': 'Administrative Aide I',
  'ada i': 'Administrative Aide I',
  'administrative aide 3': 'Administrative Aide III',
  'administrative aide iii': 'Administrative Aide III',
  'ada 3': 'Administrative Aide III',
  'ada iii': 'Administrative Aide III',
  'administrative aide 4': 'Administrative Aide IV',
  'administrative aide iv': 'Administrative Aide IV',
  'ada 4': 'Administrative Aide IV',
  'ada iv': 'Administrative Aide IV',
  'administrative aide 6': 'Administrative Aide VI',
  'administrative aide vi': 'Administrative Aide VI',
  'ada 6': 'Administrative Aide VI',
  'ada vi': 'Administrative Aide VI',
  // Guidance Counselor aliases
  'guidance counselor 1': 'Guidance Counselor I',
  'guidance counselor i': 'Guidance Counselor I',
  'guidance counselor 2': 'Guidance Counselor II',
  'guidance counselor ii': 'Guidance Counselor II',
  'guidance counselor 3': 'Guidance Counselor III',
  'guidance counselor iii': 'Guidance Counselor III',
};

export interface CanonicalPositionInfo {
  canonicalTitle: string;
  ladderName: string;
  ladderIndex: number;
  salaryGrade: number;
}

/**
 * Normalizes and resolves any DepEd position title or string to its canonical ladder position.
 */
export const resolveCanonicalPosition = (rawTitle?: string | null): CanonicalPositionInfo | null => {
  if (!rawTitle) return null;

  // Clean prefixes such as "Ranking for Vacancy: ", etc.
  let cleaned = String(rawTitle)
    .replace(/^ranking\s+for\s+(?:natural\s+)?vacancy\s*:\s*/i, '')
    .trim();

  const lower = cleaned.toLowerCase();

  // 1. Direct match against canonical titles across all ladders (longest titles first)
  const allCanonical = Object.entries(CAREER_LADDERS).flatMap(([ladderName, positions]) =>
    positions.map((canonicalTitle, ladderIndex) => ({
      canonicalTitle,
      ladderName,
      ladderIndex,
      salaryGrade: POSITION_SALARY_GRADE_MAP[canonicalTitle] ?? getAutoSalaryGrade(canonicalTitle),
    }))
  ).sort((a, b) => b.canonicalTitle.length - a.canonicalTitle.length);

  for (const item of allCanonical) {
    const cLow = item.canonicalTitle.toLowerCase();
    if (
      lower === cLow ||
      lower.startsWith(cLow + ' ') ||
      lower.startsWith(cLow + ' -') ||
      lower.startsWith(cLow + ' (') ||
      lower.startsWith(cLow + ',')
    ) {
      return item;
    }
  }

  // 2. Check TITLE_ALIASES map
  const alphaNormalized = lower.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [alias, canonicalTarget] of Object.entries(TITLE_ALIASES).sort((a, b) => b[0].length - a[0].length)) {
    if (
      alphaNormalized === alias ||
      alphaNormalized.startsWith(alias + ' ') ||
      lower.startsWith(alias)
    ) {
      const found = allCanonical.find(c => c.canonicalTitle.toLowerCase() === canonicalTarget.toLowerCase());
      if (found) return found;
    }
  }

  // 3. Fallback: Lookup in POSITION_SALARY_GRADE_MAP
  const sg = getAutoSalaryGrade(cleaned);
  if (sg > 0) {
    return {
      canonicalTitle: cleaned,
      ladderName: 'GENERAL',
      ladderIndex: -1,
      salaryGrade: sg,
    };
  }

  return null;
};

export interface PromotionEligibilityResult {
  isEligible: boolean;
  reason: string | null;
  jump: number | null;
  maxAllowedJump: number;
  currentPositionCanonical: string;
  targetPositionCanonical: string;
  cycleType: string;
}

/**
 * Strict DepEd Promotion Eligibility & Jump Validator
 *
 * Rules:
 * - For NATURAL_VACANCY (and RECLASSIFICATION): personnel can jump a maximum of 1 to 2 positions
 *   (e.g., Teacher I to Teacher II or Teacher III). A jump of 3+ positions is prohibited.
 * - For ECP (Expanded Career Progression): personnel can jump a maximum of 3 positions
 *   (e.g., Teacher I to Teacher IV). A jump of 4+ positions is prohibited.
 * - Applying for the same or a lower position (jump <= 0) is prohibited.
 * - Incompatible career tracks (e.g. Non-Teaching applying for Teaching positions) are prohibited.
 */
export const checkPromotionEligibility = (
  currentPositionRaw?: string | null,
  targetPositionRaw?: string | null,
  cycleType?: string | null
): PromotionEligibilityResult => {
  const normType = String(cycleType || 'NATURAL_VACANCY').trim().toUpperCase();
  const isEcp = normType === 'ECP';
  const maxAllowedJump = isEcp ? 3 : 2;

  const currentInfo = resolveCanonicalPosition(currentPositionRaw);
  const targetInfo = resolveCanonicalPosition(targetPositionRaw);

  const currentTitle = currentInfo?.canonicalTitle || String(currentPositionRaw || 'Unassigned');
  const targetTitle = targetInfo?.canonicalTitle || String(targetPositionRaw || 'Unknown Position');

  if (!currentPositionRaw || !currentPositionRaw.trim()) {
    return {
      isEligible: false,
      reason: 'Personnel profile has no active plantilla position or designation on record.',
      jump: null,
      maxAllowedJump,
      currentPositionCanonical: currentTitle,
      targetPositionCanonical: targetTitle,
      cycleType: normType,
    };
  }

  if (!targetPositionRaw || !targetPositionRaw.trim()) {
    return {
      isEligible: false,
      reason: 'Promotion cycle has no designated target position.',
      jump: null,
      maxAllowedJump,
      currentPositionCanonical: currentTitle,
      targetPositionCanonical: targetTitle,
      cycleType: normType,
    };
  }

  if (!currentInfo || !targetInfo) {
    return {
      isEligible: false,
      reason: `Cannot verify promotion eligibility: Unrecognized position title (${!currentInfo ? currentPositionRaw : targetPositionRaw}).`,
      jump: null,
      maxAllowedJump,
      currentPositionCanonical: currentTitle,
      targetPositionCanonical: targetTitle,
      cycleType: normType,
    };
  }

  let jump: number;

  // Case A: Both positions are in the same career ladder
  if (currentInfo.ladderName === targetInfo.ladderName && currentInfo.ladderIndex >= 0 && targetInfo.ladderIndex >= 0) {
    jump = targetInfo.ladderIndex - currentInfo.ladderIndex;
  }
  // Case B: Cross-ladder compatibility checks
  else {
    const isCurrentTeaching = currentInfo.ladderName === 'TEACHING';
    const isTargetTeaching = targetInfo.ladderName === 'TEACHING';

    // Disallow cross-track between teaching and administrative / support positions
    if ((isCurrentTeaching && !isTargetTeaching && targetInfo.ladderName !== 'SCHOOL_HEAD') ||
        (!isCurrentTeaching && isTargetTeaching)) {
      const currentTrackLabel = isCurrentTeaching ? 'Teaching' : 'Non-Teaching / Administrative';
      const targetTrackLabel = isTargetTeaching ? 'Teaching' : 'Non-Teaching / Administrative';
      return {
        isEligible: false,
        reason: `Career track mismatch: Personnel holding a ${currentTrackLabel} position (${currentInfo.canonicalTitle}) cannot apply for a ${targetTrackLabel} promotion position (${targetInfo.canonicalTitle}).`,
        jump: null,
        maxAllowedJump,
        currentPositionCanonical: currentTitle,
        targetPositionCanonical: targetTitle,
        cycleType: normType,
      };
    }

    // Related ladders progression fallback by Salary Grade (e.g. ADMIN_ASSISTANT to ADMIN_OFFICER, or TEACHING to SCHOOL_HEAD)
    if (currentInfo.salaryGrade > 0 && targetInfo.salaryGrade > 0) {
      jump = targetInfo.salaryGrade - currentInfo.salaryGrade;
    } else {
      return {
        isEligible: false,
        reason: `Incompatible career progression from ${currentInfo.canonicalTitle} to ${targetInfo.canonicalTitle}.`,
        jump: null,
        maxAllowedJump,
        currentPositionCanonical: currentTitle,
        targetPositionCanonical: targetTitle,
        cycleType: normType,
      };
    }
  }

  // Same position check
  if (jump === 0) {
    return {
      isEligible: false,
      reason: `You cannot apply for this position because you already hold this position (${currentInfo.canonicalTitle}).`,
      jump,
      maxAllowedJump,
      currentPositionCanonical: currentTitle,
      targetPositionCanonical: targetTitle,
      cycleType: normType,
    };
  }

  // Lower position check
  if (jump < 0) {
    return {
      isEligible: false,
      reason: `You cannot apply for this position because it is lower than your current position (${currentInfo.canonicalTitle}).`,
      jump,
      maxAllowedJump,
      currentPositionCanonical: currentTitle,
      targetPositionCanonical: targetTitle,
      cycleType: normType,
    };
  }

  // Exceeds jump limit check
  if (jump > maxAllowedJump) {
    const ruleLabel = isEcp ? 'Expanded Career Progression (ECP)' : 'Natural Vacancy';
    const exampleText = isEcp ? 'Teacher I to Teacher IV' : 'Teacher I to Teacher III';
    return {
      isEligible: false,
      reason: `Under ${ruleLabel} rules, personnel can jump a maximum of ${maxAllowedJump === 3 ? 'up to 3' : '1 to 2'} positions (e.g., ${exampleText}). Applying from ${currentInfo.canonicalTitle} to ${targetInfo.canonicalTitle} is a ${jump}-position jump and is not permitted.`,
      jump,
      maxAllowedJump,
      currentPositionCanonical: currentTitle,
      targetPositionCanonical: targetTitle,
      cycleType: normType,
    };
  }

  // Eligible!
  return {
    isEligible: true,
    reason: null,
    jump,
    maxAllowedJump,
    currentPositionCanonical: currentTitle,
    targetPositionCanonical: targetTitle,
    cycleType: normType,
  };
};

/**
 * Checks if a plantilla item is currently open for grab in an active or planning promotion cycle.
 * Returns lock status, matching cycle details, and user-facing explanation.
 */
export async function getPlantillaActivePromotionCycle(
  plantilla: { id?: number; itemNumber: string; positionTitle: string; department?: string | null; division?: string | null },
  tx?: any
): Promise<{ isLocked: boolean; cycle?: any; reason?: string }> {
  const client = tx || prisma;
  const activeCycles = await client.promotionCycle.findMany({
    where: {
      status: { in: ['ACTIVE', 'PLANNING'] },
    },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      rulesConfigurationJson: true,
    },
  });

  const currentItemNumber = (plantilla.itemNumber || '').trim().toLowerCase();
  const currentPos = (plantilla.positionTitle || '').trim().toLowerCase();
  const currentDept = (plantilla.department || '').trim().toLowerCase();
  const currentDiv = (plantilla.division || '').trim().toLowerCase();

  for (const cycle of activeCycles) {
    const rules = (cycle.rulesConfigurationJson as Record<string, any>) || {};

    // 1. Direct Item Number match
    const ruleNumbers: string[] = [];
    if (rules.plantillaItemNumber) ruleNumbers.push(String(rules.plantillaItemNumber).trim().toLowerCase());
    if (rules.plantillaItemNo) ruleNumbers.push(String(rules.plantillaItemNo).trim().toLowerCase());
    if (Array.isArray(rules.plantillaItemNumbers)) {
      rules.plantillaItemNumbers.forEach((num: any) => {
        if (num) ruleNumbers.push(String(num).trim().toLowerCase());
      });
    }

    if (currentItemNumber && ruleNumbers.includes(currentItemNumber)) {
      return {
        isLocked: true,
        cycle,
        reason: `Plantilla item '${plantilla.itemNumber}' is explicitly designated for grab in active promotion cycle "${cycle.name}" (${cycle.type}). It cannot be manually assigned while the promotion cycle is ongoing.`,
      };
    }

    // 2. Target Position and School / District scope match
    const targetPos = (rules.targetPosition || '').trim().toLowerCase();
    if (targetPos && currentPos && (targetPos === currentPos || currentPos.includes(targetPos) || targetPos.includes(currentPos))) {
      const schoolRule = (rules.school || rules.schoolStation || '').trim().toLowerCase();
      const districtRule = (rules.district || rules.designatedDistrict || '').trim().toLowerCase();

      const schoolMatch = !schoolRule || schoolRule === 'all' || schoolRule === 'all schools in district' || currentDept.includes(schoolRule) || schoolRule.includes(currentDept);
      const districtMatch = !districtRule || districtRule === 'all' || districtRule === 'division_wide' || districtRule === 'all districts / division-wide' ||
        currentDiv.includes(districtRule) || districtRule.includes(currentDiv) || currentDept.includes(districtRule);

      if (schoolMatch && districtMatch) {
        return {
          isLocked: true,
          cycle,
          reason: `Plantilla item '${plantilla.itemNumber}' (${plantilla.positionTitle}) is currently open for grab in promotion cycle "${cycle.name}". It cannot be manually assigned to a new account.`,
        };
      }
    }
  }

  // 3. Check if awarded/designated in any active promotion application
  const assignedApp = await client.promotionApplication.findFirst({
    where: {
      status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'RANKED', 'APPROVED'] },
      promotionCycle: { status: { in: ['ACTIVE', 'PLANNING'] } },
    },
    select: {
      id: true,
      scoreDetailsJson: true,
      promotionCycle: { select: { id: true, name: true, type: true } },
    },
  });
  if (assignedApp) {
    const appDetails = (assignedApp.scoreDetailsJson as any) || {};
    if (appDetails.plantillaItemNumber && String(appDetails.plantillaItemNumber).trim().toLowerCase() === currentItemNumber) {
      return {
        isLocked: true,
        cycle: assignedApp.promotionCycle,
        reason: `Plantilla item '${plantilla.itemNumber}' is currently designated to a candidate in active promotion cycle "${assignedApp.promotionCycle.name}".`,
      };
    }
  }

  return { isLocked: false };
}

