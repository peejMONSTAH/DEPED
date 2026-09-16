type StructuredData = {
  templateId?: string;
  fields?: Record<string, unknown>;
  confirmation?: { confirmedAt?: string; confirmedByUserId?: number };
};

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export const readStructuredData = (value: unknown): StructuredData | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as StructuredData;
  if (!candidate.fields || typeof candidate.fields !== 'object' || Array.isArray(candidate.fields)) return null;
  return candidate;
};

export const isConfirmedPdsData = (value: unknown) => {
  const data = readStructuredData(value);
  return data?.templateId === 'pds-2025' && Boolean(data.confirmation?.confirmedAt && data.confirmation?.confirmedByUserId);
};

export const pdsProfileProposal = (value: unknown) => {
  const data = readStructuredData(value);
  const fields = data?.fields || {};
  const sex = clean(fields['sex.male']) ? 'MALE' : clean(fields['sex.female']) ? 'FEMALE' : undefined;
  const civilStatus = ['single', 'married', 'widowed', 'separated'].find(k => clean(fields[`civilStatus.${k}`]));
  const birthRaw = clean(fields.birthDate);
  const birthDate = birthRaw ? new Date(birthRaw) : undefined;
  const addressParts = [
    fields['residential.house'], fields['residential.street'], fields['residential.subdivision'],
    fields['residential.barangay'], fields['residential.city'], fields['residential.province'], fields.residentialZip,
  ].map(clean).filter(Boolean);

  return {
    firstName: clean(fields.firstName) || undefined,
    lastName: clean(fields.surname) || undefined,
    middleName: clean(fields.middleName) || undefined,
    suffix: clean(fields.nameExtension) || undefined,
    birthDate: birthDate && !Number.isNaN(birthDate.getTime()) ? birthDate : undefined,
    gender: sex,
    civilStatus: civilStatus?.toUpperCase(),
    contactNumber: clean(fields.mobile) || undefined,
    address: addressParts.length ? addressParts.join(', ') : undefined,
  };
};

export const pdsComparison = (personnel: Record<string, any>, value: unknown) => {
  const proposal = pdsProfileProposal(value);
  return Object.entries(proposal).filter(([, proposed]) => proposed !== undefined).map(([field, proposed]) => {
    const current = personnel[field];
    const currentComparable = current instanceof Date ? current.toISOString().slice(0, 10) : (current ?? '');
    const proposedComparable = proposed instanceof Date ? proposed.toISOString().slice(0, 10) : proposed;
    return { field, current: currentComparable, proposed: proposedComparable, changed: String(currentComparable) !== String(proposedComparable) };
  });
};
