/**
 * Reading and checking an HR personnel file (CSV) before anything is written.
 * Pure functions: the database facts a check needs are passed in as an ImportContext.
 */
import { upperName } from './name-case.util';

export const IMPORT_MAX_ROWS = 1000;

export const TEMPLATE_COLUMNS = [
  'employeeId', 'firstName', 'middleName', 'lastName', 'suffix', 'birthDate', 'gender', 'civilStatus',
  'contactNumber', 'address', 'email', 'designation', 'school', 'district', 'dateHired', 'appointmentStatus', 'plantillaItemNumber', 'category',
] as const;
export type ImportField = (typeof TEMPLATE_COLUMNS)[number];

export const TEMPLATE_EXAMPLE: Record<ImportField, string> = {
  employeeId: '', firstName: 'JUAN', middleName: 'REYES', lastName: 'DELA CRUZ', suffix: '', birthDate: '15/03/1985', gender: 'MALE',
  civilStatus: 'MARRIED', contactNumber: '09171234567', address: 'Purok 1, Brgy. Zone 3, Koronadal City', email: 'juan.delacruz@deped.gov.ph',
  designation: 'Teacher I', school: 'Morales Elementary School', district: 'District 1', dateHired: '01/06/2012', appointmentStatus: 'PERMANENT',
  plantillaItemNumber: '', category: 'TEACHING',
};

const ALIASES: Record<ImportField, string[]> = {
  employeeId: ['employeeid', 'employeeno', 'employeenumber', 'empid', 'empno', 'idnumber', 'idno'],
  firstName: ['firstname', 'givenname', 'first'],
  middleName: ['middlename', 'middle', 'middleinitial'],
  lastName: ['lastname', 'surname', 'familyname', 'last'],
  suffix: ['suffix', 'nameextension', 'extension'],
  birthDate: ['birthdate', 'dateofbirth', 'dob', 'birthday'],
  gender: ['gender', 'sex', 'sexatbirth'],
  civilStatus: ['civilstatus', 'maritalstatus'],
  contactNumber: ['contactnumber', 'contactno', 'mobile', 'mobileno', 'mobilenumber', 'cellphone', 'cellphoneno', 'phone'],
  address: ['address', 'residentialaddress', 'homeaddress'],
  email: ['email', 'emailaddress', 'depedemail', 'officialemail'],
  designation: ['designation', 'position', 'positiontitle', 'currentposition'],
  school: ['school', 'station', 'schoolassignment', 'schoolstation', 'office', 'assignment'],
  district: ['district'],
  dateHired: ['datehired', 'dateofappointment', 'appointmentdate', 'datehire', 'dateofhire'],
  appointmentStatus: ['appointmentstatus', 'employmentstatus', 'statusofappointment'],
  plantillaItemNumber: ['plantillaitemnumber', 'plantillaitem', 'itemnumber', 'itemno', 'plantillano'],
  category: ['category', 'personneltype', 'personnelcategory', 'track'],
};

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Split CSV text into rows. Handles quotes, doubled quotes, CRLF, a BOM, and ';' as the separator (Excel in some regions). */
export const parseCsv = (text: string): string[][] => {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(cell => cell.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(cell => cell.trim() !== '')) rows.push(row);
  return rows;
};

/** CSV text for the template: the header plus one example row. */
export const templateCsv = (): string => {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `${TEMPLATE_COLUMNS.join(',')}\r\n${TEMPLATE_COLUMNS.map(c => esc(TEMPLATE_EXAMPLE[c])).join(',')}\r\n`;
};

export interface RawRow { line: number; values: Partial<Record<ImportField, string>> }

/** Map the header row to known fields; extra columns are ignored, missing required ones are reported. */
export const readRows = (table: string[][]): { rows: RawRow[]; missing: ImportField[]; unknown: string[] } => {
  if (!table.length) return { rows: [], missing: [], unknown: [] };
  const header = table[0].map(h => key(h));
  const columnOf: Partial<Record<ImportField, number>> = {};
  for (const field of TEMPLATE_COLUMNS) {
    const index = header.findIndex(h => ALIASES[field].includes(h) || h === key(field));
    if (index >= 0) columnOf[field] = index;
  }
  const known = new Set(Object.values(columnOf));
  const unknown = table[0].filter((_, i) => !known.has(i)).map(h => h.trim()).filter(Boolean);
  const required: ImportField[] = ['firstName', 'lastName', 'email', 'designation', 'school', 'birthDate'];
  const missing = required.filter(f => columnOf[f] === undefined);
  const rows = table.slice(1).map((cells, i) => {
    const values: Partial<Record<ImportField, string>> = {};
    for (const field of TEMPLATE_COLUMNS) {
      const index = columnOf[field];
      if (index !== undefined) values[field] = (cells[index] ?? '').trim();
    }
    return { line: i + 2, values };
  });
  return { rows, missing, unknown };
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = (y: number, m: number, d: number): string | null => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date.toISOString().slice(0, 10) : null;
};

/** Accepts YYYY-MM-DD, dd/mm/yyyy (the PDS order), "March 15, 1985", and Excel date numbers. Returns YYYY-MM-DD or null. */
export const parseImportDate = (raw: string): string | null => {
  const v = raw.trim();
  if (!v) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(v);
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) return iso(+m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]);
  m = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(v);
  if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) return iso(+m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]);
  if (/^\d{5}$/.test(v)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(v) * 86_400_000); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  return null;
};

export interface PlantillaFact { id: number; department: string | null; division: string | null; positionTitle: string; occupied: boolean }
export interface ImportContext {
  existingEmails: Set<string>;
  existingEmployeeIds: Set<string>;
  /** Lower-cased station names already in the system (plantilla and personnel). */
  knownStations: Set<string>;
  /** Plantilla items by upper-cased item number. */
  plantilla: Map<string, PlantillaFact>;
  today?: Date;
}

export interface ImportRecord {
  employeeId: string | null; firstName: string; middleName: string | null; lastName: string; suffix: string | null;
  birthDate: string; gender: 'MALE' | 'FEMALE' | 'OTHER' | null; civilStatus: 'SINGLE' | 'MARRIED' | 'WIDOWED' | 'SEPARATED' | null;
  contactNumber: string | null; address: string | null; email: string; designation: string; school: string; district: string | null;
  dateHired: string | null; appointmentStatus: string | null; plantillaItemId: number | null; plantillaItemNumber: string | null;
  role: 'TEACHING_PERSONNEL' | 'NON_TEACHING_PERSONNEL';
}
export interface RowResult { line: number; status: 'OK' | 'ERROR'; errors: string[]; warnings: string[]; name: string; email: string; school: string; designation: string; record?: ImportRecord }

const GENDERS: Record<string, ImportRecord['gender']> = { m: 'MALE', male: 'MALE', lalaki: 'MALE', f: 'FEMALE', female: 'FEMALE', babae: 'FEMALE', other: 'OTHER' };
const CIVIL: Record<string, ImportRecord['civilStatus']> = { single: 'SINGLE', married: 'MARRIED', widowed: 'WIDOWED', widow: 'WIDOWED', widower: 'WIDOWED', separated: 'SEPARATED' };
const APPOINTMENT = ['PERMANENT', 'PROVISIONAL', 'TEMPORARY', 'SUBSTITUTE', 'CASUAL', 'CONTRACTUAL', 'COTERMINOUS'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isTeaching = (title: string) => /teacher|principal|head teacher|master teacher|sped|instructor/i.test(title);

/** Check every row. A row is OK only when it can be imported as it stands; warnings never block. */
export const validateImportRows = (rows: RawRow[], ctx: ImportContext): RowResult[] => {
  const today = ctx.today ?? new Date();
  const seenEmails = new Map<string, number>();
  const seenIds = new Map<string, number>();
  const seenItems = new Map<string, number>();

  return rows.map(({ line, values: v }) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const firstName = upperName(v.firstName || '');
    const lastName = upperName(v.lastName || '');
    const email = (v.email || '').trim().toLowerCase();
    const designation = (v.designation || '').trim();
    const school = (v.school || '').replace(/\s+/g, ' ').trim();
    const base = { line, name: `${lastName}${lastName && firstName ? ', ' : ''}${firstName}`, email, school, designation };

    if (!firstName) errors.push('First name is missing.');
    if (!lastName) errors.push('Last name is missing.');
    if (!designation) errors.push('Position (designation) is missing.');
    if (!school) errors.push('School or station is missing.');

    if (!email) errors.push('Email is missing. Every person needs one to sign in.');
    else if (!EMAIL.test(email)) errors.push(`"${email}" is not a valid email address.`);
    else {
      if (ctx.existingEmails.has(email)) errors.push('This email already has an account.');
      if (seenEmails.has(email)) errors.push(`This email is repeated from line ${seenEmails.get(email)}.`);
      else seenEmails.set(email, line);
    }

    const employeeId = (v.employeeId || '').trim().toUpperCase() || null;
    if (employeeId) {
      if (ctx.existingEmployeeIds.has(employeeId)) errors.push(`Employee ID ${employeeId} already exists.`);
      if (seenIds.has(employeeId)) errors.push(`Employee ID ${employeeId} is repeated from line ${seenIds.get(employeeId)}.`);
      else seenIds.set(employeeId, line);
    }

    const birthDate = parseImportDate(v.birthDate || '');
    if (!v.birthDate) errors.push('Date of birth is missing.');
    else if (!birthDate) errors.push(`Date of birth "${v.birthDate}" is not a valid date. Use dd/mm/yyyy.`);
    else {
      const age = (today.getTime() - new Date(birthDate).getTime()) / (365.25 * 86_400_000);
      if (age < 15 || age > 100) errors.push(`Date of birth ${birthDate} gives an age of ${Math.floor(age)}. Check the date.`);
    }

    let dateHired: string | null = null;
    if (v.dateHired) {
      dateHired = parseImportDate(v.dateHired);
      if (!dateHired) warnings.push(`Date hired "${v.dateHired}" was not understood and is left blank.`);
      else if (new Date(dateHired) > today) { warnings.push('Date hired is in the future and is left blank.'); dateHired = null; }
    }

    let gender: ImportRecord['gender'] = null;
    if (v.gender) { gender = GENDERS[key(v.gender)] ?? null; if (!gender) warnings.push(`Sex "${v.gender}" was not understood and is left blank.`); }
    let civilStatus: ImportRecord['civilStatus'] = null;
    if (v.civilStatus) { civilStatus = CIVIL[key(v.civilStatus)] ?? null; if (!civilStatus) warnings.push(`Civil status "${v.civilStatus}" was not understood and is left blank.`); }

    let appointmentStatus: string | null = null;
    if (v.appointmentStatus) {
      const candidate = v.appointmentStatus.trim().toUpperCase();
      if (APPOINTMENT.includes(candidate)) appointmentStatus = candidate; else warnings.push(`Appointment status "${v.appointmentStatus}" was not understood and is left blank.`);
    }

    let contactNumber: string | null = null;
    if (v.contactNumber) {
      const digits = v.contactNumber.replace(/[^\d+]/g, '').replace(/^\+63/, '0').replace(/^63(?=9)/, '0');
      if (/^09\d{9}$/.test(digits)) contactNumber = digits; else { contactNumber = v.contactNumber.trim(); warnings.push('Mobile number is not in 09XXXXXXXXX form; kept as written.'); }
    }

    let plantillaItemId: number | null = null;
    let plantillaItemNumber: string | null = null;
    let district = (v.district || '').trim() || null;
    if (v.plantillaItemNumber) {
      const item = ctx.plantilla.get(v.plantillaItemNumber.trim().toUpperCase());
      plantillaItemNumber = v.plantillaItemNumber.trim().toUpperCase();
      if (!item) errors.push(`Plantilla item ${plantillaItemNumber} does not exist. Import the plantilla first.`);
      else if (item.occupied) errors.push(`Plantilla item ${plantillaItemNumber} is already occupied.`);
      else if (seenItems.has(plantillaItemNumber)) errors.push(`Plantilla item ${plantillaItemNumber} is repeated from line ${seenItems.get(plantillaItemNumber)}.`);
      else { seenItems.set(plantillaItemNumber, line); plantillaItemId = item.id; district = district || item.division || null; }
    }
    if (school && ctx.knownStations.size && !ctx.knownStations.has(school.toLowerCase())) {
      warnings.push(`"${school}" is not a station already in the system. An AO II sees only people whose school matches exactly.`);
    }

    const category = key(v.category || '');
    const role: ImportRecord['role'] = category.startsWith('non') ? 'NON_TEACHING_PERSONNEL'
      : category.startsWith('teach') ? 'TEACHING_PERSONNEL'
        : isTeaching(designation) ? 'TEACHING_PERSONNEL' : 'NON_TEACHING_PERSONNEL';

    if (errors.length) return { ...base, status: 'ERROR' as const, errors, warnings };
    return {
      ...base, status: 'OK' as const, errors, warnings,
      record: {
        employeeId, firstName, middleName: v.middleName ? upperName(v.middleName) : null, lastName, suffix: v.suffix ? upperName(v.suffix) : null,
        birthDate: birthDate!, gender, civilStatus, contactNumber, address: v.address?.trim() || null, email, designation, school, district,
        dateHired, appointmentStatus, plantillaItemId, plantillaItemNumber, role,
      },
    };
  });
};
