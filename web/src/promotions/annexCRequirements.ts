import type { AxiosInstance } from 'axios';

/**
 * The Annex C documentary requirements (DO 007, s. 2023), in one place for
 * every web screen. GET /promotions/annex-c-requirements is the source of
 * truth; ANNEX_C_FALLBACK is its offline copy and must read exactly like
 * backend/src/utils/annex-c.util.ts (a test compares them). The AO II
 * verification modal used to carry its own differently worded list, so an
 * applicant and their verifier saw different titles for the same item.
 */
export interface AnnexCRequirement {
  code: string;
  title: string;
  description: string;
  isMandatory: boolean;
  suggestedDocumentTypeIds?: string[];
}

export const ANNEX_C_FALLBACK: readonly AnnexCRequirement[] = [
  {
    code: 'a',
    title: 'Letter of Intent',
    description: 'Letter of intent addressed to the Head of Office or highest human resource officer indicating position & item number',
    isMandatory: true,
    suggestedDocumentTypeIds: ['LETTER_OF_INTENT'],
  },
  {
    code: 'b',
    title: 'Personal Data Sheet (PDS) & Work Experience Sheet',
    description: 'Duly accomplished Personal Data Sheet (PDS) (CS Form No. 212, Revised 2017) and Work Experience Sheet, if applicable',
    isMandatory: true,
    suggestedDocumentTypeIds: ['PDS', 'WES'],
  },
  {
    code: 'c',
    title: 'Photocopy of Valid PRC License / Identification Card',
    description: 'Photocopy of valid and updated PRC License/ID, if applicable',
    isMandatory: false,
    suggestedDocumentTypeIds: ['LICENSE'],
  },
  {
    code: 'd',
    title: 'Certificate of Eligibility / Report of Rating',
    description: 'Photocopy of Certificate of Eligibility / Rating (CSC / PRC / PBET / LET), if applicable',
    isMandatory: false,
    suggestedDocumentTypeIds: ['CSC_ELIGIBILITY'],
  },
  {
    code: 'e',
    title: 'Scholastic / Academic Records (TOR & Diploma)',
    description: 'Photocopy of scholastic/academic record such as Transcript of Records (TOR) and Diploma, including graduate/post-graduate completion',
    isMandatory: true,
    suggestedDocumentTypeIds: ['TOR', 'DIPLOMA', 'CAV'],
  },
  {
    code: 'f',
    title: 'Certificates of Training',
    description: 'Photocopy of Certificate/s of Training relevant to the position applied for',
    isMandatory: false,
    suggestedDocumentTypeIds: ['TRAINING_CERTIFICATE'],
  },
  {
    code: 'g',
    title: 'Certificate of Employment / Service Record',
    description: 'Photocopy of Certificate of Employment, Contract of Service, or duly signed Service Record, whichever is/are applicable',
    isMandatory: true,
    suggestedDocumentTypeIds: ['SERVICE_RECORD', 'CERTIFICATE_OF_EMPLOYMENT'],
  },
  {
    code: 'h',
    title: 'Photocopy of Latest Appointment',
    description: 'Photocopy of latest appointment (KSS Form / CS Form 33), if applicable',
    isMandatory: false,
    suggestedDocumentTypeIds: ['APPOINTMENT'],
  },
  {
    code: 'i',
    title: 'Performance Ratings (IPCR)',
    description: 'Photocopy of the Performance Ratings in the last rating period/s covering one (1) year performance prior to the deadline of submission',
    isMandatory: true,
    suggestedDocumentTypeIds: ['PERFORMANCE_RATING'],
  },
  {
    code: 'j',
    title: 'Checklist of Requirements & Omnibus Sworn Statement / CAV',
    description: 'Duly signed Checklist of Requirements and Omnibus Sworn Statement on the Certification on Authenticity and Veracity (CAV) and Data Privacy Consent',
    isMandatory: true,
    suggestedDocumentTypeIds: ['OMNIBUS_SWORN_STATEMENT', 'OTHER'],
  },
  {
    code: 'k',
    title: 'Other Documents / Means of Verification (MOVs)',
    description: 'Other Means of Verification (MOVs) showing Outstanding Accomplishments, Application of Education, and Application of L&D, or portfolio',
    isMandatory: false,
    suggestedDocumentTypeIds: ['OTHER'],
  },
];

let cached: readonly AnnexCRequirement[] | null = null;

/** Server list, cached for the session; the bundled copy only if it cannot load. */
export async function loadAnnexCRequirements(client: Pick<AxiosInstance, 'get'>): Promise<readonly AnnexCRequirement[]> {
  if (cached) return cached;
  try {
    const res = await client.get('/promotions/annex-c-requirements');
    const list = res.data?.data;
    if (Array.isArray(list) && list.length > 0) {
      cached = list.map((item: any) => ({
        code: String(item.code),
        title: String(item.title),
        description: String(item.description),
        isMandatory: Boolean(item.isMandatory),
        suggestedDocumentTypeIds: Array.isArray(item.suggestedDocumentTypeIds) ? item.suggestedDocumentTypeIds : [],
      }));
      return cached;
    }
  } catch {
    // Fall through to the bundled copy.
  }
  return ANNEX_C_FALLBACK;
}
