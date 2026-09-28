import crypto from 'crypto';
import prisma from '../config/prisma';
import { readDocument, storeDocument } from './document-storage.service';
import { logger } from '../utils/logger';

/**
 * "Upload once, reuse everywhere": fills a transaction's empty requirements
 * with matching files already in the personnel's 201 file.
 *
 * Only empty requirements are filled; nothing already uploaded, returned or
 * validated is touched. Each attached file is a copy stored under the
 * transaction, marked for AO II review exactly like a manual upload, so the
 * review process is unchanged.
 */

/** Requirement name -> 201 document types that satisfy it, best first. */
const MATCHERS: Array<[RegExp, string[]]> = [
  [/personal data sheet|\bpds\b|cs form 212/i, ['PDS']],
  [/oath of office|cs form (no\. )?32/i, ['OATH_OF_OFFICE']],
  [/position description/i, ['POSITION_DESCRIPTION']],
  [/appointment|plantilla allocation|kss form/i, ['APPOINTMENT']],
  [/medical certificate|cs form (no\. )?211/i, ['MED_CERT']],
  [/transcript|\btor\b/i, ['TOR']],
  [/prc|licen[cs]e/i, ['LICENSE']],
  [/nbi/i, ['NBI_CLEARANCE']],
  [/birth certificate/i, ['BIRTH_CERT']],
  [/omnibus/i, ['OMNIBUS_CERT']],
  [/diploma/i, ['DIPLOMA']],
  [/eligibility|report of rating/i, ['CSC_ELIGIBILITY']],
  [/saln/i, ['SALN']],
];

export const documentTypesFor = (requirementName: string): string[] =>
  MATCHERS.find(([re]) => re.test(requirementName))?.[1] ?? [];

export async function autoAttachFrom201(transactionId: number, actorUserId: number): Promise<{ attached: string[] }> {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true, status: true, personnelId: true,
      transactionType: { select: { requirementTemplates: { select: { id: true, name: true } } } },
      uploadedDocuments: { select: { requirementTemplateId: true } },
    },
  });
  if (!tx || !['DRAFT', 'DEFICIENCY'].includes(tx.status)) return { attached: [] };

  const filled = new Set(tx.uploadedDocuments.map(d => d.requirementTemplateId));
  const empty = tx.transactionType.requirementTemplates.filter(r => !filled.has(r.id));
  if (!empty.length) return { attached: [] };

  const now = new Date();
  const files = await prisma.personnelFile.findMany({
    where: {
      personnelId: tx.personnelId, deletedAt: null, storagePath: { not: null },
      status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'] },
      OR: [{ expirationDate: null }, { expirationDate: { gt: now } }],
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, documentTypeId: true, storagePath: true, originalFileName: true, mimeType: true, status: true },
  });

  const attached: string[] = [];
  for (const req of empty) {
    const types = documentTypesFor(req.name);
    // Approved files first, then the most recent.
    const source = types
      .map(t => files.filter(f => f.documentTypeId === t).sort((a, b) => Number(b.status === 'APPROVED') - Number(a.status === 'APPROVED'))[0])
      .find(Boolean);
    if (!source?.storagePath || !source.originalFileName || !source.mimeType) continue;
    try {
      const buffer = await readDocument(source.storagePath);
      const storagePath = await storeDocument(buffer, source.mimeType, `documents/${transactionId}`);
      // A concurrent upload for the same requirement wins; ours is skipped.
      const done = await prisma.$transaction(async db => {
        const taken = await db.uploadedDocument.findFirst({ where: { transactionId, requirementTemplateId: req.id }, select: { id: true } });
        if (taken) return false;
        const doc = await db.uploadedDocument.create({
          data: {
            transactionId, requirementTemplateId: req.id, storagePath,
            fileName: source.originalFileName!, fileSize: buffer.length, mimeType: source.mimeType!,
            fileHash: crypto.createHash('sha256').update(buffer).digest('hex'),
            uploadedByUserId: actorUserId, status: 'REQUIRES_MANUAL_REVIEW',
          },
        });
        await db.validationLog.create({
          data: {
            entityType: 'Document', entityId: doc.id, action: 'DOCUMENT_ATTACHED_FROM_201', userId: actorUserId, status: 'SUCCESS',
            detailsJson: { transactionId, requirementId: req.id, requirementName: req.name, personnelFileId: source.id, automatic: true },
          },
        });
        return true;
      });
      if (done) attached.push(req.name);
    } catch (err) {
      // A missing or unreadable 201 file just leaves the requirement for a manual upload.
      logger.warn({ err, transactionId, requirement: req.name }, 'Auto-attach from 201 skipped a requirement');
    }
  }
  return { attached };
}
