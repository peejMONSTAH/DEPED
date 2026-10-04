/// Privacy Notice shown at first sign-in. Keep the version and wording in step with
/// web/src/constants/privacyNotice.ts and backend/src/utils/privacy-notice.util.ts
/// (a backend test checks the three versions match). The three contact values are
/// for the Division to complete.
const String privacyNoticeVersion = '2026-10-04';

const String noticeDpo = 'To be provided by the Schools Division Office of Koronadal City';
const String noticeRetention =
    'To be set by the Schools Division Office of Koronadal City, following DepEd and Civil Service records rules';
const String noticeHosting =
    'Cloud services that store the database and uploaded documents. The Division will state the provider and its location here.';

const String privacyNoticeSummary =
    'I have read the Privacy Notice and understand how Digital 201 collects, uses, stores and shares my personal data, '
    'including my Personal Data Sheet, 201 documents and service records, for personnel records, document validation, '
    'and promotion and appointment processing in the Schools Division of Koronadal City, in accordance with the '
    'Data Privacy Act of 2012 (RA 10173).';

class NoticeSection {
  final String title;
  final List<String> body;
  const NoticeSection(this.title, this.body);
}

const List<NoticeSection> privacyNotice = [
  NoticeSection('What we collect', [
    'Your name and identity details, contact information, civil status, position and station, service records, and the documents you upload to your 201 file, such as your Personal Data Sheet, transcripts, certificates and performance ratings.',
    'When you sign in we also record the device you use and when, to keep your account safe.',
  ]),
  NoticeSection('Why we use it', [
    'To keep your digital 201 file, validate your documents, process promotion applications and appointments, send you notifications about your records, and keep an audit trail of who did what.',
    'Documents may be read by software (OCR) to suggest values or to help a reviewer check them. A person always reviews those values before they are used.',
  ]),
  NoticeSection('Who can see it', [
    'Only people who need your data for their role: your station’s Administrative Officer II, the Human Resource Management Officer (HRMO), and the System Administrator. Access is limited to the records each role handles.',
    'We do not sell your data or use it for advertising.',
  ]),
  NoticeSection('Where and how it is kept', [
    noticeHosting,
    'Access is protected by sign-in, device verification and role-based permissions. Actions on records are written to an audit log.',
  ]),
  NoticeSection('How long we keep it', [noticeRetention]),
  NoticeSection('Your rights', [
    'You may ask to see the personal data we hold about you, to correct it, to object to its processing, or to ask that it be blocked or removed where the law allows. Some personnel records must be kept under government record-keeping rules.',
    'You may also file a complaint with the National Privacy Commission (privacy.gov.ph).',
  ]),
  NoticeSection('Who to contact', ['Data Protection Officer: $noticeDpo.']),
];
