/** Fields eligible for document-derived Digital 201 updates. The source must
 * be server-side OCR of the stored file, followed by personnel review. */
export const FIELD_DEFINITIONS = {
  firstName: { label: 'First name', isLocked: true, type: 'string' },
  lastName: { label: 'Last name', isLocked: true, type: 'string' },
  middleName: { label: 'Middle name', isLocked: true, type: 'string' },
  suffix: { label: 'Name extension', isLocked: true, type: 'string' },
  birthDate: { label: 'Date of birth', isLocked: true, type: 'date' },
  gender: { label: 'Sex', isLocked: true, type: 'gender' },
  civilStatus: { label: 'Civil status', isLocked: true, type: 'civilStatus' },
  contactNumber: { label: 'Contact number', isLocked: false, type: 'string' },
  address: { label: 'Residential address', isLocked: false, type: 'string' },
  designation: { label: 'Current position', isLocked: true, type: 'string' },
  dateHired: { label: 'Date hired', isLocked: true, type: 'date' },
  appointmentStatus: { label: 'Appointment status', isLocked: true, type: 'appointmentStatus' },
  school: { label: 'Current school', isLocked: true, type: 'string' },
  district: { label: 'Current district', isLocked: true, type: 'string' },
} as const;

export type ExtractableField = keyof typeof FIELD_DEFINITIONS;
export interface DocumentExtractionResult {
  templateId: string;
  fields: Partial<Record<ExtractableField, string>>;
  confidence: number;
  /** Legacy Google results remain readable during the provider transition. */
  provider: 'TESSERACT' | 'GOOGLE_DOCUMENT_AI';
  employmentEntries?: EmploymentEntry[];
  approvedEntryIndexes?: number[];
}

export interface EmploymentEntry {
  dateFrom: string;
  dateTo: string | null;
  positionTitle: string;
  department: string;
  status: string | null;
}

export const EXTRACTABLE_DOCUMENT_TYPES = ['PDS', 'WES', 'APPOINTMENT', 'COE'] as const;

const employmentDate = (raw: string): string | null => {
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
  }
  // Ambiguous all-numeric dates are not guessed; a wrong service date is worse
  // than a row that requires manual entry.
  if (!/[A-Za-z]/.test(value)) return null;
  const match = /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(?:(\d{1,2}),?\s+)?(\d{4})$/i.exec(value);
  if (!match) return null;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const month = months.indexOf(match[1].toLowerCase().slice(0, 3));
  const day = Number(match[2] || 1);
  const year = Number(match[3]);
  const d = new Date(Date.UTC(year, month, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day ? d.toISOString().slice(0, 10) : null;
};

export const mapEmploymentEntries = (documentTypeId: string, source: Record<string, string>): EmploymentEntry[] => {
  if (documentTypeId !== 'WES' && documentTypeId !== 'COE') return [];
  const indexes = [...new Set(Object.keys(source).map(key => /^work\.(\d+)\./.exec(key)?.[1]).filter((value): value is string => !!value))]
    .map(Number).sort((a, b) => a - b);
  if (documentTypeId === 'COE' && indexes.length === 0) indexes.push(0);
  return indexes.slice(0, 50).flatMap(index => {
    const prefix = documentTypeId === 'COE' && !source[`work.${index}.from`] ? 'employment' : `work.${index}`;
    const from = employmentDate(source[`${prefix}.from`] || '');
    const toRaw = source[`${prefix}.to`] || '';
    const to = /^(present|current|ongoing)$/i.test(toRaw.trim()) ? null : employmentDate(toRaw);
    const positionTitle = (source[`${prefix}.position`] || '').trim().slice(0, 200);
    const department = (source[`${prefix}.office`] || source[`${prefix}.agency`] || '').trim().slice(0, 200);
    if (!from || (toRaw.trim() && to === null && !/^(present|current|ongoing)$/i.test(toRaw.trim())) || !positionTitle || !department || (to && to < from)) return [];
    return [{ dateFrom: from, dateTo: to, positionTitle, department, status: (source[`${prefix}.status`] || '').trim().slice(0, 100) || null }];
  });
};

export const approvedEmploymentEntries = (value: unknown): EmploymentEntry[] => {
  if (!isDocumentExtractionResult(value) || !Array.isArray(value.employmentEntries) || !Array.isArray(value.approvedEntryIndexes)) return [];
  return value.approvedEntryIndexes.flatMap(index => {
    if (!Number.isInteger(index) || index < 0 || index >= value.employmentEntries!.length) return [];
    const entry = value.employmentEntries![index];
    if (!entry || !/^\d{4}-\d{2}-\d{2}$/.test(entry.dateFrom) || !entry.positionTitle || !entry.department) return [];
    return [entry];
  });
};

// WES and historical employment certificates describe past work, not the
// current appointment. Never map their position/date to current profile fields.
export const DOCUMENT_FIELD_MAP: Record<string, readonly ExtractableField[]> = {
  PDS: ['firstName', 'lastName', 'middleName', 'suffix', 'birthDate', 'gender', 'civilStatus', 'contactNumber', 'address'],
  WES: [],
  APPOINTMENT: ['designation', 'dateHired', 'appointmentStatus', 'school', 'district'],
  COE: [],
};

export const isDocumentExtractionResult = (value: unknown): value is DocumentExtractionResult => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<DocumentExtractionResult>;
  return (candidate.provider === 'TESSERACT' || candidate.provider === 'GOOGLE_DOCUMENT_AI')
    && typeof candidate.templateId === 'string'
    && typeof candidate.confidence === 'number'
    && Number.isFinite(candidate.confidence)
    && candidate.confidence >= 0 && candidate.confidence <= 1
    && !!candidate.fields && typeof candidate.fields === 'object' && !Array.isArray(candidate.fields);
};

/** Convert only recognized labels returned by server-side OCR. */
export const mapTrustedOcrFields = (
  documentTypeId: string,
  source: Record<string, string>,
  confidence: number,
): DocumentExtractionResult => {
  const fields: DocumentExtractionResult['fields'] = {};
  if (documentTypeId === 'PDS') {
    fields.firstName = source.firstName;
    fields.lastName = source.surname;
    fields.middleName = source.middleName;
    fields.suffix = source.nameExtension;
    const birthDate = employmentDate(source.birthDate || '');
    if (birthDate) fields.birthDate = birthDate;
    fields.contactNumber = source.mobile;
    const address = [source['residential.house'], source['residential.street'], source['residential.subdivision'],
      source['residential.barangay'], source['residential.city'], source['residential.province'], source.residentialZip]
      .filter(value => typeof value === 'string' && value.trim()).join(', ');
    if (address) fields.address = address;
    if (source['sex.male'] && !source['sex.female']) fields.gender = 'MALE';
    if (source['sex.female'] && !source['sex.male']) fields.gender = 'FEMALE';
    const statuses = ['single', 'married', 'widowed', 'separated'].filter(value => source[`civilStatus.${value}`]);
    if (statuses.length === 1) fields.civilStatus = statuses[0].toUpperCase();
  } else if (documentTypeId === 'APPOINTMENT') {
    for (const field of DOCUMENT_FIELD_MAP.APPOINTMENT) {
      if (typeof source[field] === 'string') fields[field] = field === 'dateHired' ? employmentDate(source[field]) || undefined : source[field];
    }
  }
  const employmentEntries = mapEmploymentEntries(documentTypeId, source);
  return { templateId: documentTypeId.toLowerCase(), fields, confidence, provider: 'TESSERACT', ...(employmentEntries.length ? { employmentEntries } : {}) };
};

export const buildExtractionComparison = (
  extracted: DocumentExtractionResult,
  personnel: Record<string, unknown>,
  documentTypeId: string,
) => {
  const allowed = DOCUMENT_FIELD_MAP[documentTypeId] || [];
  return allowed.flatMap(field => {
    const raw = extracted.fields[field];
    if (typeof raw !== 'string' || !raw.trim()) return [];
    const current = personnel[field];
    const currentValue = current instanceof Date ? current.toISOString().slice(0, 10) : String(current ?? '').trim();
    const extractedValue = raw.trim();
    return [{
      field,
      label: FIELD_DEFINITIONS[field].label,
      currentValue: currentValue || null,
      extractedValue,
      changed: currentValue.toLowerCase() !== extractedValue.toLowerCase(),
      isLocked: FIELD_DEFINITIONS[field].isLocked,
    }];
  });
};
