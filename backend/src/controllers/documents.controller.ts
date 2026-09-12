import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../config/prisma';
import { sendSuccess, sendCreated, sendNotFound, sendBadRequest, sendForbidden } from '../utils/response.util';
import crypto from 'crypto';

import { notifyTransactionChange } from './transactions.controller';

const ADMIN_ROLES = ['SYSTEM_ADMIN', 'AO_II', 'HRMO'];

/**
 * POST /transactions/:transactionId/documents
 * Upload document and attach to transaction
 */
export const uploadDocument = async (req: Request, res: Response): Promise<void> => {
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

  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { transactionType: true },
  });
  if (!transaction) {
    sendNotFound(res, 'Transaction not found.');
    return;
  }

  // Ensure permission: transaction owner or admin/AO staff
  const isOwner = transaction.personnelId === req.user?.personnelId;
  const isStaff = ADMIN_ROLES.includes(req.user?.role || '');
  if (!isOwner && !isStaff) {
    sendForbidden(res, 'You do not have permission to upload documents for this transaction.');
    return;
  }

  // Compute file hash for duplicate detection (BR-17)
  const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

  // Resolve or create a valid requirement template in DB
  let templateIdInput = requirementId || requirementTemplateId;
  let validTemplate = null;

  // 1. Try matching by requirementName within the transaction's type first
  if (requirementName) {
    const nameLower = String(requirementName).toLowerCase().trim();
    const typeTemplates = await prisma.requirementTemplate.findMany({
      where: { transactionTypeId: transaction.transactionTypeId },
    });
    validTemplate = typeTemplates.find(t => {
      const tn = t.name.toLowerCase().trim();
      return tn === nameLower || tn.includes(nameLower) || nameLower.includes(tn);
    });
  }

  // 2. If not found, try by ID within the transaction's type or globally
  if (!validTemplate && templateIdInput) {
    const parsedId = parseInt(String(templateIdInput), 10);
    if (!isNaN(parsedId)) {
      validTemplate = await prisma.requirementTemplate.findFirst({
        where: { id: parsedId, transactionTypeId: transaction.transactionTypeId },
      });
      if (!validTemplate) {
        validTemplate = await prisma.requirementTemplate.findUnique({ where: { id: parsedId } });
      }
    }
  }

  // If still not found, search across all templates by requirementName
  if (!validTemplate && requirementName) {
    const nameLower = String(requirementName).toLowerCase().trim();
    validTemplate = await prisma.requirementTemplate.findFirst({
      where: {
        name: { contains: nameLower, mode: 'insensitive' },
      },
    });
  }

  // If still not found, check if a template exists for this transaction type or create one
  if (!validTemplate) {
    validTemplate = await prisma.requirementTemplate.findFirst({
      where: { transactionTypeId: transaction.transactionTypeId },
    });
  }

  if (!validTemplate) {
    validTemplate = await prisma.requirementTemplate.create({
      data: {
        transactionTypeId: transaction.transactionTypeId,
        name: requirementName || 'General Requirement Document',
        isMandatory: true,
        expectedDataType: 'PDF',
      },
    });
  }

  const finalTemplateId = validTemplate.id;

  // Physical file persistence: write to local storage
  const uploadDir = path.join(process.cwd(), 'uploads', 'documents', String(transactionId));
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const cleanFileName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9_\-.]/g, '_')}`;
  const fullFilePath = path.join(uploadDir, cleanFileName);
  fs.writeFileSync(fullFilePath, file.buffer);
  const storagePath = `uploads/documents/${transactionId}/${cleanFileName}`;

  // Check if document already exists for this transaction and template
  const duplicate = await prisma.uploadedDocument.findFirst({
    where: { transactionId, requirementTemplateId: finalTemplateId },
  });

  let savedDoc;
  if (duplicate) {
    savedDoc = await prisma.uploadedDocument.update({
      where: { id: duplicate.id },
      data: {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        fileHash,
        storagePath,
        status: 'REQUIRES_MANUAL_REVIEW',
        validationNotes: null,
      },
      include: { requirementTemplate: { select: { name: true } } },
    });
  } else {
    savedDoc = await prisma.uploadedDocument.create({
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
      },
      include: { requirementTemplate: { select: { name: true } } },
    });
  }

  try {
    await prisma.validationLog.create({
      data: {
        entityType: 'Document',
        entityId: savedDoc.id,
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
  } catch (logErr) {
    console.warn('Could not write upload validation log:', logErr);
  }

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
      isDuplicate: false,
    }, 'Document uploaded and persisted successfully.');
  } catch (error: any) {
    console.error('Failed to upload document:', error);
    res.status(500).json({ status: 'error', message: error?.message || 'Failed to upload document.' });
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
    const isAdmin = ADMIN_ROLES.includes(req.user!.role);

    const doc = await prisma.uploadedDocument.findUnique({
      where: { id },
      include: {
        transaction: { select: { personnelId: true } },
        requirementTemplate: { select: { name: true } },
        uploadedBy: { select: { email: true } },
        validatedBy: { select: { email: true } },
      },
    });

    if (!doc) { sendNotFound(res, 'Document not found.'); return; }
    if (!isAdmin && doc.transaction.personnelId !== req.user?.personnelId) {
      sendForbidden(res);
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
    });
  } catch (error: any) {
    console.error('Failed to get document:', error);
    res.status(500).json({ status: 'error', message: 'Failed to retrieve document metadata.' });
  }
};

/**
 * GET /documents/:documentId/file
 * Authenticated file streaming & download
 */
export const downloadDocumentFile = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.documentId || req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    sendBadRequest(res, 'Invalid document ID.');
    return;
  }

  const doc = await prisma.uploadedDocument.findUnique({
    where: { id },
    include: { transaction: { select: { personnelId: true } } },
  });

  if (!doc) {
    sendNotFound(res, 'Document record not found.');
    return;
  }

  const isAdmin = ADMIN_ROLES.includes(req.user?.role || '');
  if (!isAdmin && doc.transaction.personnelId !== req.user?.personnelId) {
    sendForbidden(res, 'You do not have permission to access this document file.');
    return;
  }

  const fullPath = path.isAbsolute(doc.storagePath)
    ? doc.storagePath
    : path.join(process.cwd(), doc.storagePath);

  if (!fs.existsSync(fullPath)) {
    res.status(404).json({
      status: 'error',
      message: `The physical file '${doc.fileName}' was not found on server storage.`,
      code: 'FILE_NOT_FOUND',
    });
    return;
  }

  res.setHeader('Content-Type', doc.mimeType || 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${doc.fileName.replace(/[^a-zA-Z0-9_\-.]/g, '_')}"`
  );
  const stream = fs.createReadStream(fullPath);
  stream.pipe(res);
};

