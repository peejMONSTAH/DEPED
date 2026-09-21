/**
 * Annex C — Checklist of Requirements and Omnibus Sworn Statement
 * (DepEd Order No. 007, s. 2023).
 *
 * This is the single source of truth. The wording used to be copied into the web
 * app and the Flutter app, which meant a DepEd revision had to be applied in three
 * places and an app release before every applicant saw the same list. Both clients
 * now fetch this and keep their own copy only as an offline fallback.
 *
 * `suggestedDocumentTypeIds` links each requirement to the 201 document types that
 * can satisfy it, so the "Attach from 201" picker can surface the right stored
 * documents instead of showing everything the applicant has ever uploaded.
 */

export interface AnnexCRequirement {
  code: string;
  title: string;
  description: string;
  isMandatory: boolean;
  suggestedDocumentTypeIds: string[];
}

export const ANNEX_C_REQUIREMENTS: AnnexCRequirement[] = [
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
    suggestedDocumentTypeIds: ['TRAINING_CERT'],
  },
  {
    code: 'g',
    title: 'Certificate of Employment / Service Record',
    description: 'Photocopy of Certificate of Employment, Contract of Service, or duly signed Service Record, whichever is/are applicable',
    isMandatory: true,
    suggestedDocumentTypeIds: ['COE'],
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
    suggestedDocumentTypeIds: ['OMNIBUS_CERT', 'CAV'],
  },
  {
    code: 'k',
    title: 'Other Documents / Means of Verification (MOVs)',
    description: 'Other Means of Verification (MOVs) showing Outstanding Accomplishments, Application of Education, and Application of L&D, or portfolio',
    isMandatory: false,
    suggestedDocumentTypeIds: ['OTHER'],
  },
];

/** The codes an applicant must satisfy before AO II can mark the pack complete. */
export const MANDATORY_ANNEX_C_CODES = ANNEX_C_REQUIREMENTS
  .filter(item => item.isMandatory)
  .map(item => item.code);
