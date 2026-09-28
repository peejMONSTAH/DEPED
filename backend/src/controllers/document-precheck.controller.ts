import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { sendSuccess, sendNotFound, sendBadRequest, sendError } from '../utils/response.util';
import { readDocument } from '../services/document-storage.service';
import { extractWithTesseract } from '../services/tesseract-ocr.service';
import { canAccessTransaction } from '../utils/transaction-access.util';
import { canAccessPersonnel } from '../utils/scope.util';
import { precheckDocument, PrecheckResult } from '../utils/document-precheck.util';
import { logger } from '../utils/logger';
import { notifyUserNotifications } from './notifications.controller';

/**
 * Reviewer pre-check for a document the AO II is about to verify: right
 * document, right name, still valid, key facts. OCR runs once per stored file;
 * the text is cached in memory by storage path (a replaced file has a new path).
 * Access follows the same rules as downloading the file itself.
 */
const TEXT_CACHE = new Map<string, string>();
const CACHE_LIMIT = 300;
const OCR_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

async function textOf(storagePath: string, mimeType: string | null): Promise<string | null> {
  const cached = TEXT_CACHE.get(storagePath);
  if (cached !== undefined) return cached;
  const type = mimeType || 'application/pdf';
  if (!OCR_TYPES.includes(type)) return null;
  const bytes = await readDocument(storagePath);
  const { text } = await extractWithTesseract(bytes, type, 'PRECHECK');
  if (TEXT_CACHE.size >= CACHE_LIMIT) TEXT_CACHE.delete(TEXT_CACHE.keys().next().value as string);
  TEXT_CACHE.set(storagePath, text);
  return text;
}

const unreadable: PrecheckResult = { readable: false, facts: [], checks: [{ key: 'type', state: 'unknown', label: 'This file type cannot be read automatically. Check it by eye.' }] };

async function respond(res: Response, storagePath: string, mimeType: string | null, requirement: string, person: { firstName?: string | null; lastName?: string | null }) {
  try {
    const text = await textOf(storagePath, mimeType);
    sendSuccess(res, text === null ? unreadable : precheckDocument(text, requirement, person));
  } catch (err: any) {
    // OCR busy or failed: the reviewer simply checks by eye.
    logger.warn({ err: err?.message }, 'Document pre-check unavailable');
    sendError(res, /busy/i.test(err?.message || '') ? 'The automatic check is busy. Try again in a moment.' : 'The automatic check could not read this file.', 503, 'PRECHECK_UNAVAILABLE');
  }
}

/** GET /documents/:documentId/precheck (a document on a transaction checklist). */
export const precheckTransactionDocument = async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.documentId);
  if (!Number.isInteger(id) || id <= 0) { sendBadRequest(res, 'Invalid document ID.'); return; }
  const doc = await prisma.uploadedDocument.findUnique({
    where: { id },
    include: { requirementTemplate: { select: { name: true } }, transaction: { select: { personnel: { select: { firstName: true, lastName: true } } } } },
  });
  if (!doc || !(await canAccessTransaction(req.user, doc.transactionId))) { sendNotFound(res, 'Document not found.'); return; }
  await respond(res, doc.storagePath, doc.mimeType, doc.requirementTemplate?.name || doc.fileName, doc.transaction.personnel);
};

/** GET /personnel/documents/:id/precheck?requirement=... (a 201 file attached to a promotion application). */
export const precheckPersonnelDocument = async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { sendBadRequest(res, 'Invalid document ID.'); return; }
  const record = await prisma.personnelFile.findUnique({
    where: { id },
    include: { personnel: { select: { firstName: true, lastName: true } } },
  });
  if (!record || !record.storagePath || !(await canAccessPersonnel(req.user, record.personnelId))) { sendNotFound(res, 'Document not found.'); return; }
  const requirement = typeof req.query.requirement === 'string' && req.query.requirement.trim()
    ? req.query.requirement.trim().slice(0, 200)
    : record.documentTypeId;
  await respond(res, record.storagePath, record.mimeType, requirement, record.personnel);
};

/**
 * Runs after a 201 upload, in the background (the upload has already been
 * answered). Records a printed expiry date when none was entered, and tells the
 * owner at once when the file looks like a different document. Never throws.
 */
export async function afterPersonnelUpload(fileId: number): Promise<void> {
  try {
    const record = await prisma.personnelFile.findUnique({
      where: { id: fileId },
      include: { personnel: { select: { firstName: true, lastName: true, userId: true } } },
    });
    if (!record?.storagePath || record.deletedAt) return;
    const text = await textOf(record.storagePath, record.mimeType);
    if (!text) return;
    const result = precheckDocument(text, record.documentTypeName || record.documentTypeId, record.personnel);

    if (result.expiresOn && !record.expirationDate) {
      await prisma.personnelFile.update({ where: { id: record.id }, data: { expirationDate: new Date(`${result.expiresOn}T00:00:00Z`) } });
    }

    const messages: string[] = [];
    if (result.looksLike) {
      messages.push(`The file you uploaded as ${record.documentTypeName} looks like a ${result.looksLike}. If it is the wrong file, replace it in 201 Files.`);
    }
    if (result.expiresOn && new Date(`${result.expiresOn}T23:59:59`) < new Date()) {
      messages.push(`Your ${record.documentTypeName} expired on ${new Date(result.expiresOn).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}. Upload the renewed one when you have it.`);
    }
    if (messages.length) {
      await prisma.notification.createMany({
        data: messages.map(message => ({ userId: record.personnel.userId, message, type: 'WARNING' as const, relatedEntityType: 'PersonnelDocument', relatedEntityId: record.id })),
      });
      notifyUserNotifications(record.personnel.userId);
    }
  } catch (err: any) {
    logger.warn({ err: err?.message, fileId }, 'Post-upload document check skipped');
  }
}
