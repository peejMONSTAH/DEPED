import { Request, Response, NextFunction } from 'express';
import path from 'path';
import prisma from '../config/prisma';
import { sendSuccess, sendCreated, sendNotFound, sendBadRequest, sendForbidden , sendError} from '../utils/response.util';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';

import { notifyTransactionChange } from './transactions.controller';
import { pdsComparison, readStructuredData } from '../utils/pds-profile.util';
import { extractWithTesseract } from '../services/tesseract-ocr.service';
import { recordAuditLog } from '../utils/audit.util';
import { logger } from '../utils/logger';
import { storeDocument, readDocument, discardUncommittedDocument } from '../services/document-storage.service';
import { canAccessTransaction } from '../utils/transaction-access.util';
import { lockTransaction, workflowConflict } from '../utils/transaction-lock.util';
import { generateDocumentAccessToken } from '../utils/jwt.util';
import { denyOutOfScope } from '../utils/access-denial.util';

/**
 * A document is reachable exactly when its parent transaction is: the chain
 * UploadedDocument -> Transaction -> Personnel -> station is resolved by the
 * transaction access policy, never by the document on its own.
 */
const refuseDocument = (req: Request, res: Response, documentId: number, action: string): Promise<void> =>
  denyOutOfScope(req, res, { entityType: 'Document', entityId: documentId, action }, 'Document not found.');

/**
 * POST /transactions/:transactionId/documents
 * Upload document and attach to transaction
 */
export const uploadDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  let uncommittedPath: string | undefined;
  try {
    const paramId = req.params.transactionId || req.params.id;
  const transactionId = parseInt(paramId, 10);
  const { requirementId, requirementTemplateId, requirementName } = req.body;
  const file = req.file;

  if (isNaN(transactionId) || transactionId <= 0) {
    sendBadRequest(res, 'Invalid transaction ID format.');
    return;
  }

  if (!file) {
    sendBadRequest(res, 'No file uploaded.');
    return;
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg'];
  const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!allowedMimes.includes(file.mimetype) || !allowedExts.includes(ext)) {
    sendBadRequest(res, 'Invalid file format. Strict policy: Only PDF, PNG, and JPEG files (.pdf, .png, .jpg, .jpeg) are allowed for transaction document uploads.');
    return;
  }
  const hasValidSignature =
    (file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString('ascii') === '%PDF-') ||
    (file.mimetype === 'image/png' && file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
    (file.mimetype === 'image/jpeg' && file.buffer.length >= 3 && file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff);
  if (!hasValidSignature) {
    sendBadRequest(res, 'The file contents do not match the declared PDF, PNG, or JPEG format.', 'FILE_SIGNATURE_MISMATCH');
    return;
  }

  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { transactionType: true, personnel: { select: { id: true, school: true, district: true } } },
  });
  if (!transaction) {
    sendNotFound(res, 'Transaction not found.');
    return;
  }

  // Transaction owner, the AO II of its station, or division staff.
  if (!(await canAccessTransaction(req.user, transactionId))) {
    await denyOutOfScope(req, res, { entityType: 'Transaction', entityId: transactionId, action: 'DOCUMENT_UPLOAD' }, 'Transaction not found.');
    return;
  }

  if (!['DRAFT', 'DEFICIENCY'].includes(transaction.status)) {
    sendBadRequest(res, 'Documents are locked while this transaction is under review or finalized.');
    return;
  }

  // Compute file hash for duplicate detection (BR-17)
  const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

  // Resolve only a requirement configured for this transaction type.
  const templateIdInput = requirementId || requirementTemplateId;
  let validTemplate = null;

  // 1. Try matching by requirementName within the transaction's type first
  if (requirementName) {
    const nameLower = String(requirementName).toLowerCase().trim();
    const typeTemplates = await prisma.requirementTemplate.findMany({
      where: { transactionTypeId: transaction.transactionTypeId },
    });
    validTemplate = typeTemplates.find(t => {
      const tn = t.name.toLowerCase().trim();
      return tn === nameLower;
    });
  }

  if (!validTemplate && templateIdInput) {
    const parsedId = parseInt(String(templateIdInput), 10);
    if (!isNaN(parsedId)) {
      validTemplate = await prisma.requirementTemplate.findFirst({
        where: { id: parsedId, transactionTypeId: transaction.transactionTypeId },
      });
    }
  }

  if (!validTemplate) {
    sendBadRequest(res, 'The selected requirement is not configured for this transaction type.', 'INVALID_REQUIREMENT_TEMPLATE');
    return;
  }

  const finalTemplateId = validTemplate.id;
  let structuredData: { templateId: string; fields: Record<string, string> } | null = null;
  let ocrConfidence: number | null = null;
  if (req.body.structuredDataJson) {
    try {
      const candidate = JSON.parse(String(req.body.structuredDataJson));
      if (candidate && ['pds-2025', 'wes'].includes(candidate.templateId) && candidate.fields && typeof candidate.fields === 'object') {
        const fields = Object.entries(candidate.fields).reduce<Record<string, string>>((result, [key, value]) => {
          if (Object.keys(result).length < 1000 && /^[a-zA-Z0-9_.-]{1,80}$/.test(key) && typeof value === 'string' && value.length <= 3000) result[key] = value;
          return result;
        }, {});
        structuredData = { templateId: candidate.templateId, fields };
      }
    } catch { /* Unreadable extraction stays unset and remains available for manual review. */ }
  }

  const isPdsRequirement = /personal data sheet|\bpds\b/i.test(validTemplate.name);
  if (structuredData && ((structuredData.templateId === 'pds-2025' && !isPdsRequirement) ||
      (structuredData.templateId === 'wes' && !/work experience|\bwes\b/i.test(validTemplate.name)))) {
    sendBadRequest(res, 'The extracted form does not match this document requirement.', 'FORM_REQUIREMENT_MISMATCH');
    return;
  }
  if (!structuredData && isPdsRequirement) {
    try {
      const extracted = await extractWithTesseract(file.buffer, file.mimetype);
      structuredData = { templateId: extracted.templateId, fields: extracted.fields };
      ocrConfidence = extracted.confidence;
      await prisma.validationLog.create({
        data: { entityType: 'Transaction', entityId: transactionId, action: 'PDS_OCR_COMPLETED', detailsJson: { provider: extracted.provider, detectedFields: Object.keys(extracted.fields).length, rawFieldCount: extracted.rawFields.length, confidence: extracted.confidence }, userId: req.user!.userId },
      });
    } catch (error: any) {
      logger.warn({ err: error?.message || error }, 'Tesseract extraction failed; upload will continue to manual review');
    }
  }

  const lockedDocument = await prisma.uploadedDocument.findFirst({
    where: { transactionId, requirementTemplateId: finalTemplateId, status: 'VALIDATED' },
  });
  if (lockedDocument) {
    sendBadRequest(res, 'This document has already been validated and cannot be replaced.');
    return;
  }

  const storagePath = await storeDocument(file.buffer, file.mimetype, `documents/${transactionId}`);
  uncommittedPath = storagePath;

  const savedDoc = await prisma.$transaction(async db => {
    await lockTransaction(db, transactionId);
    const current = await db.transaction.findUnique({ where: { id: transactionId } });
    if (!current || !['DRAFT', 'DEFICIENCY'].includes(current.status)) throw workflowConflict('Documents are locked while this transaction is under review or finalized.');
    const duplicate = await db.uploadedDocument.findFirst({ where: { transactionId, requirementTemplateId: finalTemplateId } });
    if (duplicate?.status === 'VALIDATED') throw workflowConflict('This document has already been validated and cannot be replaced.');
    if (duplicate) {
      await db.documentRevision.create({ data: { documentId: duplicate.id, snapshot: JSON.parse(JSON.stringify(duplicate)) } });
      await db.complianceCheck.deleteMany({ where: { uploadedDocumentId: duplicate.id } });
    }
    const saved = duplicate ? await db.uploadedDocument.update({
      where: { id: duplicate.id },
      data: {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        fileHash,
        storagePath,
        status: 'REQUIRES_MANUAL_REVIEW',
        validationNotes: null,
        validatedByUserId: null,
        validationDate: null,
        correctedOcrDataJson: Prisma.JsonNull,
        ocrExtractedDataJson: structuredData || Prisma.JsonNull,
        ocrConfidenceScore: structuredData ? (ocrConfidence ?? 0.5) : null,
        uploadedByUserId: req.user!.userId,
        uploadDate: new Date(),
        isDuplicate: false,
      }, include: { requirementTemplate: { select: { name: true } } },
    }) : await db.uploadedDocument.create({
      data: {
        transactionId,
        requirementTemplateId: finalTemplateId,
        storagePath,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        fileHash,
        uploadedByUserId: req.user!.userId,
        status: 'REQUIRES_MANUAL_REVIEW',
        ocrExtractedDataJson: structuredData || undefined,
        ocrConfidenceScore: structuredData ? (ocrConfidence ?? 0.5) : undefined,
      },
      include: { requirementTemplate: { select: { name: true } } },
    });
    await db.validationLog.create({
      data: {
        entityType: 'Document',
        entityId: saved.id,
        action: 'DOCUMENT_UPLOADED',
        detailsJson: {
          fileName: file.originalname,
          size: file.size,
          requirementId: finalTemplateId,
          requirementName: validTemplate.name,
        },
        userId: req.user!.userId,
        status: 'SUCCESS',
      },
    });
    return saved;
  });
  uncommittedPath = undefined;
  res.locals.auditLogged = true;

  notifyTransactionChange();

    sendCreated(res, {
      id: savedDoc.id,
      transactionId,
      requirementId: savedDoc.requirementTemplateId,
      requirementTemplateId: savedDoc.requirementTemplateId,
      requirementName: validTemplate.name,
      fileName: savedDoc.fileName,
      fileUrl: `/api/v1/documents/${savedDoc.id}/file`,
      status: savedDoc.status,
      updatedAt: savedDoc.updatedAt.toISOString(),
      isDuplicate: false,
    }, 'Document uploaded and persisted successfully.');
  } catch (error: any) {
    if (uncommittedPath) await discardUncommittedDocument(uncommittedPath).catch(err => logger.error({ err }, 'Failed to remove uncommitted upload'));
    next(error);
  }
};

/**
 * GET /documents/:documentId
 */
export const getDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.documentId, 10);
    if (isNaN(id) || id <= 0) {
      sendBadRequest(res, 'Invalid document ID.');
      return;
    }
    const doc = await prisma.uploadedDocument.findUnique({
      where: { id },
      include: {
        transaction: { select: { personnelId: true, personnel: { select: { id: true, school: true, district: true } } } },
        requirementTemplate: { select: { name: true } },
        uploadedBy: { select: { email: true } },
        validatedBy: { select: { email: true } },
      },
    });

    if (!doc) { sendNotFound(res, 'Document not found.'); return; }
    if (!(await canAccessTransaction(req.user, doc.transactionId))) {
      await refuseDocument(req, res, id, 'DOCUMENT_METADATA_VIEW');
      return;
    }

    sendSuccess(res, {
      id: doc.id,
      fileName: doc.fileName,
      fileUrl: `/api/v1/documents/${doc.id}/file`,
      status: doc.status,
      validationNotes: doc.validationNotes,
      mismatchDetected: false,
      duplicateDetected: doc.isDuplicate,
      requirementName: doc.requirementTemplate.name,
      uploadedBy: doc.uploadedBy?.email,
      validatedBy: doc.validatedBy?.email,
      validationDate: doc.validationDate,
      extractedData: doc.ocrExtractedDataJson,
      correctedData: doc.correctedOcrDataJson,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to get document');
    res.status(500).json({ status: 'error', message: 'Failed to retrieve document metadata.' });
  }
};

/** GET /documents/:documentId/extraction-review */
export const getExtractionReview = async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.documentId);
  if (!Number.isInteger(id) || id <= 0) { sendBadRequest(res, 'Invalid document ID.'); return; }
  const doc = await prisma.uploadedDocument.findUnique({
    where: { id },
    include: { requirementTemplate: { select: { name: true } }, transaction: { include: { personnel: true } } },
  });
  if (!doc) { sendNotFound(res, 'Document not found.'); return; }
  if (!(await canAccessTransaction(req.user, doc.transactionId))) { await refuseDocument(req, res, id, 'EXTRACTION_REVIEW_VIEW'); return; }
  const source = doc.correctedOcrDataJson || doc.ocrExtractedDataJson;
  const structured = readStructuredData(source);
  sendSuccess(res, {
    documentId: doc.id,
    version: doc.updatedAt.toISOString(),
    requirementName: doc.requirementTemplate.name,
    templateId: structured?.templateId || null,
    fields: structured?.fields || {},
    confirmation: structured?.confirmation || null,
    comparison: structured?.templateId === 'pds-2025' ? pdsComparison(doc.transaction.personnel as any, source) : [],
    notice: 'Extracted values are a draft. The official 201 record changes only after personnel confirmation, AO validation, and HRMO approval.',
  });
};

/** PUT /documents/:documentId/extraction-review */
export const confirmExtractionReview = async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.documentId);
  if (!Number.isInteger(id) || id <= 0) { sendBadRequest(res, 'Invalid document ID.'); return; }
  const doc = await prisma.uploadedDocument.findUnique({
    where: { id },
    include: { transaction: { include: { personnel: true } } },
  });
  if (!doc) { sendNotFound(res, 'Document not found.'); return; }
  if (!(await canAccessTransaction(req.user, doc.transactionId))) { await refuseDocument(req, res, id, 'EXTRACTION_REVIEW_CONFIRM'); return; }
  if (req.user?.personnelId !== doc.transaction.personnelId) { sendForbidden(res, 'Only the personnel who owns the PDS can confirm its extracted information.'); return; }
  if (doc.status === 'VALIDATED') { sendBadRequest(res, 'Validated document information is locked.'); return; }
  if (!['DRAFT', 'DEFICIENCY'].includes(doc.transaction.status)) { sendBadRequest(res, 'Extraction data is locked while the transaction is under review or finalized.'); return; }
  if (req.body?.version !== doc.updatedAt.toISOString()) {
    throw workflowConflict('This document changed. Reopen the review to confirm the latest uploaded file.');
  }
  const original = readStructuredData(doc.ocrExtractedDataJson);
  if (!original) { sendBadRequest(res, 'No structured fields were detected for this document.', 'NO_EXTRACTED_FIELDS'); return; }
  const incoming = req.body?.fields;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) { sendBadRequest(res, 'Reviewed fields are required.'); return; }
  const fields = Object.entries(incoming).reduce<Record<string, string>>((out, [key, value]) => {
    if (Object.keys(out).length < 1000 && /^[a-zA-Z0-9_.-]{1,80}$/.test(key) && typeof value === 'string' && value.length <= 3000) out[key] = value.trim();
    return out;
  }, {});
  const corrected = { templateId: original.templateId, fields, confirmation: { confirmedAt: new Date().toISOString(), confirmedByUserId: req.user!.userId } };
  await prisma.$transaction(async db => {
    await lockTransaction(db, doc.transactionId);
    const current = await db.uploadedDocument.findUniqueOrThrow({ where: { id }, include: { transaction: true } });
    if (current.status === 'VALIDATED' || !['DRAFT', 'DEFICIENCY'].includes(current.transaction.status) || current.updatedAt.getTime() !== doc.updatedAt.getTime()) {
      throw workflowConflict('This document changed or is locked. Reload before confirming its information.');
    }
    await db.uploadedDocument.update({ where: { id }, data: { correctedOcrDataJson: corrected } });
    await db.validationLog.create({ data: { entityType: 'Document', entityId: id, action: 'PDS_EXTRACTION_CONFIRMED', detailsJson: { transactionId: doc.transactionId, fieldsReviewed: Object.keys(fields).length }, userId: req.user!.userId } });
  });
  sendSuccess(res, { documentId: id, confirmation: corrected.confirmation, comparison: pdsComparison(doc.transaction.personnel as any, corrected) }, 'Extracted fields confirmed. They remain pending AO validation and HRMO approval.');
};

const parseDocumentId = (raw: unknown): number | null => {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export const getDocumentViewToken = async (req: Request, res: Response): Promise<void> => {
  const id = parseDocumentId(req.params.documentId || req.params.id);
  if (!id) {
    sendBadRequest(res, 'Invalid document ID.');
    return;
  }

  const doc = await prisma.uploadedDocument.findUnique({
    where: { id },
    include: { transaction: { select: { id: true, personnelId: true } } },
  });

  if (!doc) {
    sendNotFound(res, 'Document not found.');
    return;
  }

  // No token is minted for a document outside the caller's scope.
  if (!(await canAccessTransaction(req.user, doc.transactionId))) {
    await refuseDocument(req, res, id, 'DOCUMENT_VIEW_TOKEN');
    return;
  }

  const token = generateDocumentAccessToken({
    userId: req.user!.userId,
    email: req.user!.email,
    role: req.user!.role,
    documentId: doc.id,
    docType: 'transaction',
    pwdv: req.user!.pwdv,
  });

  sendSuccess(res, {
    token,
    fileUrl: `/api/v1/documents/${doc.id}/file?token=${encodeURIComponent(token)}`,
    expiresInSeconds: 900,
  });
};

/**
 * GET /documents/:documentId/file
 * Authenticated file streaming & download
 */
export const downloadDocumentFile = async (req: Request, res: Response): Promise<void> => {
  const id = parseDocumentId(req.params.documentId || req.params.id);
  if (!id) {
    sendBadRequest(res, 'Invalid document ID.');
    return;
  }

  // A view token names exactly one document. Compared before the lookup, so a
  // valid token for one id cannot be used to probe which other ids exist.
  if (req.docToken && (req.docToken.documentId !== id || req.docToken.docType !== 'transaction')) {
    sendForbidden(res, 'Invalid document access token.');
    return;
  }

  const doc = await prisma.uploadedDocument.findUnique({
    where: { id },
    include: { transaction: { select: { personnelId: true } } },
  });

  if (!doc) {
    sendNotFound(res, 'Document not found.');
    return;
  }

  // A valid signature is not authorization: scope is re-evaluated against the
  // database on every download, so a token minted before a reassignment stops
  // working the moment the document leaves the holder's scope.
  if (!(await canAccessTransaction(req.user, doc.transactionId))) {
    await refuseDocument(req, res, id, 'DOCUMENT_DOWNLOAD');
    return;
  }

  const buffer = await readDocument(doc.storagePath);

  res.setHeader('Content-Type', doc.mimeType || 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${doc.fileName.replace(/[^a-zA-Z0-9_\-.]/g, '_')}"`
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.user?.userId) {
    recordAuditLog({
      userId: req.user.userId,
      action: 'DOCUMENT_ACCESSED',
      entityType: 'Document',
      entityId: doc.id,
      details: {
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        transactionId: doc.transaction?.personnelId ? doc.transactionId : undefined,
      },
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.ip || null,
      userAgent: (req.headers['user-agent'] as string) || null,
      status: 'SUCCESS',
    }).catch(err => logger.error({ err }, 'Failed to log document access'));
    res.locals.auditLogged = true;
  }

  res.send(buffer);
};
