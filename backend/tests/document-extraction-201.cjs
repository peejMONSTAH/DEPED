require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/prisma').default;
const {
  getExtractionReview,
  applyExtractionTo201,
} = require('../src/controllers/personnel-documents.controller');
const { mapTrustedOcrFields, buildExtractionComparison } = require('../src/utils/document-extraction.util');
const { mapOcrFormFields, parseOcrLabeledFields, parseTesseractTsv } = require('../src/services/tesseract-ocr.service');
const { approvedEmploymentEntries } = require('../src/utils/document-extraction.util');
const { isDocumentExtractionResult } = require('../src/utils/document-extraction.util');
const { getMyProfile } = require('../src/controllers/personnel.controller');

test('official WES repeated labels preserve distinct historical jobs', () => {
  const raw = [
    ['Duration:', 'January 2020 to March 2022'], ['Position:', 'Teacher I'], ['Name of Office/Unit:', 'Morales Elementary School'],
    ['Duration:', 'April 2022 to Present'], ['Position:', 'Teacher II'], ['Name of Agency/Organization and Location:', 'DepEd Koronadal'],
  ].map(([label, value]) => ({ label, value, confidence: 0.96 }));
  const fields = mapOcrFormFields(raw, 'WES');
  const proposal = mapTrustedOcrFields('WES', fields, 0.96);
  assert.equal(proposal.fields.designation, undefined);
  assert.equal(proposal.employmentEntries?.length, 2);
  assert.deepEqual(proposal.employmentEntries?.map(entry => entry.positionTitle), ['Teacher I', 'Teacher II']);
  assert.deepEqual(proposal.employmentEntries?.map(entry => entry.dateFrom), ['2020-01-01', '2022-04-01']);
  assert.equal(proposal.employmentEntries?.[1].dateTo, null);
  assert.equal(proposal.provider, 'TESSERACT');
});

test('Tesseract TSV lines yield labelled WES fields and bounded confidence', () => {
  const header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
  const row = (line, word, text, confidence) => `5\t1\t1\t1\t${line}\t${word}\t0\t0\t10\t10\t${confidence}\t${text}`;
  const tsv = [header, row(1, 1, 'Duration:', 96), row(1, 2, 'January', 92), row(1, 3, '2020', 94), row(1, 4, 'to', 98), row(1, 5, 'Present', 91), row(2, 1, 'Position:', 97), row(2, 2, 'Teacher', 95), row(2, 3, 'II', 93)].join('\n');
  const parsed = parseTesseractTsv(tsv);
  assert.deepEqual(parsed.lines, ['Duration: January 2020 to Present', 'Position: Teacher II']);
  assert.ok(parsed.confidence > 0.9 && parsed.confidence < 1);
  assert.deepEqual(parseOcrLabeledFields(parsed.lines, parsed.lineScores).map(field => field.value), ['January 2020 to Present', 'Teacher II']);
  assert.ok(parseOcrLabeledFields(parsed.lines, parsed.lineScores).every(field => field.confidence > 0.9));
});

test('new Tesseract results and previously saved Google results remain reviewable', () => {
  const result = mapTrustedOcrFields('PDS', { surname: 'Santos' }, 0.94);
  assert.equal(result.provider, 'TESSERACT');
  assert.equal(isDocumentExtractionResult(result), true);
  assert.equal(isDocumentExtractionResult({ ...result, provider: 'GOOGLE_DOCUMENT_AI' }), true);
  assert.equal(isDocumentExtractionResult({ ...result, provider: 'CLIENT_SUPPLIED' }), false);
});

test('Tesseract month-name dates are normalized before Digital 201 review', () => {
  assert.equal(mapTrustedOcrFields('PDS', { birthDate: 'May 15, 1990' }, 0.94).fields.birthDate, '1990-05-15');
  assert.equal(mapTrustedOcrFields('APPOINTMENT', { dateHired: 'April 2022' }, 0.94).fields.dateHired, '2022-04-01');
  assert.equal(mapTrustedOcrFields('PDS', { birthDate: '05/15/1990' }, 0.94).fields.birthDate, undefined);
});

test('employment certificate maps only reviewed history, never current appointment', () => {
  const fields = mapOcrFormFields([
    { label: 'Position', value: 'Administrative Assistant', confidence: 0.94 },
    { label: 'Employer', value: 'Previous Agency', confidence: 0.94 },
    { label: 'Period of Employment', value: 'May 2016 to June 2019', confidence: 0.94 },
  ], 'COE');
  const proposal = mapTrustedOcrFields('COE', fields, 0.94);
  assert.equal(proposal.employmentEntries?.length, 1);
  assert.deepEqual(proposal.fields, {});
  assert.deepEqual(approvedEmploymentEntries({ ...proposal, approvedEntryIndexes: [0] }), proposal.employmentEntries);
  assert.deepEqual(approvedEmploymentEntries({ ...proposal, approvedEntryIndexes: [] }), []);
  assert.deepEqual(mapTrustedOcrFields('COE', { ...fields, 'employment.from': '05/01/2016' }, 0.94).employmentEntries, undefined);
});

test('client-style arbitrary fields do not enter a PDS profile proposal', () => {
  const extracted = mapTrustedOcrFields('PDS', {
    surname: 'Santos',
    designation: 'School Principal IV',
    district: 'District 6',
  }, 0.93);
  assert.deepEqual(buildExtractionComparison(extracted, { lastName: 'Reyes' }, 'PDS').map(item => item.field), ['lastName']);
  assert.equal(extracted.fields.designation, undefined);
  assert.equal(extracted.fields.district, undefined);
});

test('Document Extraction Review: calculates field diffs, change flags, and locked indicators', async () => {
  const origFindUnique = prisma.personnelFile.findUnique;
  try {
    prisma.personnelFile.findUnique = async () => ({
      id: 42,
      personnelId: 101,
      documentTypeId: 'PDS',
      documentTypeName: 'Personal Data Sheet (CS Form 212)',
      originalFileName: 'PDS_2025_Signed.pdf',
      ocrStatus: 'NEEDS_REVIEW',
      ocrConfidenceScore: 0.94,
      ocrProcessedAt: new Date('2026-09-24T00:00:00Z'),
      ocrExtractedDataJson: {
        templateId: 'pds',
        provider: 'GOOGLE_DOCUMENT_AI',
        fields: {
          firstName: 'Juan',
          lastName: 'Dela Cruz',
          middleName: 'Reyes',
          birthDate: '1985-05-15',
          gender: 'MALE',
          civilStatus: 'MARRIED',
          contactNumber: '09179998888',
          address: 'Barangay 1, Koronadal City',
        },
        confidence: 0.94,
      },
      personnel: {
        id: 101,
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        middleName: 'Reyes',
        birthDate: new Date('1985-05-15T00:00:00Z'),
        gender: 'MALE',
        civilStatus: 'SINGLE', // Changed from SINGLE to MARRIED
        contactNumber: '09171112222', // Changed
        address: 'Barangay 1, Koronadal City',
        designation: 'Teacher I',
        school: 'Bacongco Central ES',
        district: 'District 1',
      },
    });

    let statusCode = 0;
    let resData = null;
    const req = {
      params: { id: '42' },
      user: { userId: 5, personnelId: 101, role: 'TEACHING_PERSONNEL' },
    };
    const res = {
      status(code) { statusCode = code; return this; },
      json(payload) { resData = payload; return this; },
      locals: {},
    };

    await getExtractionReview(req, res);

    assert.equal(statusCode, 200);
    assert.equal(resData?.status, 'success');
    assert.equal(resData?.data?.documentId, 42);
    assert.equal(resData?.data?.confidenceScore, 0.94);

    const fields = resData?.data?.fields;
    assert.ok(Array.isArray(fields));

    const civilStatusField = fields.find(f => f.field === 'civilStatus');
    assert.ok(civilStatusField);
    assert.equal(civilStatusField.currentValue, 'SINGLE');
    assert.equal(civilStatusField.extractedValue, 'MARRIED');
    assert.equal(civilStatusField.changed, true);
    assert.equal(civilStatusField.isLocked, true);

    const contactField = fields.find(f => f.field === 'contactNumber');
    assert.ok(contactField);
    assert.equal(contactField.currentValue, '09171112222');
    assert.equal(contactField.extractedValue, '09179998888');
    assert.equal(contactField.changed, true);
    assert.equal(contactField.isLocked, false);

    const firstNameField = fields.find(f => f.field === 'firstName');
    assert.ok(firstNameField);
    assert.equal(firstNameField.changed, false);
  } finally {
    prisma.personnelFile.findUnique = origFindUnique;
  }
});

test('Document Extraction Apply: updates locked 201 fields, updates ocrStatus to APPLIED, and writes ValidationLog', async () => {
  const origFindUnique = prisma.personnelFile.findUnique;
  const origTransaction = prisma.$transaction;
  let validationLogData = null;
  let updatedPersonnelData = null;
  let updatedFileId = null;

  try {
    prisma.personnelFile.findUnique = async () => ({
      id: 42,
      personnelId: 101,
      documentTypeId: 'APPOINTMENT',
      documentTypeName: 'Latest Appointment',
      originalFileName: 'Appointment_Form_3.pdf',
      ocrStatus: 'NEEDS_REVIEW',
      ocrExtractedDataJson: {
        templateId: 'appointment',
        provider: 'GOOGLE_DOCUMENT_AI',
        confidence: 0.94,
        fields: {
          designation: 'Teacher II',
          appointmentStatus: 'PERMANENT',
          dateHired: '2024-08-01',
        },
      },
      personnel: {
        id: 101,
        firstName: 'Maria',
        lastName: 'Santos',
        designation: 'Teacher I',
        appointmentStatus: 'PROVISIONAL',
        dateHired: new Date('2022-01-15T00:00:00Z'),
        birthDate: new Date('1990-01-01T00:00:00Z'),
        gender: 'FEMALE',
        civilStatus: 'SINGLE',
        contactNumber: '09123456789',
        address: 'Zone 2, Koronadal',
      },
    });

    prisma.$transaction = async (callback) => {
      const mockTx = {
        $executeRaw: async () => {},
        personnel: {
          findUnique: async () => ({
            id: 101,
            firstName: 'Maria',
            lastName: 'Santos',
            designation: 'Teacher I',
            appointmentStatus: 'PROVISIONAL',
            dateHired: new Date('2022-01-15T00:00:00Z'),
            birthDate: new Date('1990-01-01T00:00:00Z'),
            gender: 'FEMALE',
            civilStatus: 'SINGLE',
            contactNumber: '09123456789',
            address: 'Zone 2, Koronadal',
          }),
          update: async (args) => {
            updatedPersonnelData = args.data;
            return { id: 101, ...args.data };
          },
        },
        personnelFile: {
          findUnique: async () => ({
            id: 42,
            personnelId: 101,
            documentTypeId: 'APPOINTMENT',
            deletedAt: null,
            ocrStatus: 'NEEDS_REVIEW',
            ocrExtractedDataJson: {
              provider: 'GOOGLE_DOCUMENT_AI', templateId: 'appointment', confidence: 0.94,
              fields: { designation: 'Teacher II', appointmentStatus: 'PERMANENT', dateHired: '2024-08-01' },
            },
          }),
          update: async (args) => {
            updatedFileId = args.where.id;
            return { id: args.where.id, ...args.data };
          },
        },
        validationLog: {
          create: async (args) => {
            validationLogData = args.data;
            return { id: 1, ...args.data };
          },
        },
      };
      return callback(mockTx);
    };

    let statusCode = 0;
    let resData = null;
    const req = {
      params: { id: '42' },
      body: {
        approvedFields: ['designation', 'appointmentStatus', 'dateHired'],
      },
      user: { userId: 5, personnelId: 101, role: 'TEACHING_PERSONNEL' },
    };
    const res = {
      status(code) { statusCode = code; return this; },
      json(payload) { resData = payload; return this; },
      locals: {},
    };

    await applyExtractionTo201(req, res);

    assert.equal(statusCode, 200);
    assert.equal(resData?.status, 'success');
    assert.equal(updatedPersonnelData?.designation, 'Teacher II');
    assert.equal(updatedPersonnelData?.appointmentStatus, 'PERMANENT');
    assert.ok(updatedPersonnelData?.dateHired instanceof Date);
    assert.equal(updatedFileId, 42);

    assert.ok(validationLogData);
    assert.equal(validationLogData.entityType, 'Personnel');
    assert.equal(validationLogData.entityId, 101);
    assert.equal(validationLogData.action, 'DIGITAL_201_FIELDS_UPDATED_FROM_DOCUMENT');
    assert.equal(validationLogData.detailsJson.documentId, 42);
    assert.equal(validationLogData.detailsJson.appliedFields.length, 3);
  } finally {
    prisma.personnelFile.findUnique = origFindUnique;
    prisma.$transaction = origTransaction;
  }
});

test('reviewed WES rows are persisted as source-linked 201 evidence without changing current position', async () => {
  const origFindUnique = prisma.personnelFile.findUnique;
  const origTransaction = prisma.$transaction;
  const extraction = mapTrustedOcrFields('WES', {
    'work.0.from': 'January 2020', 'work.0.to': 'March 2022',
    'work.0.position': 'Teacher I', 'work.0.office': 'Morales Elementary School',
  }, 0.95);
  let savedFile;
  let savedAudit;
  try {
    prisma.personnelFile.findUnique = async () => ({
      id: 51, personnelId: 101, documentTypeId: 'WES', deletedAt: null,
      ocrStatus: 'NEEDS_REVIEW', ocrExtractedDataJson: extraction, personnel: { id: 101 },
    });
    prisma.$transaction = async callback => callback({
      $executeRaw: async () => {},
      personnelFile: {
        findUnique: prisma.personnelFile.findUnique,
        update: async args => { savedFile = args.data; return { id: 51 }; },
      },
      validationLog: { create: async args => { savedAudit = args.data; return { id: 1 }; } },
    });
    let code;
    let payload;
    await applyExtractionTo201({
      params: { id: '51' }, body: { approvedEntryIndexes: [0], approvedFields: [] },
      user: { userId: 5, personnelId: 101, role: 'TEACHING_PERSONNEL' },
    }, {
      status(value) { code = value; return this; },
      json(value) { payload = value; return this; },
      locals: {},
    });
    assert.equal(code, 200);
    assert.equal(payload?.data?.appliedEntryCount, 1);
    assert.equal(savedFile?.ocrStatus, 'APPLIED');
    assert.deepEqual(savedFile?.ocrExtractedDataJson?.approvedEntryIndexes, [0]);
    assert.equal(savedAudit?.action, 'DIGITAL_201_EMPLOYMENT_HISTORY_UPDATED_FROM_DOCUMENT');
    assert.deepEqual(approvedEmploymentEntries(savedFile.ocrExtractedDataJson), extraction.employmentEntries);
  } finally {
    prisma.personnelFile.findUnique = origFindUnique;
    prisma.$transaction = origTransaction;
  }
});

test('Digital 201 serves approved WES and COE rows once while preserving the current appointment', async () => {
  const oldPersonnel = prisma.personnel.findUnique;
  const oldUploaded = prisma.uploadedDocument.findMany;
  const oldFiles = prisma.personnelFile.findMany;
  const wes = { ...mapTrustedOcrFields('WES', {
    'work.0.from': '2020-01-01', 'work.0.to': '2022-03-31',
    'work.0.position': 'Teacher I', 'work.0.office': 'Morales Elementary School',
  }, 0.95), approvedEntryIndexes: [0] };
  const coe = { ...mapTrustedOcrFields('COE', {
    'employment.from': '2020-01-01', 'employment.to': '2022-03-31',
    'employment.position': 'Teacher I', 'employment.agency': 'Morales Elementary School',
  }, 0.94), approvedEntryIndexes: [0] };
  try {
    prisma.personnel.findUnique = async () => ({ id: 101, designation: 'Teacher II', dateHired: new Date('2022-04-01T00:00:00Z'), careerHistoryEntries: [] });
    prisma.uploadedDocument.findMany = async () => [];
    prisma.personnelFile.findMany = async () => [
      { id: 51, documentTypeId: 'WES', ocrExtractedDataJson: wes },
      { id: 52, documentTypeId: 'COE', ocrExtractedDataJson: coe },
    ];
    let payload;
    await getMyProfile({ user: { userId: 5, personnelId: 101, role: 'TEACHING_PERSONNEL' } }, {
      status() { return this; }, json(value) { payload = value; return this; },
    });
    assert.equal(payload?.data?.designation, 'Teacher II');
    assert.equal(payload?.data?.careerHistoryEntries?.length, 1);
    assert.equal(payload?.data?.profileDocumentData?.wes?.fields?.['work.0.position'], 'Teacher I');
    assert.equal(payload?.data?.profileDocumentData?.wes?.source, 'MY_DOCUMENTS');
  } finally {
    prisma.personnel.findUnique = oldPersonnel;
    prisma.uploadedDocument.findMany = oldUploaded;
    prisma.personnelFile.findMany = oldFiles;
  }
});
