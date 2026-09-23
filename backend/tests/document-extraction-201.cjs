require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/prisma').default;
const {
  getExtractionReview,
  applyExtractionTo201,
} = require('../src/controllers/personnel-documents.controller');
const { mapTrustedOcrFields, buildExtractionComparison } = require('../src/utils/document-extraction.util');

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
