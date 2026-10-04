/**
 * Privacy Notice shown at first sign-in and at /privacy. The version must match
 * PRIVACY_NOTICE_VERSION in the backend (utils/privacy-notice.util.ts); bump both
 * together when the notice changes so everyone is asked to read it again.
 *
 * The three CONTACT values below are for the Division to complete (data protection
 * officer, retention period, where data is hosted). Until then the notice says so
 * plainly instead of guessing.
 */
export const PRIVACY_NOTICE_VERSION = '2026-10-04';

export const NOTICE_CONTACT = {
  dpo: 'To be provided by the Schools Division Office of Koronadal City',
  retention: 'To be set by the Schools Division Office of Koronadal City, following DepEd and Civil Service records rules',
  hosting: 'Cloud services that store the database and uploaded documents. The Division will state the provider and its location here.',
};

export interface NoticeSection { title: string; body: string[] }

export const PRIVACY_NOTICE_SUMMARY =
  'I have read the Privacy Notice and understand how Digital 201 collects, uses, stores and shares my personal data, including my Personal Data Sheet, 201 documents and service records, for personnel records, document validation, and promotion and appointment processing in the Schools Division of Koronadal City, in accordance with the Data Privacy Act of 2012 (RA 10173).';

export const PRIVACY_NOTICE: NoticeSection[] = [
  {
    title: 'What we collect',
    body: [
      'Your name and identity details, contact information, civil status, position and station, service records, and the documents you upload to your 201 file, such as your Personal Data Sheet, transcripts, certificates and performance ratings.',
      'When you sign in we also record the device you use and when, to keep your account safe.',
    ],
  },
  {
    title: 'Why we use it',
    body: [
      'To keep your digital 201 file, validate your documents, process promotion applications and appointments, send you notifications about your records, and keep an audit trail of who did what.',
      'Documents may be read by software (OCR) to suggest values or to help a reviewer check them. A person always reviews those values before they are used.',
    ],
  },
  {
    title: 'Who can see it',
    body: [
      'Only people who need your data for their role: your station’s Administrative Officer II, the Human Resource Management Officer (HRMO), and the System Administrator. Access is limited to the records each role handles.',
      'We do not sell your data or use it for advertising.',
    ],
  },
  {
    title: 'Where and how it is kept',
    body: [
      NOTICE_CONTACT.hosting,
      'Access is protected by sign-in, device verification and role-based permissions. Actions on records are written to an audit log.',
    ],
  },
  {
    title: 'How long we keep it',
    body: [NOTICE_CONTACT.retention],
  },
  {
    title: 'Your rights',
    body: [
      'You may ask to see the personal data we hold about you, to correct it, to object to its processing, or to ask that it be blocked or removed where the law allows. Some personnel records must be kept under government record-keeping rules.',
      'You may also file a complaint with the National Privacy Commission (privacy.gov.ph).',
    ],
  },
  {
    title: 'Who to contact',
    body: [`Data Protection Officer: ${NOTICE_CONTACT.dpo}.`],
  },
];
