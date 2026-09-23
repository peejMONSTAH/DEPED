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

export const documentAiConfigured = () => config.google.ocrProvider === 'GOOGLE_DOCUMENT_AI'
  && Boolean(config.google.projectId && config.google.documentAiLocation && config.google.documentAiProcessorId);

export const extractPdsWithDocumentAi = async (buffer: Buffer, mimeType: string): Promise<OcrResult> => {
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
  const fields: Record<string, string> = {};
  for (const page of document?.pages || []) {
    for (const formField of page.formFields || []) {
      const label = anchorText(text, formField.fieldName?.textAnchor);
      const value = anchorText(text, formField.fieldValue?.textAnchor);
      const confidence = Number(formField.fieldValue?.confidence || formField.fieldName?.confidence || 0);
      if (!label || !value) continue;
      rawFields.push({ label, value, confidence });
      const key = mappedKey(label);
      if (key && !fields[key]) fields[key] = value;
    }
  }
  const confidence = rawFields.length ? rawFields.reduce((sum, field) => sum + field.confidence, 0) / rawFields.length : 0;
  return { templateId: 'pds-2025', fields, rawFields: rawFields.slice(0, 500), provider: 'GOOGLE_DOCUMENT_AI', confidence };
};
