import { v1 as documentai } from '@google-cloud/documentai';
import { config } from '../config';

type OcrResult = {
  templateId: 'pds-2025';
  fields: Record<string, string>;
  rawFields: Array<{ label: string; value: string; confidence: number }>;
  provider: 'GOOGLE_DOCUMENT_AI';
  confidence: number;
};

const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const FIELD_MATCHERS: Array<[string, RegExp[]]> = [
  ['surname', [/^surname$/, /last name/]],
  ['firstName', [/first name/, /given name/]],
  ['middleName', [/middle name/]],
  ['nameExtension', [/name extension/, /suffix/]],
  ['birthDate', [/date of birth/, /birth date/]],
  ['birthPlace', [/place of birth/]],
  ['mobile', [/mobile number/, /mobile no/, /cellphone/, /contact number/]],
  ['telephone', [/telephone number/, /telephone no/]],
  ['email', [/e mail address/, /^email/]],
  ['residential.house', [/residential.*house/, /house block lot.*residential/]],
  ['residential.street', [/residential.*street/, /^street$/]],
  ['residential.subdivision', [/residential.*subdivision/, /subdivision village/]],
  ['residential.barangay', [/residential.*barangay/, /^barangay$/]],
  ['residential.city', [/residential.*city/, /city municipality/]],
  ['residential.province', [/residential.*province/, /^province$/]],
  ['residentialZip', [/residential.*zip/, /zip code/]],
  ['designation', [/^position title$/, /^position$/, /^designation$/]],
  ['dateHired', [/date of appointment/, /date hired/, /appointment date/]],
  ['appointmentStatus', [/^appointment status$/, /^employment status$/]],
  ['school', [/^school$/, /^station$/, /^school assignment$/]],
  ['district', [/^district$/]],
];

const anchorText = (text: string, anchor: any): string => {
  const segments = anchor?.textSegments || [];
  return segments.map((segment: any) => text.slice(Number(segment.startIndex || 0), Number(segment.endIndex || 0))).join('').trim();
};

const mappedKey = (label: string): string | null => {
  const candidate = normalized(label);
  for (const [key, patterns] of FIELD_MATCHERS) if (patterns.some(pattern => pattern.test(candidate))) return key;
  if (/\bmale\b/.test(candidate) && !/female/.test(candidate)) return 'sex.male';
  if (/female/.test(candidate)) return 'sex.female';
  for (const status of ['single', 'married', 'widowed', 'separated']) if (new RegExp(`\\b${status}\\b`).test(candidate)) return `civilStatus.${status}`;
  return null;
};

const splitDuration = (value: string): [string, string] => {
  const parts = value.split(/\s+(?:to|until|through|-)\s+/i);
  return [parts[0]?.trim() || '', parts[1]?.trim() || ''];
};

/** Keep repeated WES blocks distinct. The official WES has repeated Duration,
 * Position, and Office/Agency labels, so a simple label map loses all but row 1. */
export const mapDocumentAiFormFields = (
  rawFields: Array<{ label: string; value: string; confidence: number }>,
  documentTypeId: string,
): Record<string, string> => {
  const fields: Record<string, string> = {};
  let workIndex = -1;
  for (const item of rawFields) {
    const label = normalized(item.label);
    if (documentTypeId === 'WES') {
      if (/^duration\b/.test(label)) {
        workIndex++;
        const [from, to] = splitDuration(item.value);
        fields[`work.${workIndex}.from`] = from;
        fields[`work.${workIndex}.to`] = to;
      } else if (workIndex >= 0 && /^position\b/.test(label)) {
        fields[`work.${workIndex}.position`] = item.value;
      } else if (workIndex >= 0 && /^(name of office|name of agency|office|agency)/.test(label)) {
        fields[`work.${workIndex}.${label.includes('agency') ? 'agency' : 'office'}`] = item.value;
      }
      continue;
    }
    if (documentTypeId === 'COE') {
      if (/^(position|designation|job title)/.test(label)) fields['employment.position'] = item.value;
      else if (/(employer|company|agency|office|organization)/.test(label)) fields['employment.agency'] = item.value;
      else if (/(period of employment|employment period|inclusive dates|duration)/.test(label)) {
        const [from, to] = splitDuration(item.value);
        fields['employment.from'] = from;
        fields['employment.to'] = to;
      } else if (/(employment status|appointment status)/.test(label)) fields['employment.status'] = item.value;
      continue;
    }
    const key = mappedKey(item.label);
    if (key && !fields[key]) fields[key] = item.value;
  }
  return fields;
};

export const documentAiConfigured = () => config.google.ocrProvider === 'GOOGLE_DOCUMENT_AI'
  && Boolean(config.google.projectId && config.google.documentAiLocation && config.google.documentAiProcessorId);

export const extractPdsWithDocumentAi = async (buffer: Buffer, mimeType: string, documentTypeId = 'PDS'): Promise<OcrResult> => {
  if (!documentAiConfigured()) throw new Error('Google Document AI is not configured.');
  const location = config.google.documentAiLocation;
  const inlineCredentials = config.google.serviceAccountJson
    ? JSON.parse(config.google.serviceAccountJson)
    : undefined;
  const client = new documentai.DocumentProcessorServiceClient({
    apiEndpoint: `${location}-documentai.googleapis.com`,
    ...(inlineCredentials ? { credentials: inlineCredentials } : {}),
  });
  let response: any;
  try {
    const name = client.processorPath(config.google.projectId, location, config.google.documentAiProcessorId);
    [response] = await (client.processDocument({
      name,
      rawDocument: { content: buffer.toString('base64'), mimeType },
    }) as Promise<any>);
  } finally {
    // A client left open keeps its auth/token-refresh channel alive in the
    // background, outside this call's own promise chain — closing it here
    // (success or failure) is what stops a bad credential from surfacing
    // later as an unrelated unhandled rejection.
    await client.close().catch(() => {});
  }
  const document = response.document;
  const text = document?.text || '';
  const rawFields: OcrResult['rawFields'] = [];
  for (const page of document?.pages || []) {
    for (const formField of page.formFields || []) {
      const label = anchorText(text, formField.fieldName?.textAnchor);
      const value = anchorText(text, formField.fieldValue?.textAnchor);
      const confidence = Number(formField.fieldValue?.confidence || formField.fieldName?.confidence || 0);
      if (!label || !value) continue;
      rawFields.push({ label, value, confidence });
    }
  }
  const fields = mapDocumentAiFormFields(rawFields, documentTypeId);
  const confidence = rawFields.length ? rawFields.reduce((sum, field) => sum + field.confidence, 0) / rawFields.length : 0;
  return { templateId: 'pds-2025', fields, rawFields: rawFields.slice(0, 500), provider: 'GOOGLE_DOCUMENT_AI', confidence };
};
