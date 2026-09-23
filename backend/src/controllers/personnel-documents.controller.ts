import { Request, Response } from 'express';
import path from 'path';
import { storeDocument, readDocument, discardUncommittedDocument } from '../services/document-storage.service';
import { getStationScope, isWithinStation } from '../utils/scope.util';
import { Prisma, PersonnelDocumentStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { sendSuccess, sendCreated, sendNotFound, sendBadRequest, sendForbidden } from '../utils/response.util';
import { recordAuditLog } from '../utils/audit.util';
import { logger } from '../utils/logger';
import { generateDocumentAccessToken } from '../utils/jwt.util';

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

  const replacementId = req.body.replacesDocumentId ? Number(req.body.replacesDocumentId) : null;
  if (replacementId && !Number.isInteger(replacementId)) { sendBadRequest(res, 'Invalid replacement document.'); return; }
  
  let replaceableRecord: StoredDocument | null = null;
  if (replacementId) {
    replaceableRecord = await prisma.personnelFile.findFirst({
      where: { id: replacementId, personnelId: req.user.personnelId, deletedAt: null },
      include: withReviewer,
    });
    if (!replaceableRecord) { sendNotFound(res, 'Replacement source document not found.'); return; }
  } else {
    // If no replacementId was passed, check if there's an existing NOT_SUBMITTED placeholder for this document type
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

  const storagePath = await storeDocument(file.buffer, file.mimetype, `personnel/${req.user.personnelId}`);
  const docTypeName = definition.id === 'OTHER'
    ? String(req.body.customDocumentName || 'Other document')
    : definition.name;

  let record: StoredDocument;
  try {
    record = await prisma.$transaction(async tx => {
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
          isRequired: replaceableRecord ? replaceableRecord.isRequired : false,
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
  const record = await prisma.personnelFile.findUnique({ where: { id: Number(req.params.id) } });
  if (!record || record.deletedAt) { sendNotFound(res); return; }
  if (record.personnelId !== req.user?.personnelId && !['HRMO', 'SYSTEM_ADMIN'].includes(req.user?.role || '')) { sendForbidden(res); return; }
  if (record.status === PersonnelDocumentStatus.APPROVED) { sendBadRequest(res, 'Approved records must be retained.'); return; }

  if (record.isRequired) {
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
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    sendBadRequest(res, 'Invalid document ID.');
    return;
  }
  const record = await prisma.personnelFile.findUnique({
    where: { id },
    include: { personnel: true },
  });
  if (!record) {
    sendNotFound(res, 'Document not found.');
    return;
  }
  if (record.deletedAt) {
    const isHistoricalEvidence = await isDocumentAccessibleHistoricalEvidence(record.id, record.personnelId);
    if (!isHistoricalEvidence) {
      sendNotFound(res, 'Document not found.');
      return;
    }
  }
  let allowed = record.personnelId === req.user?.personnelId || ['HRMO', 'SYSTEM_ADMIN'].includes(req.user?.role || '');
  if (!allowed && req.user?.role === 'AO_II') {
    allowed = isWithinStation(await getStationScope(req.user), record.personnel);
  }
  if (!allowed) {
    sendForbidden(res);
    return;
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
  const record = await prisma.personnelFile.findUnique({ where: { id: Number(req.params.id) }, include: { personnel: true } });
  if (!record) { sendNotFound(res); return; }
  if (record.deletedAt) {
    const isHistoricalEvidence = await isDocumentAccessibleHistoricalEvidence(record.id, record.personnelId);
    if (!isHistoricalEvidence) {
      sendNotFound(res);
      return;
    }
  }
  
  if (req.docToken) {
    if (req.docToken.documentId !== record.id || req.docToken.docType !== 'personnel') {
      sendForbidden(res, 'Invalid document access token.');
      return;
    }
  }

  let allowed = record.personnelId === req.user?.personnelId || ['HRMO', 'SYSTEM_ADMIN'].includes(req.user?.role || '');
  if (!allowed && req.user?.role === 'AO_II') {
    allowed = isWithinStation(await getStationScope(req.user), record.personnel);
  }
  if (!allowed) { sendForbidden(res); return; }

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
