import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendForbidden, getPaginationParams, buildPaginationMeta } from '../utils/response.util';
import { notifyUserNotifications } from './notifications.controller';
import {
  getStationScope,
  isWithinStation,
  stationPersonnelFilter,
  STATION_SUBJECT_ROLES,
} from '../utils/scope.util';
import { generateMagicToken, passwordTokenVersion } from '../utils/jwt.util';
import { config } from '../config';
import { processWorkflowOutbox, queueDeficiencyEmail, queueTransactionalEmail } from '../services/workflow-outbox.service';
import { EventEmitter } from 'events';
import { isConfirmedPdsData, pdsProfileProposal } from '../utils/pds-profile.util';
import { logger } from '../utils/logger';
import { getSubmissionTransition } from '../utils/transaction-workflow.util';

const ADMIN_ROLES = ['SYSTEM_ADMIN', 'AO_II', 'HRMO'];
export const transactionEvents = new EventEmitter();
const notifyTransactionChange = (data?: Record<string, any>) => {
  transactionEvents.emit('change', { timestamp: Date.now(), ...(data || {}) });
};
export { notifyTransactionChange };

/** GET /transactions/stream */
export const streamTransactions = (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);
  const onUpdate = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  transactionEvents.on('change', onUpdate);
  const heartbeat = setInterval(() => { res.write(': heartbeat\n\n'); }, 25000);
  req.on('close', () => {
    transactionEvents.off('change', onUpdate);
    clearInterval(heartbeat);
  });
};

/** GET /transactions */
export const getTransactions = async (req: Request, res: Response) => {
  const { page, limit, skip } = getPaginationParams(req.query as Record<string, unknown>);
  const { status, type } = req.query as any;
  const isAdmin = ADMIN_ROLES.includes(req.user?.role as string);
  const where: any = {};

  if (!isAdmin) {
    if (!req.user?.personnelId) { sendBadRequest(res, 'No personnel profile linked.'); return; }
    where.personnelId = req.user.personnelId;
  } else if (req.user?.role === 'AO_II') {
    // AO II can only see transactions of Teaching and Non-Teaching personnel under their school
    const scope = await getStationScope(req.user);
    if (scope.isScoped) {
      where.personnel = {
        user: { role: { name: { in: STATION_SUBJECT_ROLES } } },
        ...stationPersonnelFilter(scope),
      };
    }
  }

  if (status) where.status = status as string;
  if (type) where.transactionType = { name: { contains: String(type), mode: 'insensitive' } };
  const [data, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        transactionType: { select: { name: true, requirementTemplates: { select: { id: true, isMandatory: true } } } },
        personnel: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
            designation: true,
            address: true,
            promotionApplications: {
              where: {
                OR: [
                  { status: 'APPROVED' },
                  { scoreDetailsJson: { path: ['manuallyPromoted'], equals: true } },
                  { scoreDetailsJson: { path: ['stageStatus'], equals: 'SELECTED_PENDING_DOCS' } },
                ],
              },
              include: {
                promotionCycle: {
                  select: { id: true, name: true, type: true, rulesConfigurationJson: true },
                },
              },
              orderBy: { updatedAt: 'desc' },
              take: 1,
            },
          },
        },
        uploadedDocuments: { select: { id: true, fileName: true, status: true, requirementTemplateId: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  const formatted = data.map(tx => {
    const promoApp = tx.personnel?.promotionApplications?.[0];
    const isPromo = tx.transactionType.name.toUpperCase().includes('PROMOTION') || !!promoApp;
    const targetPos = (promoApp?.promotionCycle?.rulesConfigurationJson as any)?.targetPosition || null;
    const cycleName = promoApp?.promotionCycle?.name || null;
    const mandatoryIds = tx.transactionType.requirementTemplates.filter(r => r.isMandatory).map(r => r.id);
    const uploadedIds = new Set(tx.uploadedDocuments.map(d => d.requirementTemplateId));
    const complianceScore = mandatoryIds.length > 0 ? Math.round((mandatoryIds.filter(id => uploadedIds.has(id)).length / mandatoryIds.length) * 100) : 0;
    return {
      ...tx,
      complianceScore,
      isPromotion: isPromo,
      promotionDetails: isPromo && promoApp ? {
        isSelected: true,
        cycleName,
        targetPosition: targetPos,
        cycleType: promoApp.promotionCycle?.type,
      } : null,
    };
  });

  sendSuccess(res, formatted, undefined, 200, buildPaginationMeta(page, limit, total));
};

/** GET /transactions/my-transactions */
export const getMyTransactions = async (req: Request, res: Response) => {
  const { page, limit, skip } = getPaginationParams(req.query as Record<string, unknown>);
  const { status, type } = req.query as any;
  let pId = req.user?.personnelId;

  if (!pId && req.user?.userId) {
    const pRecord = await prisma.personnel.findFirst({
      where: {
        OR: [
          { userId: req.user.userId },
          { user: { email: { equals: req.user.email, mode: 'insensitive' } } },
        ],
      },
      select: { id: true },
    });
    if (pRecord) {
      pId = pRecord.id;
      await prisma.user.update({
        where: { id: req.user.userId },
        data: { personnelId: pRecord.id },
      }).catch((err: any) => logger.error({ err }, 'Failed to link user personnelId in transactions'));
    }
  }

  if (!pId) {
    sendSuccess(res, [], undefined, 200, buildPaginationMeta(page, limit, 0));
    return;
  }
  const where: any = { personnelId: pId };
  if (status) where.status = status as string;
  if (type) where.transactionType = { name: { contains: String(type), mode: 'insensitive' } };
  const [data, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        transactionType: { select: { name: true } },
        personnel: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
            designation: true,
            promotionApplications: {
              where: {
                OR: [
                  { status: 'APPROVED' },
                  { scoreDetailsJson: { path: ['manuallyPromoted'], equals: true } },
                  { scoreDetailsJson: { path: ['stageStatus'], equals: 'SELECTED_PENDING_DOCS' } },
                ],
              },
              include: {
                promotionCycle: {
                  select: { id: true, name: true, type: true, rulesConfigurationJson: true },
                },
              },
              orderBy: { updatedAt: 'desc' },
              take: 1,
            },
          },
        },
        uploadedDocuments: { select: { id: true, fileName: true, status: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);
  const formattedData = data.map(tx => {
    const validCount = tx.uploadedDocuments.filter(d => (d.status as string) !== 'REJECTED' && (d.status as string) !== 'DEFICIENT').length;
    const score = tx.uploadedDocuments.length > 0
      ? Math.round((validCount / (tx.uploadedDocuments.length || 1)) * 100)
      : (tx.status !== 'DRAFT' ? 100 : 0);
    const promoApp = tx.personnel?.promotionApplications?.[0];
    const isPromo = tx.transactionType.name.toUpperCase().includes('PROMOTION') || !!promoApp;
    const targetPos = (promoApp?.promotionCycle?.rulesConfigurationJson as any)?.targetPosition || 'Master Teacher I';
    const cycleName = promoApp?.promotionCycle?.name || 'DepEd Promotion Cycle';
    return {
      ...tx,
      complianceScore: score,
      isPromotion: isPromo,
      promotionDetails: isPromo ? {
        isSelected: true,
        cycleName,
        targetPosition: targetPos,
        cycleType: promoApp?.promotionCycle?.type || 'NATURAL_VACANCY',
      } : null,
    };
  });
  sendSuccess(res, formattedData, undefined, 200, buildPaginationMeta(page, limit, total));
};

/** POST /transactions */
export const createTransaction = async (req: Request, res: Response) => {
  const { type, notes } = req.body;
  if (!type) { sendBadRequest(res, 'Transaction type is required.'); return; }
  if (!req.user?.personnelId) { sendBadRequest(res, 'No personnel profile linked.'); return; }
  const personnel = await prisma.personnel.findUnique({ where: { id: req.user.personnelId } });
  if (!personnel) { sendNotFound(res, 'Personnel profile not found.'); return; }
  if (!personnel.profileComplete) {
    sendBadRequest(res, 'Your profile is incomplete. Please complete all required fields before initiating a transaction.', 'INCOMPLETE_PROFILE');
    return;
  }

  // Active Transaction Rule: Personnel cannot initiate a new transaction if they have an active/ongoing one (unless rejected)
  const existingActiveTx = await prisma.transaction.findFirst({
    where: {
      personnelId: req.user.personnelId,
      status: { notIn: ['REJECTED'] },
    },
    include: { transactionType: true },
    orderBy: { createdAt: 'desc' },
  });

  if (existingActiveTx) {
    sendBadRequest(
      res,
      `You already have an active transaction (#TRX-${existingActiveTx.id} - ${existingActiveTx.transactionType.name}) currently in "${existingActiveTx.status}" status. You cannot initiate another transaction unless your previous submission is rejected.`,
      'ACTIVE_TRANSACTION_EXISTS'
    );
    return;
  }

  // Promotion Cycle Eligibility Check
  if (String(type).toUpperCase().includes('PROMOTION')) {
    const approvedApp = await prisma.promotionApplication.findFirst({
      where: {
        personnelId: req.user.personnelId,
        OR: [
          { status: 'APPROVED' },
          { scoreDetailsJson: { path: ['manuallyPromoted'], equals: true } },
        ],
      },
    });

    const promotionEntry = await prisma.careerHistoryEntry.findFirst({
      where: { personnelId: req.user.personnelId, eventType: 'PROMOTION' },
    });

    if (!approvedApp && !promotionEntry) {
      sendBadRequest(
        res,
        'You are ineligible yet. Selection by HRMO in an active Promotion Cycle is required before initiating a Promotion Appointment upload.',
        'INELIGIBLE_FOR_PROMOTION'
      );
      return;
    }
  }

  const transactionType = await prisma.transactionType.findFirst({ where: { name: { equals: type, mode: 'insensitive' } } });
  if (!transactionType) { sendBadRequest(res, `Transaction type "${type}" not found.`); return; }
  // The audit entry is part of initiating the transaction, not a side effect of it.
  const transaction = await prisma.$transaction(async tx => {
    const created = await tx.transaction.create({
      data: {
        personnelId: req.user!.personnelId!,
        transactionTypeId: transactionType.id,
        status: 'DRAFT',
        remarks: notes,
      },
      include: { transactionType: { select: { name: true } } },
    });
    await tx.validationLog.create({
      data: {
        entityType: 'Transaction',
        entityId: created.id,
        action: 'TRANSACTION_INITIATED',
        userId: req.user?.userId ?? 0,
        status: 'SUCCESS',
      },
    });
    return created;
  });
  res.locals.auditLogged = true;
  notifyTransactionChange();
  sendCreated(res, { id: transaction.id, type: transaction.transactionType.name, status: transaction.status, submissionDate: transaction.submissionDate }, 'Transaction initiated successfully.');
};

/** GET /transactions/:id */
export const getTransactionById = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0 || id > 2147483647) { sendNotFound(res, 'Transaction not found.'); return; }
  const isAdmin = ADMIN_ROLES.includes(req.user?.role as string);

  try {
    const [transaction, logs] = await Promise.all([
      prisma.transaction.findUnique({
        where: { id },
        include: {
          transactionType: { include: { requirementTemplates: true } },
          personnel: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeId: true,
              designation: true,
              promotionApplications: {
                where: {
                  OR: [
                    { status: 'APPROVED' },
                    { scoreDetailsJson: { path: ['manuallyPromoted'], equals: true } },
                    { scoreDetailsJson: { path: ['stageStatus'], equals: 'SELECTED_PENDING_DOCS' } },
                  ],
                },
                include: {
                  promotionCycle: {
                    select: { id: true, name: true, type: true, rulesConfigurationJson: true },
                  },
                },
                orderBy: { updatedAt: 'desc' },
                take: 1,
              },
            },
          },
          uploadedDocuments: {
            include: {
              requirementTemplate: { select: { name: true } },
              validatedBy: { select: { id: true, email: true, role: { select: { name: true } } } },
            },
          },
          currentAssignee: { select: { id: true, email: true } },
        },
      }),
      prisma.validationLog.findMany({
        where: { entityType: 'Transaction', entityId: id },
        orderBy: { timestamp: 'desc' },
        include: { user: { select: { email: true, role: { select: { name: true } } } } },
      }),
    ]);

    if (!transaction) { sendNotFound(res, 'Transaction not found.'); return; }
    if (!isAdmin && transaction.personnelId !== req.user?.personnelId) { sendForbidden(res, 'You do not have access to this transaction.'); return; }
    const mandatoryIds = transaction.transactionType.requirementTemplates.filter(r => r.isMandatory).map(r => r.id);
    const uploadedIds = new Set(transaction.uploadedDocuments.map(d => d.requirementTemplateId));
    const complianceScore = mandatoryIds.length > 0 ? Math.round((mandatoryIds.filter(templateId => uploadedIds.has(templateId)).length / mandatoryIds.length) * 100) : 0;
    const promoApp = transaction.personnel?.promotionApplications?.[0];
    const isPromo = transaction.transactionType.name.toUpperCase().includes('PROMOTION') || !!promoApp;
    const targetPos = (promoApp?.promotionCycle?.rulesConfigurationJson as any)?.targetPosition || 'Master Teacher I';
    const cycleName = promoApp?.promotionCycle?.name || 'DepEd Promotion Cycle';

    sendSuccess(res, {
      ...transaction,
      complianceScore,
      isPromotion: isPromo,
      promotionDetails: isPromo ? {
        isSelected: true,
        cycleName,
        targetPosition: targetPos,
        cycleType: promoApp?.promotionCycle?.type || 'NATURAL_VACANCY',
      } : null,
      history: logs,
    });
  } catch (err) {
    sendNotFound(res, 'Transaction not found.');
  }
};

/** PUT /transactions/:id/submit */
export const submitTransaction = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0 || id > 2147483647) { sendNotFound(res, 'Transaction not found.'); return; }
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: {
      uploadedDocuments: true,
      transactionType: { include: { requirementTemplates: true } },
      personnel: { select: { school: true, district: true } },
    },
  });
  if (!transaction) { sendNotFound(res, 'Transaction not found.'); return; }
  if (transaction.personnelId !== req.user?.personnelId) { sendForbidden(res, 'Forbidden'); return; }
  const allowedStatuses = ['DRAFT', 'DEFICIENCY'];
  if (!allowedStatuses.includes(transaction.status as string)) {
    sendSuccess(res, { id: transaction.id, referenceNo: `TRX-${transaction.id}`, type: transaction.transactionType.name, status: transaction.status, submissionDate: transaction.submissionDate }, 'Transaction already submitted.');
    return;
  }
  const submissionTransition = getSubmissionTransition(transaction.status, transaction.resubmissionCount);
  const { isResubmission, shouldEscalate, nextStatus } = submissionTransition;
  const mandatoryTemplates = transaction.transactionType.requirementTemplates.filter(t => t.isMandatory);
  // DI-H3: Enforce genuine document uploads — do not auto-create fake validated placeholder documents
  if (transaction.uploadedDocuments.length === 0) {
    sendBadRequest(res, 'Cannot submit transaction without any supporting documents attached.', 'NO_DOCUMENTS_ATTACHED');
    return;
  }
  if (mandatoryTemplates.length > 0) {
    const uploadedTemplateIds = new Set(transaction.uploadedDocuments.map(d => d.requirementTemplateId));
    const missing = mandatoryTemplates.filter(t => !uploadedTemplateIds.has(t.id));
    if (missing.length > 0) {
      sendBadRequest(res, `Missing required mandatory documents: ${missing.map(m => m.name).join(', ')}.`, 'MISSING_MANDATORY_DOCUMENTS');
      return;
    }
  }
  const unconfirmedPds = transaction.uploadedDocuments.find(doc => {
    const template = mandatoryTemplates.find(t => t.id === doc.requirementTemplateId);
    return /personal data sheet|\bpds\b/i.test(template?.name || '') && doc.ocrExtractedDataJson && !isConfirmedPdsData(doc.correctedOcrDataJson);
  });
  if (unconfirmedPds) {
    sendBadRequest(res, 'Review and confirm the fields detected from your PDS before submitting the transaction.', 'PDS_CONFIRMATION_REQUIRED');
    return;
  }
  // The status change and its audit entry must land together; notifying AO II is a
  // post-commit side effect and stays outside so its latency cannot abort the write.
  const updated = await prisma.$transaction(async tx => {
    const claimed = await tx.transaction.updateMany({
      where: { id, status: transaction.status },
      data: {
        status: nextStatus,
        submissionDate: new Date(),
        ...(submissionTransition.incrementResubmissionCount ? { resubmissionCount: { increment: 1 } } : {}),
        ...(shouldEscalate ? { remarks: 'Escalated to HRMO after three correction cycles. Review the submission and prior AO II findings.' } : {}),
      },
    });
    if (claimed.count !== 1) throw new Error(`Transaction #${id} changed in another session. Refresh before submitting again.`);
    const row = await tx.transaction.findUniqueOrThrow({
      where: { id },
      include: { personnel: { select: { firstName: true, lastName: true, user: { select: { email: true } } } }, transactionType: { select: { name: true } } },
    });
    await tx.validationLog.create({
      data: {
        entityType: 'Transaction', entityId: id,
        action: shouldEscalate ? 'TRANSACTION_ESCALATED_TO_HRMO' : (isResubmission ? 'TRANSACTION_RESUBMITTED' : 'TRANSACTION_SUBMITTED'),
        detailsJson: { previousStatus: transaction.status, nextStatus, correctionCycle: transaction.resubmissionCount },
        userId: req.user!.userId, status: 'SUCCESS',
      },
    });
    if (row.personnel.user?.email) {
      await queueTransactionalEmail(`transaction:${id}:submitted:${row.submissionDate?.toISOString()}`, {
        recipientEmail: row.personnel.user.email,
        recipientName: `${row.personnel.firstName} ${row.personnel.lastName}`,
        subject: `Transaction submitted: TRX-${id}`,
        heading: 'Your documents were submitted',
        message: shouldEscalate
          ? `Your ${row.transactionType.name} transaction reached the correction limit and was escalated to HRMO for review.`
          : `Your ${row.transactionType.name} documents are now queued for AO II validation. Digital 201 will notify you if a correction is required.`,
        reference: `TRX-${id}`,
        actionLabel: 'View transaction',
        actionUrl: `${config.clientUrl}/personnel/checklist?txId=${id}`,
      }, tx);
    }
    return row;
  });
  res.locals.auditLogged = true;
  const applicantName = updated.personnel ? `${updated.personnel.firstName} ${updated.personnel.lastName}` : 'Personnel Staff';
  const targetNotifyUsers = await prisma.user.findMany({
    where: shouldEscalate
      ? { role: { name: 'HRMO' }, accountStatus: 'ACTIVE' }
      : {
          role: { name: 'AO_II' }, accountStatus: 'ACTIVE',
          personnel: transaction.personnelId ? {
            OR: [
              ...(transaction.personnel?.school ? [{ school: { equals: transaction.personnel.school, mode: 'insensitive' as const } }] : []),
              ...(!transaction.personnel?.school && transaction.personnel?.district ? [{ district: { equals: transaction.personnel.district, mode: 'insensitive' as const } }] : []),
            ],
          } : undefined,
        },
    select: { id: true },
  });
  if (targetNotifyUsers.length > 0) {
    await prisma.notification.createMany({
      data: targetNotifyUsers.map(u => ({
        userId: u.id,
        message: shouldEscalate
          ? `Transaction #${id} (${updated.transactionType.name}) for ${applicantName} reached three correction cycles and requires HRMO review.`
          : `New transaction #${id} (${updated.transactionType.name}) submitted by ${applicantName} for validation.`,
        type: shouldEscalate ? 'WARNING' as const : 'INFO' as const,
        relatedEntityId: id,
        relatedEntityType: 'Transaction',
      })),
    });
    notifyUserNotifications(targetNotifyUsers.map(u => u.id));
  }
  notifyTransactionChange();
  void processWorkflowOutbox();
  sendSuccess(
    res,
    { id: updated.id, status: updated.status, submissionDate: updated.submissionDate },
    shouldEscalate ? 'Correction limit reached. Transaction escalated to HRMO review.' : 'Transaction submitted for validation.',
  );
};

/** POST /transactions/:id/validate */
export const validateTransaction = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0 || id > 2147483647) { sendNotFound(res, 'Transaction not found.'); return; }
  const { documentValidations, targetStatus, remarks } = req.body;
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: {
      personnel: {
        select: {
          id: true, firstName: true, lastName: true, address: true, school: true, district: true, designation: true,
          user: { select: { email: true, role: { select: { name: true } } } },
        },
      },
      uploadedDocuments: { include: { requirementTemplate: { select: { id: true, name: true, isMandatory: true } } } },
      transactionType: { include: { requirementTemplates: true } },
    },
  });
  if (!transaction) { sendNotFound(res, 'Transaction not found.'); return; }
  if (!['PENDING_VALIDATION', 'DEFICIENCY', 'RETURNED'].includes(transaction.status)) {
    sendBadRequest(res, `Transaction #${id} cannot be validated while its status is "${transaction.status}".`, 'INVALID_VALIDATION_STATE');
    return;
  }

  const scope = await getStationScope(req.user);
  if (scope.isScoped && scope.personnelId !== transaction.personnelId) {
    const roleName = transaction.personnel?.user?.role?.name as typeof STATION_SUBJECT_ROLES[number];
    if (!STATION_SUBJECT_ROLES.includes(roleName)) {
      sendForbidden(res, 'Access denied. You can only validate transactions of school personnel.');
      return;
    }
    if (!isWithinStation(scope, transaction.personnel)) {
      sendForbidden(res, 'Access denied. You can only validate transactions under your assigned school station.'); return;
    }
  }

  if (!Array.isArray(documentValidations) || documentValidations.length === 0) {
    sendBadRequest(res, 'Every submitted document must be explicitly reviewed before completing validation.', 'DOCUMENT_REVIEWS_REQUIRED'); return;
  }
  const docIds = transaction.uploadedDocuments.map(d => d.id);
  const submittedIds = documentValidations.map((v: any) => Number(v.documentId));
  if (submittedIds.some((docId: number) => !Number.isInteger(docId) || !docIds.includes(docId)) || new Set(submittedIds).size !== submittedIds.length) {
    sendBadRequest(res, 'One or more document reviews do not belong to this transaction or are duplicated.', 'INVALID_DOCUMENT_REVIEW'); return;
  }
  if (documentValidations.some((v: any) => typeof v.isValid !== 'boolean')) {
    sendBadRequest(res, 'Each document review must explicitly state whether the document is valid.', 'INVALID_DOCUMENT_REVIEW'); return;
  }
  if (submittedIds.length !== docIds.length || docIds.some(docId => !submittedIds.includes(docId))) {
    sendBadRequest(res, 'All uploaded documents must be reviewed before the transaction can move forward.', 'INCOMPLETE_DOCUMENT_REVIEW'); return;
  }
  const mandatoryTemplateIds = transaction.transactionType.requirementTemplates.filter(t => t.isMandatory).map(t => t.id);
  const uploadedTemplateIds = new Set(transaction.uploadedDocuments.map(d => d.requirementTemplateId).filter(Boolean));
  const missingMandatory = mandatoryTemplateIds.filter(templateId => !uploadedTemplateIds.has(templateId));
  if (missingMandatory.length > 0) {
    sendBadRequest(res, `${missingMandatory.length} mandatory requirement(s) have not been uploaded.`, 'MANDATORY_DOCUMENTS_MISSING'); return;
  }
  const hasDeficiencies = documentValidations.some((v: any) => v.isValid === false);
  if (targetStatus === 'FOR_APPROVAL' && hasDeficiencies) {
    sendBadRequest(res, 'A transaction with rejected documents cannot be forwarded for approval.', 'INVALID_VALIDATION_OUTCOME'); return;
  }
  if (hasDeficiencies && !String(remarks || '').trim() && !documentValidations.some((v: any) => !v.isValid && String(v.feedback || '').trim())) {
    sendBadRequest(res, 'Feedback is required for every deficient submission.', 'DEFICIENCY_REASON_REQUIRED'); return;
  }
  const isRejected = targetStatus === 'REJECTED';
  if (isRejected && !String(remarks || '').trim()) { sendBadRequest(res, 'A disqualification reason is required.', 'REJECTION_REASON_REQUIRED'); return; }
  const newStatus: any = isRejected ? 'REJECTED' : hasDeficiencies ? 'DEFICIENCY' : 'FOR_APPROVAL';

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(201, ${id})`;
    const current = await tx.transaction.findUnique({ where: { id }, select: { status: true } });
    if (current?.status !== transaction.status) {
      throw new Error(`Transaction #${id} changed in another review session. Refresh before submitting a decision.`);
    }
    const deficientDocNames: string[] = [];

    for (const dv of documentValidations) {
          const docId = Number(dv.documentId);
            const isVal = dv.isValid;
            await tx.uploadedDocument.updateMany({
              where: { id: docId, transactionId: id },
              data: {
                status: isVal ? 'VALIDATED' : 'REJECTED',
                validationNotes: dv.feedback || remarks,
                validatedByUserId: req.user!.userId,
                validationDate: new Date(),
              },
            });
            if (!isVal) {
              const docItem = await tx.uploadedDocument.findFirst({
                where: { id: docId, transactionId: id },
                include: { requirementTemplate: { select: { name: true } } },
              });
              if (docItem) {
                deficientDocNames.push(docItem.requirementTemplate?.name || docItem.fileName || 'Requirement Document');
              }
            }
    }

    await tx.transaction.update({
      where: { id },
      data: {
        status: newStatus,
        remarks: remarks || transaction.remarks,
        validationDate: new Date(),
        currentAssigneeId: req.user!.userId,
      },
    });

    await tx.validationLog.create({
      data: {
        entityType: 'Transaction',
        entityId: id,
        action: 'TRANSACTION_VALIDATED',
        detailsJson: { newStatus, hasDeficiencies, remarks, deficientDocs: deficientDocNames },
        userId: req.user!.userId,
        status: 'SUCCESS',
      },
    });
    res.locals.auditLogged = true;

    const txWithPersonnel = await tx.transaction.findUnique({
      where: { id },
      include: {
        personnel: {
          include: {
            user: {
              include: { role: true },
            },
          },
        },
        transactionType: true,
      },
    });

    if (txWithPersonnel?.personnel.user) {
      let notifMsg = '';
      let notifType: 'WARNING' | 'INFO' | 'SUCCESS' = 'INFO';

      if (isRejected) {
        notifType = 'WARNING';
        notifMsg = `Transaction #${id} was disqualified by AO II. Reason: "${remarks}". This decision is final for this transaction; no document re-upload is requested.`;
      } else if (hasDeficiencies) {
        notifType = 'WARNING';
        if (deficientDocNames.length > 0) {
          notifMsg = `⚠️ Deficiency Alert on TRX-${id}: The document "${deficientDocNames.join(', ')}" was returned due to: "${remarks || 'Validation error'}". Only this document needs to be re-uploaded.`;
        } else {
          notifMsg = `⚠️ Deficiency Alert on TRX-${id}: Documents were returned by AO II. Reason: "${remarks || 'Please re-upload deficient files.'}". Only deficient items require re-upload.`;
        }
      } else {
        notifType = 'INFO';
        notifMsg = `✅ Verification Complete: All submitted documents for TRX-${id} (${txWithPersonnel.transactionType.name}) have been verified by AO II and forwarded to HRMO for final approval.`;
      }

      await tx.notification.create({
        data: {
          userId: txWithPersonnel.personnel.user.id,
          message: notifMsg,
          type: notifType,
          relatedEntityId: id,
          relatedEntityType: 'Transaction',
        },
      });
      notifyUserNotifications([txWithPersonnel.personnel.user.id]);

      // Automated Deficiency Notification Email with 1-Click Magic Login
      if (hasDeficiencies && !isRejected && txWithPersonnel.personnel.user.email) {
        try {
          const userObj = txWithPersonnel.personnel.user;
          const magicToken = generateMagicToken({
            userId: userObj.id,
            email: userObj.email,
	            role: userObj.role?.name || 'TEACHING_PERSONNEL',
	            pwdv: passwordTokenVersion(userObj.passwordHash),
            txId: id,
          });

          const docItems = (deficientDocNames.length > 0 ? deficientDocNames : ['Requirement Checklist Documents']).map(name => ({
            name,
            remarks: remarks || 'Returned for compliance revision by Administrative Officer (AO II).',
          }));

          await queueDeficiencyEmail(`transaction:${id}:deficiency:${transaction.resubmissionCount}`, {
            recipientEmail: userObj.email,
            recipientName: `${txWithPersonnel.personnel.firstName} ${txWithPersonnel.personnel.lastName}`,
            transactionId: id,
            transactionType: txWithPersonnel.transactionType?.name || '201 Transaction',
            aoRemarks: remarks || undefined,
            deficientDocuments: docItems,
            magicToken,
          }, tx);
        } catch (emailErr) {
          logger.error({ err: emailErr }, '[validateTransaction] Could not generate deficiency email for TRX-${id}');
        }
      }
      if (isRejected && txWithPersonnel.personnel.user.email) {
        await queueTransactionalEmail(`transaction:${id}:ao-rejected`, {
          recipientEmail: txWithPersonnel.personnel.user.email,
          recipientName: `${txWithPersonnel.personnel.firstName} ${txWithPersonnel.personnel.lastName}`,
          subject: `AO II decision issued: TRX-${id}`,
          heading: 'Your transaction was disqualified',
          message: `AO II disqualified this transaction. Review the recorded reason in Digital 201: ${remarks}. This is a final decision for this transaction; no document re-upload is requested.`,
          reference: `TRX-${id}`,
          actionLabel: 'View decision',
          actionUrl: `${config.clientUrl}/personnel/checklist?txId=${id}`,
        }, tx);
      }
    }

    if (!hasDeficiencies && !isRejected) {
      const hrmoUsers = await tx.user.findMany({ where: { role: { name: 'HRMO' }, accountStatus: 'ACTIVE' } });
      if (hrmoUsers.length > 0) {
        const applicantName = txWithPersonnel?.personnel ? `${txWithPersonnel.personnel.firstName} ${txWithPersonnel.personnel.lastName}` : 'Personnel Applicant';
        const txTypeName = txWithPersonnel?.transactionType?.name || '201 Transaction';
        await tx.notification.createMany({
          data: hrmoUsers.map(h => ({
            userId: h.id,
            message: `📋 HRMO Action Required: Transaction #${id} (${txTypeName}) for ${applicantName} has been validated by AO II and is ready for your final review & approval.`,
            type: 'INFO',
            relatedEntityId: id,
            relatedEntityType: 'Transaction',
          })),
        });
        notifyUserNotifications(hrmoUsers.map(h => h.id));
      }
    }
  });
  void processWorkflowOutbox();


  notifyTransactionChange({
    type: 'TRANSACTION_VALIDATED',
    transactionId: id,
    status: newStatus,
    targetStatus,
    hasDeficiencies,
  });
  sendSuccess(res, { id, status: newStatus, validationDate: new Date() }, 'Transaction validation submitted.');
};

/** POST /transactions/:id/approve */
export const approveTransaction = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0 || id > 2147483647) { sendNotFound(res, 'Transaction not found.'); return; }
  const { isApproved, notes } = req.body;
  if (typeof isApproved !== 'boolean') { sendBadRequest(res, 'isApproved must be a boolean.'); return; }
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: {
      personnel: {
        include: {
          user: true,
          plantillaItem: true,
        },
      },
      transactionType: true,
      uploadedDocuments: { include: { requirementTemplate: { select: { name: true } } } },
    },
  });
  if (!transaction) { sendNotFound(res, 'Transaction not found.'); return; }
  if (transaction.status !== 'FOR_APPROVAL') {
    sendBadRequest(
      res,
      `Transaction #${id} cannot be processed for approval yet. It is currently in "${transaction.status}" status and must first be validated and declared qualified by AO II.`,
      'TRANSACTION_NOT_VALIDATED_BY_AO2'
    );
    return;
  }
  if (!isApproved && !notes) { sendBadRequest(res, 'A rejection reason is required.'); return; }
  const newStatus = isApproved ? 'APPROVED' : 'REJECTED';

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.transaction.updateMany({
      where: { id, status: 'FOR_APPROVAL' },
      data: { status: newStatus, approvalDate: new Date(), remarks: notes },
    });
    if (claimed.count !== 1) throw new Error(`Transaction #${id} was already processed by another reviewer.`);

    if (isApproved && transaction.personnelId) {
      const pdsDocument = transaction.uploadedDocuments.find(doc => /personal data sheet|\bpds\b/i.test(doc.requirementTemplate.name));
      if (pdsDocument?.ocrExtractedDataJson && !isConfirmedPdsData(pdsDocument.correctedOcrDataJson)) {
        throw new Error('The submitted PDS contains extracted data that the personnel has not confirmed. Return it for correction before approval.');
      }
      if (pdsDocument?.status === 'VALIDATED' && isConfirmedPdsData(pdsDocument.correctedOcrDataJson)) {
        const proposal = pdsProfileProposal(pdsDocument.correctedOcrDataJson) as any;
        const allowedProposal = Object.fromEntries(Object.entries(proposal).filter(([, value]) => value !== undefined));
        const previousValues = Object.fromEntries(Object.keys(allowedProposal).map(key => [key, (transaction.personnel as any)[key] ?? null]));
        const merged = { ...transaction.personnel, ...allowedProposal } as any;
        const profileComplete = Boolean(merged.firstName && merged.lastName && merged.birthDate && merged.gender && merged.civilStatus && merged.contactNumber && merged.address && merged.dateHired);
        await tx.personnel.update({ where: { id: transaction.personnelId }, data: { ...allowedProposal, profileComplete } });
        await tx.validationLog.create({
          data: {
            entityType: 'Personnel', entityId: transaction.personnelId, action: 'PDS_PROFILE_VERSION_APPLIED', userId: req.user!.userId,
            detailsJson: JSON.parse(JSON.stringify({ transactionId: id, documentId: pdsDocument.id, sourceFile: pdsDocument.fileName, previousValues, appliedValues: allowedProposal })),
          },
        });
      }
      const txTypeName = (transaction.transactionType?.name || '').toUpperCase();
      const isReclass = txTypeName.includes('RECLASSIFICATION') || txTypeName.includes('RECLASS');
      const isAppointment = txTypeName.includes('APPOINTMENT') || txTypeName.includes('APPOINT') || txTypeName.includes('NEWLY HIRED');
      const isPromo = txTypeName.includes('PROMOTION') || isReclass || isAppointment;

      // Update designation and record career history for promotions, appointments, and reclassifications
      if (isPromo) {
        let targetPosition: string | null = null;
        let isNewHireAppointment = txTypeName.includes('NEWLY HIRED');

        // 1. Try finding by linked transactionId first
        let selectedApp = await tx.promotionApplication.findFirst({
          where: {
            personnelId: transaction.personnelId,
            scoreDetailsJson: { path: ['transactionId'], equals: id },
          },
          include: { promotionCycle: true },
        });

        if (!selectedApp) {
          throw new Error(`Transaction #${id} is not linked to a promotion or appointment application.`);
        }

        if (selectedApp) {
          const cycleRules = (selectedApp.promotionCycle.rulesConfigurationJson as any) || {};
          targetPosition = cycleRules?.targetPosition || (selectedApp.scoreDetailsJson as any)?.targetPosition || null;
          const appDetails = (selectedApp.scoreDetailsJson as Record<string, any>) || {};
          isNewHireAppointment = isNewHireAppointment || appDetails.isNewlyHiredAppointment === true;
          const targetPlantillaNumber = appDetails.plantillaItemNumber || cycleRules.plantillaItemNumber;

          // Update PromotionApplication status to reflect final appointment approval
          await tx.promotionApplication.update({
            where: { id: selectedApp.id },
            data: {
              status: 'APPROVED',
              scoreDetailsJson: {
                ...appDetails,
                appointmentApproved: true,
                appointmentApprovedAt: new Date().toISOString(),
                stageStatus: 'OFFICIALLY_PROMOTED',
              },
            },
          });

          // Sync Plantilla Item Occupancy
          if (targetPlantillaNumber) {
            const targetPlantilla = await tx.plantillaItem.findUnique({
              where: { itemNumber: String(targetPlantillaNumber).trim() },
            });

            if (targetPlantilla) {
              // If personnel previously held another plantilla, vacate it
              const currentPersonnel = await tx.personnel.findUnique({
                where: { id: transaction.personnelId },
                select: { plantillaItemId: true },
              });

              if (currentPersonnel?.plantillaItemId && currentPersonnel.plantillaItemId !== targetPlantilla.id) {
                await tx.plantillaItem.update({
                  where: { id: currentPersonnel.plantillaItemId },
                  data: { isOccupied: false },
                });
              }

              const conflictingHolder = await tx.personnel.findFirst({
                where: { plantillaItemId: targetPlantilla.id, id: { not: transaction.personnelId } },
                select: { employeeId: true },
              });
              if (conflictingHolder) {
                throw new Error(`Plantilla item ${targetPlantilla.itemNumber} is already occupied by ${conflictingHolder.employeeId}. Resolve the plantilla assignment before approval.`);
              }

              await tx.plantillaItem.update({
                where: { id: targetPlantilla.id },
                data: { isOccupied: true },
              });

              await tx.personnel.update({
                where: { id: transaction.personnelId },
                data: { plantillaItemId: targetPlantilla.id },
              });

              if (!targetPosition) {
                targetPosition = targetPlantilla.positionTitle;
              }

              await tx.validationLog.create({
                data: {
                  entityType: 'PlantillaItem',
                  entityId: targetPlantilla.id,
                  action: 'PLANTILLA_ITEM_OCCUPIED',
                  detailsJson: {
                    itemNumber: targetPlantilla.itemNumber,
                    promotedPersonnelId: transaction.personnelId,
                    transactionId: id,
                  },
                  userId: req.user!.userId,
                  status: 'SUCCESS',
                },
              }).catch((err: any) => logger.error({ err }, 'Failed to log PLANTILLA_ITEM_OCCUPIED'));
            } else throw new Error(`Configured plantilla item "${targetPlantillaNumber}" was not found.`);
          }
        }
        if (!targetPosition) throw new Error('The linked application has no configured target position.');
        const finalDesignation = targetPosition;

        // Automatically update personnel designation upon final HR document verification & approval
        await tx.personnel.update({
          where: { id: transaction.personnelId },
          data: {
            designation: finalDesignation,
            ...(isNewHireAppointment ? { status: 'ACTIVE' } : {}),
          },
        });

        // Create official Career History Entry for PROMOTION / APPOINTMENT / RECLASSIFICATION
        const eventType = isReclass
          ? 'RECLASSIFICATION'
          : (isAppointment && !txTypeName.includes('PROMOTION') ? 'OTHER' : 'PROMOTION');

        await tx.careerHistoryEntry.create({
          data: {
            personnelId: transaction.personnelId,
            eventType: eventType as any,
            eventDate: new Date(),
            detailsJson: {
              transactionId: id,
              notes,
              approvedBy: req.user!.userId,
              newDesignation: finalDesignation,
              previousDesignation: transaction.personnel.designation,
              ...(eventType === 'OTHER' ? { subtype: 'APPOINTMENT' } : {}),
            },
          },
        });
      }
    }

    await tx.validationLog.create({
      data: {
        entityType: 'Transaction',
        entityId: id,
        action: isApproved ? 'TRANSACTION_APPROVED' : 'TRANSACTION_REJECTED',
        detailsJson: { notes, approvedBy: req.user!.userId },
        userId: req.user!.userId,
        status: 'SUCCESS',
      },
    });
    res.locals.auditLogged = true;

    if (transaction.personnel.user) {
      const isPromo = transaction.transactionType.name.toUpperCase().includes('PROMOTION');
      const notifMessage = isApproved
        ? (isPromo
            ? `🎉 Promotion Appointment Approved! Your submitted documents have been fully verified by AO II and approved by HRMO. Your official personnel position has been updated!`
            : `Congratulations! Transaction #${id} (${transaction.transactionType.name}) has been approved by HRMO.`)
        : `Transaction #${id} has been rejected by HRMO. Reason: ${notes}`;

      await tx.notification.create({
        data: {
          userId: transaction.personnel.user.id,
          message: notifMessage,
          type: isApproved ? 'SUCCESS' : 'ERROR',
          relatedEntityId: id,
          relatedEntityType: 'Transaction',
        },
      });
      if (transaction.personnel.user.email) {
        await queueTransactionalEmail(`transaction:${id}:hrmo:${newStatus}`, {
          recipientEmail: transaction.personnel.user.email,
          recipientName: `${transaction.personnel.firstName} ${transaction.personnel.lastName}`,
          subject: `${isApproved ? 'Approved' : 'Decision issued'}: TRX-${id}`,
          heading: isApproved ? 'Your transaction was approved' : 'Your transaction was not approved',
          message: isApproved
            ? `HRMO approved your ${transaction.transactionType.name} transaction. Your Digital 201 record will reflect the finalized appointment information.`
            : `HRMO did not approve your ${transaction.transactionType.name} transaction. Review the recorded reason in Digital 201: ${notes || 'No additional remarks were provided.'}`,
          reference: `TRX-${id}`,
          actionLabel: 'View transaction',
          actionUrl: `${config.clientUrl}/personnel/checklist?txId=${id}`,
        }, tx);
      }
    }
  });

  if (transaction.personnel.user) notifyUserNotifications([transaction.personnel.user.id]);
  void processWorkflowOutbox();
  notifyTransactionChange({
    type: isApproved ? 'TRANSACTION_APPROVED' : 'TRANSACTION_REJECTED',
    transactionId: id,
    status: newStatus,
    isApproved,
  });
  sendSuccess(res, { id, status: newStatus, approvalDate: new Date() }, isApproved ? 'Transaction approved.' : 'Transaction rejected.');
};

/** GET /transactions/:id/requirements */
export const getTransactionRequirements = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0 || id > 2147483647) { sendNotFound(res, 'Transaction not found.'); return; }
  const transaction = await prisma.transaction.findUnique({ where: { id }, include: { transactionType: { include: { requirementTemplates: true } }, uploadedDocuments: true } });
  if (!transaction) { sendNotFound(res, 'Transaction not found.'); return; }
  const uploadedMap = new Map(transaction.uploadedDocuments.map(d => [d.requirementTemplateId, d]));
  const checklist = transaction.transactionType.requirementTemplates.map(tmpl => {
    const uploaded = uploadedMap.get(tmpl.id);
    return {
      requirementId: tmpl.id,
      name: tmpl.name,
      description: tmpl.description,
      isMandatory: tmpl.isMandatory,
      expectedDataType: tmpl.expectedDataType,
      isUploaded: !!uploaded,
      uploadedDocumentId: uploaded?.id || null,
      status: uploaded?.status || 'PENDING_UPLOAD',
    };
  });
  const totalCount = checklist.length;
  const uploadedCount = checklist.filter(c => c.isUploaded).length;
  const complianceScore = totalCount > 0 ? Math.round((uploadedCount / totalCount) * 100) : 0;
  const isComplete = checklist.filter(c => c.isMandatory).every(c => c.isUploaded);
  sendSuccess(res, { complianceScore, isComplete, status: isComplete ? 'Ready for Validation' : 'Incomplete Submission', recommendation: isComplete ? 'All required documents uploaded. You may submit this transaction for AO II validation.' : 'Please upload all missing required documents before submitting.', checklist });
};
