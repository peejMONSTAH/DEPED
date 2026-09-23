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
  provider: 'GOOGLE_DOCUMENT_AI';
}

export const EXTRACTABLE_DOCUMENT_TYPES = ['PDS', 'APPOINTMENT'] as const;

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
  return candidate.provider === 'GOOGLE_DOCUMENT_AI'
    && typeof candidate.templateId === 'string'
    && typeof candidate.confidence === 'number'
    && Number.isFinite(candidate.confidence)
    && candidate.confidence >= 0 && candidate.confidence <= 1
    && !!candidate.fields && typeof candidate.fields === 'object' && !Array.isArray(candidate.fields);
};

/** Convert only recognized labels returned by server-side Document AI. */
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
    fields.birthDate = source.birthDate;
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
      if (typeof source[field] === 'string') fields[field] = source[field];
    }
  }
  return { templateId: documentTypeId.toLowerCase(), fields, confidence, provider: 'GOOGLE_DOCUMENT_AI' };
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
