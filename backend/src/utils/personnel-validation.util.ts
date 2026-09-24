const SUFFIXES = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const isPersonnelRole = (role: unknown) => role === 'TEACHING_PERSONNEL' || role === 'NON_TEACHING_PERSONNEL';

export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Today as YYYY-MM-DD in Philippine time; UTC would reject today's date before 8 AM local. */
const todayInManila = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

/** Validate API input independently from HTML controls; reject rollover dates. */
export function validatePersonnelInput(body: Record<string, unknown>): string | null {
  if (body.email !== undefined && (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))) return 'Enter a valid email address.';
  for (const field of ['firstName', 'lastName', 'designation']) {
    if (body[field] !== undefined && (typeof body[field] !== 'string' || !String(body[field]).trim())) return `${field} cannot be blank.`;
  }
  if (body.suffix != null && !SUFFIXES.includes(String(body.suffix))) return 'Select a supported name suffix.';
  if (body.gender != null && !['MALE', 'FEMALE', 'OTHER'].includes(String(body.gender))) return 'Select a valid gender.';
  if (body.civilStatus != null && !['SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED'].includes(String(body.civilStatus))) return 'Select a valid civil status.';
  for (const field of ['birthDate', 'dateHired']) {
    const value = body[field];
    if (value == null || value === '') continue;
    if (!isValidDateOnly(value)) return `${field} must be a valid date in YYYY-MM-DD format.`;
    if (value > todayInManila()) return `${field} cannot be in the future.`;
  }
  if (body.birthDate && body.dateHired && String(body.dateHired) <= String(body.birthDate)) return 'Date hired must be after date of birth.';
  const mobile = body.contactNumber ?? body.mobileNo;
  if (mobile != null && mobile !== '' && (typeof mobile !== 'string' || !/^(09\d{9}|\+639\d{9})$/.test(mobile))) return 'Enter a Philippine mobile number as 09XXXXXXXXX or +639XXXXXXXXX.';
  if (body.plantillaItemId != null && body.plantillaItemId !== '' && (!Number.isSafeInteger(Number(body.plantillaItemId)) || Number(body.plantillaItemId) <= 0)) return 'Select a valid plantilla item.';
  return null;
}

export function validateAccountInput(body: Record<string, unknown>): string | null {
  const error = validatePersonnelInput(body);
  if (error) return error;
  if (body.role === 'AO_II') {
    if (typeof body.schoolAssignment !== 'string' || !body.schoolAssignment.trim()) return 'A school assignment is required for an AO II station account.';
  } else if (!body.personnelId) {
    if (!body.firstName || !body.lastName || !body.birthDate || !body.gender || !body.civilStatus || !body.designation) return 'Complete the required personnel identity and position fields.';
  }
  if (isPersonnelRole(body.role) && !body.personnelId && !body.plantillaItemId && body.nonPlantilla !== true) return 'Select a vacant plantilla item or explicitly identify a non-plantilla appointment.';
  return null;
}
