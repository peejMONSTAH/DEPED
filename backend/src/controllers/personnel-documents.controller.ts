import { Request, Response } from 'express';
import path from 'path';
import { storeDocument, readDocument, discardUncommittedDocument } from '../services/document-storage.service';
import { getStationScope, isWithinStation } from '../utils/scope.util';
import { Prisma, PersonnelDocumentStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { sendSuccess, sendCreated, sendNotFound, sendBadRequest, sendForbidden } from '../utils/response.util';
import { recordAuditLog } from '../utils/audit.util';
import { logger } from '../utils/logger';

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

/**
 * The JSON shape the web and mobile clients parse.
 *
 * These were the keys of the JSONB payload until migration 202609220005. They
 * are now columns, and this interface describes the serialisation back out to
 * the same shape, so the storage change needed no client release.
 */
export interface PersonnelDocumentRecord {
  id: number;
  personnelId: number;
  documentTypeId: string;
  documentTypeName: string;
  originalFileName: string;
  storedFileName: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  storagePath: string;
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
  fileUrl: `/api/v1/personnel/documents/${record.id}/file`,
  storagePath: record.storagePath,
  issueDate: asIsoDate(record.issueDate),
  expirationDate: asIsoDate(record.expirationDate),
  remarks: record.remarks,
  status: record.status,
  rejectionReason: record.rejectionReason,
  // uploadedAt is what the clients call created_at.
  uploadedAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
  reviewedAt: record.reviewedAt ? record.reviewedAt.toISOString() : null,
  reviewedBy: record.reviewedBy?.personnel
    ? `${record.reviewedBy.personnel.firstName} ${record.reviewedBy.personnel.lastName}`
    : null,
  ...(record.replacesDocumentId ? { replacesDocumentId: record.replacesDocumentId } : {}),
});

/**
 * Parses a date supplied by a client.
 *
 * Returns undefined for absent input and null for input that is not a date, so
 * the caller can tell "not given" from "given but wrong" and reject the latter
 * instead of storing it. The column is a DATE, so the time is discarded.
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
  const records = await prisma.personnelFile.findMany({
    where: { personnelId: req.user.personnelId, deletedAt: null },
    include: withReviewer,
    orderBy: { id: 'desc' },
  });
  sendSuccess(res, records.map(toApiShape));
};

export const uploadPersonnelDocument = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.personnelId) { sendForbidden(res, 'No linked personnel profile.'); return; }
  const file = req.file;
  if (!file || !validateFile(file)) { sendBadRequest(res, 'Choose a valid PDF, PNG or JPEG up to 10 MB.'); return; }
  const definition = CONFIGURABLE_DOCUMENT_TYPES.find(t => t.id === req.body.documentTypeId);
  if (!definition) { sendBadRequest(res, 'Unknown document type.'); return; }

  // Dates used to be stored as whatever string arrived. The column is a DATE
  // now, so a value that is not one is refused here rather than at the driver.
  const issueDate = parseIsoDate(req.body.issueDate);
  if (issueDate === null) { sendBadRequest(res, 'Enter the issue date as YYYY-MM-DD.'); return; }
  const expirationDate = parseIsoDate(req.body.expirationDate);
  if (expirationDate === null) { sendBadRequest(res, 'Enter the expiry date as YYYY-MM-DD.'); return; }

  const replacementId = req.body.replacesDocumentId ? Number(req.body.replacesDocumentId) : null;
  if (replacementId && !Number.isInteger(replacementId)) { sendBadRequest(res, 'Invalid replacement document.'); return; }
  if (replacementId) {
    const replaceable = await prisma.personnelFile.findFirst({
      where: { id: replacementId, personnelId: req.user.personnelId, deletedAt: null },
    });
    if (!replaceable) { sendNotFound(res, 'Replacement source document not found.'); return; }
  }

  const storagePath = await storeDocument(file.buffer, file.mimetype, `personnel/${req.user.personnelId}`);
  const data = {
    personnelId: req.user.personnelId,
    documentTypeId: definition.id,
    documentTypeName: definition.id === 'OTHER'
      ? String(req.body.customDocumentName || 'Other document')
      : definition.name,
    originalFileName: file.originalname,
    storedFileName: storagePath.split('/').pop() || file.originalname,
    storagePath,
    mimeType: file.mimetype,
    fileSize: file.size,
    issueDate: issueDate ?? null,
    expirationDate: expirationDate ?? null,
    remarks: req.body.remarks ? String(req.body.remarks) : null,
    ...(replacementId ? { replacesDocumentId: replacementId } : {}),
  };

  let record: StoredDocument;
  try {
    record = await prisma.$transaction(async tx => {
      const created = await tx.personnelFile.create({ data, include: withReviewer });
      if (replacementId) {
        const archived = await tx.personnelFile.updateMany({
          where: { id: replacementId, personnelId: req.user!.personnelId!, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        if (archived.count !== 1) throw new Error('The document changed before it could be replaced. Refresh and try again.');
      }
      await tx.validationLog.create({ data: { entityType: 'PersonnelDocument', entityId: created.id, userId: req.user!.userId, action: 'PERSONNEL_DOCUMENT_UPLOADED', detailsJson: { storagePath } } });
      return created;
    });
  } catch (error) {
    await discardUncommittedDocument(storagePath).catch(() => logger.error({ detail: storagePath }, 'Uncommitted document cleanup needs retry'));
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
  if (!record) { sendNotFound(res); return; }
  if (record.personnelId !== req.user?.personnelId && !['HRMO', 'SYSTEM_ADMIN'].includes(req.user?.role || '')) { sendForbidden(res); return; }
  if (record.status === 'APPROVED') { sendBadRequest(res, 'Approved records must be retained.'); return; }
  await prisma.personnelFile.update({ where: { id: record.id }, data: { deletedAt: new Date() } });
  sendSuccess(res, { id: record.id }, 'Document archived. Previously submitted copies are retained.');
};

export const downloadPersonnelDocumentFile = async (req: Request, res: Response): Promise<void> => {
  const record = await prisma.personnelFile.findUnique({ where: { id: Number(req.params.id) }, include: { personnel: true } });
  if (!record) { sendNotFound(res); return; }
  let allowed = record.personnelId === req.user?.personnelId || ['HRMO', 'SYSTEM_ADMIN'].includes(req.user?.role || '');
  if (!allowed && req.user?.role === 'AO_II') {
    allowed = isWithinStation(await getStationScope(req.user), record.personnel);
  }
  if (!allowed) { sendForbidden(res); return; }
  const bytes = await readDocument(record.storagePath);
  res.type(record.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${record.originalFileName.replace(/[^a-zA-Z0-9_.-]/g, '_')}"`);
  res.send(bytes);
};
