import { Request, Response } from 'express';
import path from 'path';
import { storeDocument, readDocument, discardUncommittedDocument } from '../services/document-storage.service';
import { canAccessPersonnel } from '../utils/scope.util';
import { Prisma, PersonnelDocumentStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { sendSuccess, sendCreated, sendNotFound, sendBadRequest, sendForbidden, sendConflict } from '../utils/response.util';
import { recordAuditLog } from '../utils/audit.util';
import { logger } from '../utils/logger';
import { generateDocumentAccessToken } from '../utils/jwt.util';
import { denyOutOfScope } from '../utils/access-denial.util';

import { Gender, CivilStatus, AppointmentStatus } from '@prisma/client';
import {
  buildExtractionComparison,
  FIELD_DEFINITIONS,
  DOCUMENT_FIELD_MAP,
  EXTRACTABLE_DOCUMENT_TYPES,
  isDocumentExtractionResult,
  mapTrustedOcrFields,
  DocumentExtractionResult,
} from '../utils/document-extraction.util';
import { documentAiConfigured, extractPdsWithDocumentAi } from '../services/document-ai.service';

const parseDocumentId = (raw: unknown): number | null => {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/**
 * A 201 document is reachable exactly when its owner's personnel record is:
 * PersonnelFile -> Personnel -> station, through the one scope policy.
 */
const refusePersonnelDocument = (req: Request, res: Response, documentId: number, action: string): Promise<void> =>
  denyOutOfScope(req, res, { entityType: 'PersonnelDocument', entityId: documentId, action }, 'Document not found.');

export interface DocumentTypeDefinition {
  id: string;
  name: string;
  supportsExpiration: boolean;
  description: string;
  category: string;
  /** The Annex C checklist item (a-k) this type satisfies, when it maps to one. */
  annexCCode?: string;
}

export const CONFIGURABLE_DOCUMENT_TYPES: DocumentTypeDefinition[] = [
  // Ordered to follow the Annex C promotion pack (items a-k) first, then the
  // remaining 201 file documents. annexCCode records which checklist item a type
  // satisfies, so the "Attach from 201" picker can match stored documents to the
  // requirement instead of leaving most of them filed under OTHER.

  // --- Annex C requirements (DepEd Order No. 007, s. 2023) ---
  { id: 'LETTER_OF_INTENT', name: 'Letter of Intent', supportsExpiration: false, description: 'Letter of intent addressed to the Head of Office indicating position and item number', category: 'Promotion', annexCCode: 'a' },
  { id: 'PDS', name: 'Personal Data Sheet (CS Form 212)', supportsExpiration: false, description: 'Fully accomplished and signed CS Form No. 212 (Revised 2017)', category: 'Civil Service Form', annexCCode: 'b' },
  { id: 'WES', name: 'Work Experience Sheet', supportsExpiration: false, description: 'CS Form No. 212 attachment detailing relevant work experience', category: 'Civil Service Form', annexCCode: 'b' },
  { id: 'LICENSE', name: 'PRC License / ID', supportsExpiration: true, description: 'Valid PRC Professional Identification Card or board licence', category: 'Professional', annexCCode: 'c' },
  { id: 'CSC_ELIGIBILITY', name: 'Certificate of Eligibility / Report of Rating', supportsExpiration: false, description: 'CSC Certificate of Eligibility or Report of Rating (LET, CSC Professional, PBET)', category: 'Eligibility', annexCCode: 'd' },
  { id: 'TOR', name: 'Transcript of Records', supportsExpiration: false, description: 'Official Transcript of Records (TOR)', category: 'Education', annexCCode: 'e' },
  { id: 'DIPLOMA', name: 'Diploma', supportsExpiration: false, description: 'Official college or post-graduate diploma', category: 'Education', annexCCode: 'e' },
  { id: 'CAV', name: 'CAV / Special Order', supportsExpiration: false, description: 'Certification, Authentication and Verification, or CHED/DepEd Special Order', category: 'Education', annexCCode: 'e' },
  { id: 'TRAINING_CERT', name: 'Training Certificate', supportsExpiration: false, description: 'Certificate of completion or participation in training and professional development', category: 'Training', annexCCode: 'f' },
  { id: 'COE', name: 'Certificate of Employment / Service Record', supportsExpiration: false, description: 'Service record, employment certificate or contract from a previous agency or employer', category: 'Employment', annexCCode: 'g' },
  { id: 'APPOINTMENT', name: 'Latest Appointment', supportsExpiration: false, description: 'Latest appointment or plantilla allocation (KSS Form No. 3)', category: 'Employment', annexCCode: 'h' },
  { id: 'PERFORMANCE_RATING', name: 'Performance Rating (IPCR / OPCR)', supportsExpiration: false, description: 'Individual or Office Performance Commitment and Review rating for the rating periods required', category: 'Performance', annexCCode: 'i' },
  { id: 'OMNIBUS_CERT', name: 'Omnibus Sworn Statement', supportsExpiration: false, description: 'Signed omnibus certification of authenticity and veracity of submitted documents', category: 'Promotion', annexCCode: 'j' },

  // --- Other documents held in the 201 file ---
  { id: 'OATH_OF_OFFICE', name: 'Oath of Office (CS Form 32)', supportsExpiration: false, description: 'Duly subscribed and sworn Oath of Office', category: 'Civil Service Form' },
  { id: 'POSITION_DESCRIPTION', name: 'Position Description Form', supportsExpiration: false, description: 'Duly accomplished DBM-CSC Form No. 1 detailing duties and responsibilities', category: 'Civil Service Form' },
  { id: 'SALN', name: 'SALN', supportsExpiration: false, description: 'Latest Statement of Assets, Liabilities and Net Worth', category: 'Civil Service Form' },
  { id: 'GOV_ID', name: 'Government ID', supportsExpiration: true, description: 'Passport, UMID, Driver\u0027s Licence or PhilSys ID', category: 'Identification' },
  { id: 'BIRTH_CERT', name: 'Birth Certificate', supportsExpiration: false, description: 'PSA authenticated Certificate of Live Birth', category: 'Personal' },
  { id: 'MARRIAGE_CERT', name: 'Marriage Certificate', supportsExpiration: false, description: 'PSA authenticated marriage certificate, where applicable', category: 'Personal' },
  { id: 'NBI_CLEARANCE', name: 'NBI Clearance', supportsExpiration: true, description: 'Valid National Bureau of Investigation clearance', category: 'Clearance' },
  { id: 'POLICE_CLEARANCE', name: 'Police Clearance', supportsExpiration: true, description: 'Valid local or PNP clearance', category: 'Clearance' },
  { id: 'MED_CERT', name: 'Medical Certificate (CS Form 211)', supportsExpiration: true, description: 'Medical certificate from a licensed physician with laboratory results', category: 'Medical' },
  { id: 'RESUME_CV', name: 'Resume / CV', supportsExpiration: false, description: 'Curriculum vitae. This does not replace the Personal Data Sheet, which is a separate required form.', category: 'Personal' },
  { id: 'OTHER', name: 'Other', supportsExpiration: false, description: 'Any other supporting document or MOV for comparative assessment', category: 'General', annexCCode: 'k' },
];

export interface RequirementIdentity {
  key: string;
  isSingleInstance: boolean;
  annexCCode?: string;
  customName?: string;
}

/**
 * Resolves the canonical requirement identity and determines whether the
 * requirement is single-instance (strictly one current active file in the 201 library)
 * or multi-instance (multiple distinct files permitted, such as training certificates or COEs).
 */
export function resolveRequirementIdentity(
  documentTypeId: string,
  documentTypeName?: string | null
): RequirementIdentity {
  const normName = (documentTypeName || '').trim();

  // 1. Check if documentTypeName specifically targets an Annex C requirement item (a through k)
  // e.g. "Annex C a: Letter of Intent", "Annex C (b) Personal Data Sheet", "Annex C - e"
  const annexMatch = normName.match(/^Annex\s+C\s*[\(\[-]?\s*([a-k])\b/i);
  if (annexMatch) {
    const code = annexMatch[1].toLowerCase();
    return {
      key: `ANNEX_C_${code}`,
      isSingleInstance: true,
      annexCCode: code,
      customName: normName,
    };
  }

  const def = CONFIGURABLE_DOCUMENT_TYPES.find(t => t.id === documentTypeId);

  // 2. Types naturally permitting multiples:
  // - TRAINING_CERT: multiple certificates across distinct trainings
  // - COE: multiple certificates of employment / service records from different employers
  if (documentTypeId === 'TRAINING_CERT' || documentTypeId === 'COE') {
    return {
      key: `DOC_TYPE:${documentTypeId}`,
      isSingleInstance: false,
      annexCCode: def?.annexCCode,
    };
  }

  // 3. General OTHER documents (not bound to an Annex C requirement code):
  if (documentTypeId === 'OTHER') {
    return {
      key: normName ? `OTHER:${normName.toLowerCase()}` : 'OTHER:GENERAL',
      isSingleInstance: false, // General OTHER allows multiple distinct files
      customName: normName,
    };
  }

  // 4. All other standard defined document types are single-instance 201 records
  return {
    key: `DOC_TYPE:${documentTypeId}`,
    isSingleInstance: true,
    annexCCode: def?.annexCCode,
  };
}

export const BASELINE_REQUIRED_DOCUMENTS: Record<string, string[]> = {
  TEACHING_PERSONNEL: [
    'PDS',
    'WES',
    'LICENSE',
    'CSC_ELIGIBILITY',
    'TOR',
    'DIPLOMA',
    'APPOINTMENT',
    'PERFORMANCE_RATING',
    'OMNIBUS_CERT',
  ],
  NON_TEACHING_PERSONNEL: [
    'PDS',
    'WES',
    'CSC_ELIGIBILITY',
    'TOR',
    'DIPLOMA',
    'APPOINTMENT',
    'PERFORMANCE_RATING',
    'OMNIBUS_CERT',
  ],
  DEFAULT: [
    'PDS',
    'WES',
    'TOR',
    'DIPLOMA',
    'APPOINTMENT',
    'PERFORMANCE_RATING',
    'OMNIBUS_CERT',
  ],
};

export const initializePersonnelDocuments = async (
  personnelId: number,
  roleName?: string,
  txClient?: Prisma.TransactionClient | typeof prisma
): Promise<void> => {
  const db = txClient || prisma;
  const docTypeIds = (roleName && BASELINE_REQUIRED_DOCUMENTS[roleName])
    ? BASELINE_REQUIRED_DOCUMENTS[roleName]
    : BASELINE_REQUIRED_DOCUMENTS.DEFAULT;

  const existingDocs = await db.personnelFile.findMany({
    where: { personnelId, deletedAt: null },
    select: { documentTypeId: true },
  });
  const existingTypes = new Set(existingDocs.map(d => d.documentTypeId));

  const toCreate: Prisma.PersonnelFileCreateManyInput[] = [];

  for (const typeId of docTypeIds) {
    if (!existingTypes.has(typeId)) {
      const def = CONFIGURABLE_DOCUMENT_TYPES.find(t => t.id === typeId);
      if (def) {
        toCreate.push({
          personnelId,
          documentTypeId: def.id,
          documentTypeName: def.name,
          isRequired: true,
          status: PersonnelDocumentStatus.NOT_SUBMITTED,
          originalFileName: null,
          storedFileName: null,
          storagePath: null,
          mimeType: null,
          fileSize: null,
        });
      }
    }
  }

  if (toCreate.length > 0) {
    await db.personnelFile.createMany({
      data: toCreate,
    });
  }
};

/**
 * The JSON shape the web and mobile clients parse.
 */
export interface PersonnelDocumentRecord {
  id: number;
  personnelId: number;
  documentTypeId: string;
  documentTypeName: string;
  originalFileName: string | null;
  storedFileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  fileUrl: string | null;
  storagePath: string | null;
  issueDate: string | null;
  expirationDate: string | null;
  remarks: string | null;
  status: PersonnelDocumentStatus;
  rejectionReason: string | null;
  uploadedAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  replacesDocumentId?: number;
  isRequired: boolean;
  hasFile: boolean;
  ocrConfidenceScore?: number | null;
  ocrStatus?: string | null;
  ocrProcessedAt?: string | null;
}

/** Loaded alongside every document so `reviewedBy` can be a name, not an id. */
const withReviewer = {
  reviewedBy: {
    select: { personnel: { select: { firstName: true, lastName: true } } },
  },
} as const;

type StoredDocument = Prisma.PersonnelFileGetPayload<{ include: typeof withReviewer }>;

/** A DATE column carries no time; emit the calendar date the client stored. */
const asIsoDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

const toApiShape = (record: StoredDocument): PersonnelDocumentRecord => ({
  id: record.id,
  personnelId: record.personnelId,
  documentTypeId: record.documentTypeId,
  documentTypeName: record.documentTypeName,
  originalFileName: record.originalFileName,
  storedFileName: record.storedFileName,
  mimeType: record.mimeType,
  fileSize: record.fileSize,
  fileUrl: record.storagePath ? `/api/v1/personnel/documents/${record.id}/file` : null,
  storagePath: record.storagePath,
  issueDate: asIsoDate(record.issueDate),
  expirationDate: asIsoDate(record.expirationDate),
  remarks: record.remarks,
  status: record.status,
  rejectionReason: record.rejectionReason,
  uploadedAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
  reviewedAt: record.reviewedAt ? record.reviewedAt.toISOString() : null,
  reviewedBy: record.reviewedBy?.personnel
    ? `${record.reviewedBy.personnel.firstName} ${record.reviewedBy.personnel.lastName}`
    : null,
  ...(record.replacesDocumentId ? { replacesDocumentId: record.replacesDocumentId } : {}),
  isRequired: record.isRequired ?? true,
  hasFile: Boolean(record.storagePath),
  ocrConfidenceScore: record.ocrConfidenceScore ?? null,
  ocrStatus: record.ocrStatus ?? null,
  ocrProcessedAt: record.ocrProcessedAt ? record.ocrProcessedAt.toISOString() : null,
});

/**
 * Parses a date supplied by a client.
 */
const parseIsoDate = (raw: unknown): Date | null | undefined => {
  if (raw === undefined || raw === null) return undefined;
  const text = String(raw).trim();
  if (!text) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return null;
  const parsed = new Date(`${text.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

function validateFile(file: Express.Multer.File): boolean {
  if (!file.size || file.size > 10 * 1024 * 1024) return false;
  if (!['.pdf', '.png', '.jpg', '.jpeg'].includes(path.extname(file.originalname).toLowerCase())) return false;
  if (file.mimetype === 'application/pdf') return file.buffer.subarray(0, 5).toString() === '%PDF-';
  if (file.mimetype === 'image/png') return file.buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  return file.mimetype === 'image/jpeg' && file.buffer[0] === 255 && file.buffer[1] === 216 && file.buffer[2] === 255;
}

export const getDocumentTypes = async (_req: Request, res: Response): Promise<void> => {
  sendSuccess(res, CONFIGURABLE_DOCUMENT_TYPES);
};

export const listPersonnelDocuments = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.personnelId) { sendForbidden(res, 'No linked personnel profile.'); return; }
  
  // Auto-initialize required checklist placeholders if none exist yet for this profile
  const count = await prisma.personnelFile.count({
    where: { personnelId: req.user.personnelId, deletedAt: null },
  });
  if (count === 0) {
    await initializePersonnelDocuments(req.user.personnelId, req.user.role);
  }

  // Check for expired documents and transition them to REPLACEMENT_REQUIRED
  const now = new Date();
  await prisma.personnelFile.updateMany({
    where: {
      personnelId: req.user.personnelId,
      deletedAt: null,
      expirationDate: { lt: now },
      status: { in: [PersonnelDocumentStatus.APPROVED, PersonnelDocumentStatus.SUBMITTED] },
    },
    data: {
      status: PersonnelDocumentStatus.REPLACEMENT_REQUIRED,
    },
  });

  const records = await prisma.personnelFile.findMany({
    where: { personnelId: req.user.personnelId, deletedAt: null },
    include: withReviewer,
    orderBy: [
      { isRequired: 'desc' },
      { id: 'asc' },
    ],
  });
  sendSuccess(res, records.map(toApiShape));
};

export const uploadPersonnelDocument = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.personnelId) { sendForbidden(res, 'No linked personnel profile.'); return; }
  const file = req.file;
  if (!file || !validateFile(file)) { sendBadRequest(res, 'Choose a valid PDF, PNG or JPEG up to 10 MB.'); return; }
  const definition = CONFIGURABLE_DOCUMENT_TYPES.find(t => t.id === req.body.documentTypeId);
  if (!definition) { sendBadRequest(res, 'Unknown document type.'); return; }

  const issueDate = parseIsoDate(req.body.issueDate);
  if (issueDate === null) { sendBadRequest(res, 'Enter the issue date as YYYY-MM-DD.'); return; }
  const expirationDate = parseIsoDate(req.body.expirationDate);
  if (expirationDate === null) { sendBadRequest(res, 'Enter the expiry date as YYYY-MM-DD.'); return; }

  const customDocName = req.body.customDocumentName ? String(req.body.customDocumentName).trim() : '';
  const docTypeName = definition.id === 'OTHER'
    ? (customDocName || 'Other document')
    : definition.name;

  const targetReqIdentity = resolveRequirementIdentity(definition.id, docTypeName);

  let replacementId = req.body.replacesDocumentId ? Number(req.body.replacesDocumentId) : null;
  if (replacementId && !Number.isInteger(replacementId)) { sendBadRequest(res, 'Invalid replacement document.'); return; }
  
  let replaceableRecord: StoredDocument | null = null;
  if (replacementId) {
    replaceableRecord = await prisma.personnelFile.findFirst({
      where: { id: replacementId, personnelId: req.user.personnelId, deletedAt: null },
      include: withReviewer,
    });
    if (!replaceableRecord) { sendNotFound(res, 'Replacement source document not found.'); return; }
  } else {
    // 1. Check if there is an empty NOT_SUBMITTED placeholder for this requirement
    if (definition.id === 'OTHER' && customDocName) {
      replaceableRecord = await prisma.personnelFile.findFirst({
        where: {
          personnelId: req.user.personnelId,
          documentTypeId: 'OTHER',
          documentTypeName: { equals: customDocName, mode: 'insensitive' },
          status: PersonnelDocumentStatus.NOT_SUBMITTED,
          deletedAt: null,
        },
        include: withReviewer,
      });
    } else {
      replaceableRecord = await prisma.personnelFile.findFirst({
        where: {
          personnelId: req.user.personnelId,
          documentTypeId: definition.id,
          status: PersonnelDocumentStatus.NOT_SUBMITTED,
          deletedAt: null,
        },
        include: withReviewer,
      });
    }

    // 2. If no placeholder exists and this is a single-instance requirement, verify if an active file already exists
    if (!replaceableRecord && targetReqIdentity.isSingleInstance) {
      const allActiveDocs = await prisma.personnelFile.findMany({
        where: {
          personnelId: req.user.personnelId,
          deletedAt: null,
          status: { not: PersonnelDocumentStatus.NOT_SUBMITTED },
        },
        include: withReviewer,
      });

      const existingConflict = allActiveDocs.find(doc => {
        const docReq = resolveRequirementIdentity(doc.documentTypeId, doc.documentTypeName);
        return docReq.key === targetReqIdentity.key;
      });

      if (existingConflict) {
        sendConflict(
          res,
          `A document is already on file for this requirement ("${existingConflict.documentTypeName}"). Use Replace to update it.`,
          'DOCUMENT_ALREADY_EXISTS',
          {
            existingDocumentId: existingConflict.id,
            documentTypeId: existingConflict.documentTypeId,
            documentTypeName: existingConflict.documentTypeName,
            originalFileName: existingConflict.originalFileName,
            fileSize: existingConflict.fileSize,
            uploadedAt: existingConflict.createdAt.toISOString(),
          }
        );
        return;
      }
    }
  }

  const storagePath = await storeDocument(file.buffer, file.mimetype, `personnel/${req.user.personnelId}`);

  let record: StoredDocument;
  try {
    record = await prisma.$transaction(async tx => {
      // Serialize concurrent uploads for this personnel record
      await tx.$executeRaw`SELECT id FROM personnel WHERE id = ${req.user!.personnelId!} FOR UPDATE`;

      // If fulfilling an existing placeholder (NOT_SUBMITTED)
      if (replaceableRecord && replaceableRecord.status === PersonnelDocumentStatus.NOT_SUBMITTED) {
        const updated = await tx.personnelFile.update({
          where: { id: replaceableRecord.id },
          data: {
            documentTypeName: docTypeName,
            originalFileName: file.originalname,
            storedFileName: storagePath.split('/').pop() || file.originalname,
            storagePath,
            mimeType: file.mimetype,
            fileSize: file.size,
            issueDate: issueDate ?? null,
            expirationDate: expirationDate ?? null,
            remarks: req.body.remarks ? String(req.body.remarks) : null,
            status: PersonnelDocumentStatus.SUBMITTED,
            rejectionReason: null,
            ocrExtractedDataJson: Prisma.JsonNull,
            ocrConfidenceScore: null,
            ocrStatus: EXTRACTABLE_DOCUMENT_TYPES.includes(definition.id as typeof EXTRACTABLE_DOCUMENT_TYPES[number]) ? 'PENDING' : null,
            ocrProcessedAt: null,
            ocrErrorMessage: null,
            updatedAt: new Date(),
          },
          include: withReviewer,
        });
        await tx.validationLog.create({
          data: {
            entityType: 'PersonnelDocument',
            entityId: updated.id,
            userId: req.user!.userId,
            action: 'PERSONNEL_DOCUMENT_SUBMITTED',
            detailsJson: { storagePath, wasPlaceholder: true },
          },
        });
        return updated;
      }

      // Concurrency check for ordinary uploads without replacementId
      if (!replacementId && targetReqIdentity.isSingleInstance) {
        const activeDocsInTx = await tx.personnelFile.findMany({
          where: {
            personnelId: req.user!.personnelId!,
            deletedAt: null,
            status: { not: PersonnelDocumentStatus.NOT_SUBMITTED },
          },
        });
        const conflictInTx = activeDocsInTx.find(doc => {
          const docReq = resolveRequirementIdentity(doc.documentTypeId, doc.documentTypeName);
          return docReq.key === targetReqIdentity.key;
        });
        if (conflictInTx) {
          throw new Error('CONCURRENT_DOCUMENT_CONFLICT');
        }
      }

      // If replacing an existing submitted/approved/deficient file or creating a new document
      const created = await tx.personnelFile.create({
        data: {
          personnelId: req.user!.personnelId!,
          documentTypeId: definition.id,
          documentTypeName: docTypeName,
          originalFileName: file.originalname,
          storedFileName: storagePath.split('/').pop() || file.originalname,
          storagePath,
          mimeType: file.mimetype,
          fileSize: file.size,
          issueDate: issueDate ?? null,
          expirationDate: expirationDate ?? null,
          remarks: req.body.remarks ? String(req.body.remarks) : null,
          status: PersonnelDocumentStatus.SUBMITTED,
          isRequired: definition.id === 'OTHER' ? false : (replaceableRecord ? replaceableRecord.isRequired : false),
          ocrStatus: EXTRACTABLE_DOCUMENT_TYPES.includes(definition.id as typeof EXTRACTABLE_DOCUMENT_TYPES[number]) ? 'PENDING' : null,
          ...(replacementId ? { replacesDocumentId: replacementId } : {}),
        },
        include: withReviewer,
      });

      if (replacementId) {
        const archived = await tx.personnelFile.updateMany({
          where: { id: replacementId, personnelId: req.user!.personnelId!, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        if (archived.count !== 1) throw new Error('The document changed before it could be replaced. Refresh and try again.');
      }

      await tx.validationLog.create({
        data: {
          entityType: 'PersonnelDocument',
          entityId: created.id,
          userId: req.user!.userId,
          action: 'PERSONNEL_DOCUMENT_UPLOADED',
          detailsJson: { storagePath, replacesDocumentId: replacementId },
        },
      });
      return created;
    });
  } catch (error: any) {
    await discardUncommittedDocument(storagePath).catch(() => logger.error({ detail: storagePath }, 'Uncommitted document cleanup needs retry'));
    if (error?.message === 'CONCURRENT_DOCUMENT_CONFLICT' || error?.message?.includes('CONCURRENT_DOCUMENT_CONFLICT')) {
      sendConflict(res, 'A document is already on file for this requirement. Use Replace to update it.', 'DOCUMENT_ALREADY_EXISTS');
      return;
    }
    if (error?.message?.includes('The document changed before it could be replaced')) {
      sendBadRequest(res, error.message, 'CONCURRENT_REPLACEMENT_CONFLICT');
      return;
    }
    throw error;
  }
  res.locals.auditLogged = true;
  sendCreated(res, toApiShape(record));
};

// A replacement is a new immutable file. Existing application references retain
// their original bytes and review evidence.
export const replacePersonnelDocument = async (req: Request, res: Response): Promise<void> => {
  const original = await prisma.personnelFile.findFirst({ where: { id: Number(req.params.id), personnelId: req.user?.personnelId ?? -1, deletedAt: null } });
  if (!original) { sendNotFound(res); return; }
  if (!req.file) { sendBadRequest(res, 'Choose the replacement file.'); return; }
  // Carry the original's details forward, letting anything resupplied win.
  req.body = {
    documentTypeId: original.documentTypeId,
    customDocumentName: original.documentTypeName,
    issueDate: asIsoDate(original.issueDate),
    expirationDate: asIsoDate(original.expirationDate),
    remarks: original.remarks,
    ...req.body,
    replacesDocumentId: original.id,
  };
  await uploadPersonnelDocument(req, res);
};

export const deletePersonnelDocument = async (req: Request, res: Response): Promise<void> => {
  const id = parseDocumentId(req.params.id);
  if (!id) { sendBadRequest(res, 'Invalid document ID.'); return; }
  const record = await prisma.personnelFile.findUnique({ where: { id } });
  if (!record || record.deletedAt) { sendNotFound(res); return; }
  if (record.personnelId !== req.user?.personnelId && !['HRMO', 'SYSTEM_ADMIN'].includes(req.user?.role || '')) {
    // Someone who cannot even see the document learns nothing about it.
    if (!(await canAccessPersonnel(req.user, record.personnelId))) {
      await denyOutOfScope(req, res, { entityType: 'PersonnelDocument', entityId: id, action: 'PERSONNEL_DOCUMENT_DELETE' }, 'Resource not found');
      return;
    }
    sendForbidden(res);
    return;
  }
  if (record.status === PersonnelDocumentStatus.APPROVED) { sendBadRequest(res, 'Approved records must be retained.'); return; }
  const isBaselineType = Object.values(BASELINE_REQUIRED_DOCUMENTS).some(list => list.includes(record.documentTypeId));

  if (record.isRequired && isBaselineType && record.documentTypeId !== 'OTHER') {
    // Check if another active document exists for this same documentTypeId
    const otherActive = await prisma.personnelFile.findFirst({
      where: {
        personnelId: record.personnelId,
        documentTypeId: record.documentTypeId,
        id: { not: record.id },
        deletedAt: null,
      },
    });

    // Only preserve as an unsubmitted placeholder if NO other active document of this type exists
    if (!otherActive) {
      if (record.status === PersonnelDocumentStatus.NOT_SUBMITTED) {
        sendBadRequest(res, 'Required document checklist items cannot be removed.');
        return;
      }
      // Reset required item back to unsubmitted placeholder
      await prisma.personnelFile.update({
        where: { id: record.id },
        data: {
          status: PersonnelDocumentStatus.NOT_SUBMITTED,
          originalFileName: null,
          storedFileName: null,
          storagePath: null,
          mimeType: null,
          fileSize: null,
          issueDate: null,
          expirationDate: null,
          remarks: null,
          rejectionReason: null,
        },
      });
      sendSuccess(res, { id: record.id }, 'Document reset to unsubmitted placeholder.');
      return;
    }
  }

  await prisma.personnelFile.update({ where: { id: record.id }, data: { deletedAt: new Date() } });
  sendSuccess(res, { id: record.id }, 'Document archived. Previously submitted copies are retained.');
};

export const isDocumentAccessibleHistoricalEvidence = async (documentId: number, personnelId: number): Promise<boolean> => {
  const apps = await prisma.promotionApplication.findMany({
    where: { personnelId },
    select: { scoreDetailsJson: true },
  });
  for (const app of apps) {
    const details = app.scoreDetailsJson as Record<string, any> | null;
    const items = details?.annexCChecklist?.items;
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item.personnelDocumentId === documentId || item.existingDocumentId === documentId) {
          return true;
        }
      }
    }
  }
  return false;
};

export const getPersonnelDocumentViewToken = async (req: Request, res: Response): Promise<void> => {
  const id = parseDocumentId(req.params.id);
  if (!id) {
    sendBadRequest(res, 'Invalid document ID.');
    return;
  }
  const record = await prisma.personnelFile.findUnique({ where: { id } });
  if (!record) {
    sendNotFound(res, 'Document not found.');
    return;
  }
  // No token is minted for a document outside the caller's scope.
  if (!(await canAccessPersonnel(req.user, record.personnelId))) {
    await refusePersonnelDocument(req, res, id, 'PERSONNEL_DOCUMENT_VIEW_TOKEN');
    return;
  }
  if (record.deletedAt) {
    const isHistoricalEvidence = await isDocumentAccessibleHistoricalEvidence(record.id, record.personnelId);
    if (!isHistoricalEvidence) {
      sendNotFound(res, 'Document not found.');
      return;
    }
  }
  if (!record.storagePath) {
    sendNotFound(res, 'Document has no file attached.');
    return;
  }

  const token = generateDocumentAccessToken({
    userId: req.user!.userId,
    email: req.user!.email,
    role: req.user!.role,
    documentId: record.id,
    docType: 'personnel',
    pwdv: req.user!.pwdv,
  });

  sendSuccess(res, {
    token,
    fileUrl: `/api/v1/personnel/documents/${record.id}/file?token=${encodeURIComponent(token)}`,
    expiresInSeconds: 900,
  });
};

export const downloadPersonnelDocumentFile = async (req: Request, res: Response): Promise<void> => {
  const id = parseDocumentId(req.params.id);
  if (!id) { sendBadRequest(res, 'Invalid document ID.'); return; }

  // A view token names exactly one document. Compared before the lookup, so a
  // valid token for one id cannot be used to probe which other ids exist.
  if (req.docToken && (req.docToken.documentId !== id || req.docToken.docType !== 'personnel')) {
    sendForbidden(res, 'Invalid document access token.');
    return;
  }

  const record = await prisma.personnelFile.findUnique({ where: { id } });
  if (!record) { sendNotFound(res, 'Document not found.'); return; }

  // A valid signature is not authorization: scope is re-evaluated on every download.
  if (!(await canAccessPersonnel(req.user, record.personnelId))) {
    await refusePersonnelDocument(req, res, id, 'PERSONNEL_DOCUMENT_DOWNLOAD');
    return;
  }
  if (record.deletedAt) {
    const isHistoricalEvidence = await isDocumentAccessibleHistoricalEvidence(record.id, record.personnelId);
    if (!isHistoricalEvidence) {
      sendNotFound(res, 'Document not found.');
      return;
    }
  }

  if (!record.storagePath) {
    sendNotFound(res, 'Document has no file attached.');
    return;
  }

  const bytes = await readDocument(record.storagePath);
  res.type(record.mimeType || 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${(record.originalFileName || 'document.pdf').replace(/[^a-zA-Z0-9_.-]/g, '_')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.user?.userId) {
    recordAuditLog({
      userId: req.user.userId,
      action: 'PERSONNEL_DOCUMENT_ACCESSED',
      entityType: 'PersonnelDocument',
      entityId: record.id,
      details: {
        documentTypeId: record.documentTypeId,
        fileName: record.originalFileName,
        personnelId: record.personnelId,
      },
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.ip || null,
      userAgent: (req.headers['user-agent'] as string) || null,
      status: 'SUCCESS',
    }).catch(err => logger.error({ err }, 'Failed to log personnel document access'));
    res.locals.auditLogged = true;
  }

  res.send(bytes);
};

export const extractPersonnelDocument = async (req: Request, res: Response): Promise<void> => {
  const id = parseDocumentId(req.params.id);
  if (!id) {
    sendBadRequest(res, 'Invalid document ID.');
    return;
  }

  const record = await prisma.personnelFile.findUnique({
    where: { id },
    include: { personnel: true },
  });
  if (!record || record.deletedAt) {
    sendNotFound(res, 'Document not found.');
    return;
  }

  if (!(await canAccessPersonnel(req.user, record.personnelId))) {
    await refusePersonnelDocument(req, res, id, 'PERSONNEL_DOCUMENT_EXTRACT');
    return;
  }

  if (!record.storagePath) {
    sendBadRequest(res, 'Document has no file attached.');
    return;
  }

  if (req.user?.personnelId !== record.personnelId) {
    sendForbidden(res, 'Only the document owner can review extracted profile changes.');
    return;
  }
  if (!['PDS', 'APPOINTMENT'].includes(record.documentTypeId)) {
    sendBadRequest(res, 'This document type does not have a supported profile-field extraction mapping.');
    return;
  }
  if (!documentAiConfigured()) {
    sendBadRequest(res, 'Document extraction is not configured. Your uploaded file is safe and can be reviewed later.');
    return;
  }

  try {
    const bytes = await readDocument(record.storagePath);
    const aiRes = await extractPdsWithDocumentAi(bytes, record.mimeType || 'application/pdf');
    const extracted = mapTrustedOcrFields(record.documentTypeId, aiRes.fields, aiRes.confidence);
    if (Object.keys(extracted.fields).filter(key => extracted.fields[key as keyof typeof extracted.fields]).length === 0) {
      throw new Error('No supported profile fields were found in this document.');
    }

    const updated = await prisma.personnelFile.update({
      where: { id: record.id },
      data: {
        ocrExtractedDataJson: extracted as unknown as Prisma.InputJsonValue,
        ocrConfidenceScore: extracted.confidence,
        ocrStatus: 'NEEDS_REVIEW',
        ocrProcessedAt: new Date(),
        ocrErrorMessage: null,
      },
    });

    const comparison = buildExtractionComparison(extracted, record.personnel, record.documentTypeId);

    sendSuccess(
      res,
      {
        documentId: updated.id,
        ocrStatus: updated.ocrStatus,
        confidenceScore: updated.ocrConfidenceScore,
        fields: comparison,
      },
      'Extraction completed successfully.'
    );
  } catch (err: any) {
    await prisma.personnelFile.update({
      where: { id: record.id },
      data: {
        ocrStatus: 'FAILED',
        ocrErrorMessage: 'Extraction failed',
      },
    });
    logger.warn({ err, documentId: record.id }, 'Personnel document extraction failed');
    sendBadRequest(res, 'The document could not be read. The uploaded file is still saved; try extraction again later.');
  }
};

export const getExtractionReview = async (req: Request, res: Response): Promise<void> => {
  const id = parseDocumentId(req.params.id);
  if (!id) {
    sendBadRequest(res, 'Invalid document ID.');
    return;
  }

  const record = await prisma.personnelFile.findUnique({
    where: { id },
    include: { personnel: true },
  });
  if (!record || record.deletedAt) {
    sendNotFound(res, 'Document not found.');
    return;
  }

  if (!(await canAccessPersonnel(req.user, record.personnelId))) {
    await refusePersonnelDocument(req, res, id, 'PERSONNEL_DOCUMENT_EXTRACTION_REVIEW');
    return;
  }

  if (req.user?.personnelId !== record.personnelId) {
    sendForbidden(res, 'Only the document owner can review extracted profile changes.');
    return;
  }
  const extractedJson = record.ocrExtractedDataJson;
  if (!isDocumentExtractionResult(extractedJson)) {
    sendNotFound(res, 'No extraction data available for this document.');
    return;
  }

  const comparison = buildExtractionComparison(extractedJson, record.personnel, record.documentTypeId);

  sendSuccess(res, {
    documentId: record.id,
    documentTypeId: record.documentTypeId,
    documentTypeName: record.documentTypeName,
    originalFileName: record.originalFileName,
    ocrStatus: record.ocrStatus || 'NEEDS_REVIEW',
    confidenceScore: record.ocrConfidenceScore ?? extractedJson.confidence,
    processedAt: record.ocrProcessedAt?.toISOString() ?? null,
    fields: comparison,
  });
};

export const applyExtractionTo201 = async (req: Request, res: Response): Promise<void> => {
  const id = parseDocumentId(req.params.id);
  if (!id) {
    sendBadRequest(res, 'Invalid document ID.');
    return;
  }

  const approvedFields: unknown[] = Array.isArray(req.body.approvedFields) ? req.body.approvedFields : [];
  if (approvedFields.length === 0) {
    sendBadRequest(res, 'No fields selected for update.');
    return;
  }

  const record = await prisma.personnelFile.findUnique({
    where: { id },
    include: { personnel: true },
  });
  if (!record || record.deletedAt) {
    sendNotFound(res, 'Document not found.');
    return;
  }

  if (!(await canAccessPersonnel(req.user, record.personnelId))) {
    await refusePersonnelDocument(req, res, id, 'PERSONNEL_DOCUMENT_APPLY_EXTRACTION');
    return;
  }

  if (req.user?.personnelId !== record.personnelId) {
    sendForbidden(res, 'Only the document owner can apply extracted profile changes.');
    return;
  }

  if (record.ocrStatus !== 'NEEDS_REVIEW' || !isDocumentExtractionResult(record.ocrExtractedDataJson)) {
    sendBadRequest(res, 'This document has no pending server-extracted fields. Run extraction first.');
    return;
  }
  if (record.ocrExtractedDataJson.confidence < 0.8) {
    sendBadRequest(res, 'Extraction confidence is too low to update the 201 record. Request manual review.');
    return;
  }
  const allowed = DOCUMENT_FIELD_MAP[record.documentTypeId] || [];
  if (approvedFields.some(field => typeof field !== 'string' || !allowed.includes(field as keyof typeof FIELD_DEFINITIONS)) ||
      new Set(approvedFields).size !== approvedFields.length) {
    sendBadRequest(res, 'One or more selected fields are not valid for this document type.');
    return;
  }

  try {
    const result = await prisma.$transaction(async tx => {
      // Lock personnel row
      await tx.$executeRaw`SELECT id FROM personnel WHERE id = ${record.personnelId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM personnel_files WHERE id = ${record.id} FOR UPDATE`;
      const currentFile = await tx.personnelFile.findUnique({ where: { id: record.id } });
      if (!currentFile || currentFile.deletedAt || currentFile.ocrStatus !== 'NEEDS_REVIEW' ||
          !isDocumentExtractionResult(currentFile.ocrExtractedDataJson)) {
        throw new Error('The document changed before these fields could be applied. Refresh and review again.');
      }
      const currentPersonnel = await tx.personnel.findUnique({ where: { id: record.personnelId } });
      if (!currentPersonnel) throw new Error('Personnel record not found.');

      const updatePayload: Record<string, any> = {};
      const auditDiff: Array<{ field: string; oldValue: any; newValue: any }> = [];

      for (const selectedField of approvedFields) {
        const field = selectedField as keyof typeof FIELD_DEFINITIONS;
        const def = FIELD_DEFINITIONS[field];
        const rawVal = currentFile.ocrExtractedDataJson.fields[field];
        if (typeof rawVal !== 'string' || !rawVal.trim()) throw new Error(`No extracted value exists for ${field}.`);
        let formattedVal: any = rawVal;

        if (def.type === 'date') {
          const d = /^\d{4}-\d{2}-\d{2}$/.test(rawVal) ? new Date(`${rawVal}T00:00:00.000Z`) : new Date(NaN);
          if (!isNaN(d.getTime()) && d.toISOString().slice(0, 10) === rawVal) {
            formattedVal = d;
          } else {
            throw new Error(`The extracted date for ${field} is invalid.`);
          }
        } else if (def.type === 'gender') {
          const upper = String(rawVal).toUpperCase();
          if (['MALE', 'FEMALE', 'OTHER'].includes(upper)) {
            formattedVal = upper as Gender;
          } else {
            throw new Error(`The extracted value for ${field} is invalid.`);
          }
        } else if (def.type === 'civilStatus') {
          const upper = String(rawVal).toUpperCase();
          if (['SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED'].includes(upper)) {
            formattedVal = upper as CivilStatus;
          } else {
            throw new Error(`The extracted value for ${field} is invalid.`);
          }
        } else if (def.type === 'appointmentStatus') {
          const upper = String(rawVal).toUpperCase();
          if (['PERMANENT', 'PROVISIONAL', 'TEMPORARY', 'SUBSTITUTE', 'CASUAL', 'CONTRACTUAL', 'COTERMINOUS'].includes(upper)) {
            formattedVal = upper as AppointmentStatus;
          } else {
            throw new Error(`The extracted value for ${field} is invalid.`);
          }
        } else {
          formattedVal = String(rawVal).trim();
        }

        const oldVal = (currentPersonnel as any)[field];
        updatePayload[field] = formattedVal;
        auditDiff.push({
          field,
          oldValue: oldVal instanceof Date ? oldVal.toISOString().slice(0, 10) : oldVal,
          newValue: formattedVal instanceof Date ? formattedVal.toISOString().slice(0, 10) : formattedVal,
        });
      }

      if (auditDiff.length === 0) {
        throw new Error('No valid fields could be applied.');
      }

      // Check profileComplete condition
      const merged = { ...currentPersonnel, ...updatePayload };
      const profileComplete = Boolean(
        merged.firstName &&
        merged.lastName &&
        merged.birthDate &&
        merged.gender &&
        merged.civilStatus &&
        merged.contactNumber &&
        merged.address &&
        merged.dateHired
      );
      updatePayload.profileComplete = profileComplete;

      const updatedPersonnel = await tx.personnel.update({
        where: { id: record.personnelId },
        data: updatePayload,
      });

      await tx.personnelFile.update({
        where: { id: record.id },
        data: { ocrStatus: 'APPLIED' },
      });

      await tx.validationLog.create({
        data: {
          entityType: 'Personnel',
          entityId: record.personnelId,
          userId: req.user!.userId,
          action: 'DIGITAL_201_FIELDS_UPDATED_FROM_DOCUMENT',
          detailsJson: {
            documentId: record.id,
            documentTypeId: record.documentTypeId,
            originalFileName: record.originalFileName,
            appliedFields: auditDiff,
          },
        },
      });

      return { updatedPersonnel, appliedDiff: auditDiff };
    });

    res.locals.auditLogged = true;
    sendSuccess(res, result, `Successfully applied ${result.appliedDiff.length} fields to your Digital 201 Record.`);
  } catch (err: any) {
    sendBadRequest(res, err?.message || 'Could not apply extracted fields to profile.');
  }
};
