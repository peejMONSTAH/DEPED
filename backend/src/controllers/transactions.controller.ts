import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendForbidden, getPaginationParams, buildPaginationMeta } from '../utils/response.util';
import { notifyUserNotifications } from './notifications.controller';
import { getAOSchoolScope } from '../utils/scope.util';
import { generateMagicToken } from '../utils/jwt.util';
import { sendDeficiencyAlertEmail } from '../services/email.service';
import { EventEmitter } from 'events';

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
    // AO II can only see transactions of personnel under their school
    const scope = await getAOSchoolScope(req.user);
    if (scope.isAo) {
      if (scope.schoolName) {
        where.personnel = {
          OR: [
            { address: { contains: scope.schoolName, mode: 'insensitive' } },
            { designation: { contains: scope.schoolName, mode: 'insensitive' } },
            ...(scope.aoPersonnelId ? [{ id: scope.aoPersonnelId }] : []),
          ],
        };
      } else if (scope.aoPersonnelId) {
        where.personnelId = scope.aoPersonnelId;
      }
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
        transactionType: { select: { name: true } },
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
        uploadedDocuments: { select: { id: true, fileName: true, status: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  const formatted = data.map(tx => {
    const promoApp = tx.personnel?.promotionApplications?.[0];
    const isPromo = tx.transactionType.name.toUpperCase().includes('PROMOTION') || !!promoApp;
    const targetPos = (promoApp?.promotionCycle?.rulesConfigurationJson as any)?.targetPosition || 'Master Teacher I';
    const cycleName = promoApp?.promotionCycle?.name || 'DepEd Promotion Cycle';
    return {
      ...tx,
      isPromotion: isPromo,
      promotionDetails: isPromo ? {
        isSelected: true,
        cycleName,
        targetPosition: targetPos,
        cycleType: promoApp?.promotionCycle?.type || 'NATURAL_VACANCY',
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
      }).catch((err: any) => console.error('Failed to link user personnelId in transactions:', err));
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
  const transaction = await prisma.transaction.create({
    data: {
      personnelId: req.user.personnelId,
      transactionTypeId: transactionType.id,
      status: 'DRAFT',
      remarks: notes,
    },
    include: { transactionType: { select: { name: true } } },
  });
  await prisma.validationLog.create({
    data: {
      entityType: 'Transaction',
      entityId: transaction.id,
      action: 'TRANSACTION_INITIATED',
      userId: req.user?.userId ?? 0,
      status: 'SUCCESS',
    },
  });
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
          transactionType: true,
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
    const complianceScore = (transaction.uploadedDocuments && transaction.uploadedDocuments.length > 0) || transaction.status !== 'DRAFT' ? 100 : 0;
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
    include: { uploadedDocuments: true, transactionType: { include: { requirementTemplates: true } } },
  });
  if (!transaction) { sendNotFound(res, 'Transaction not found.'); return; }
  if (transaction.personnelId !== req.user?.personnelId) { sendForbidden(res, 'Forbidden'); return; }
  const allowedStatuses = ['DRAFT', 'SUBMITTED_TO_AO2', 'DEFICIENCY', 'RETURNED_BY_AO2', 'RETURNED'];
  if (!allowedStatuses.includes(transaction.status as string)) {
    sendSuccess(res, { id: transaction.id, referenceNo: `TRX-${transaction.id}`, type: transaction.transactionType.name, status: transaction.status, submissionDate: transaction.submissionDate }, 'Transaction already submitted.');
    return;
  }
  if (transaction.resubmissionCount >= 3) { sendBadRequest(res, 'Maximum re-submission limit (3) reached. This transaction has been escalated to HRMO.', 'MAX_RESUBMISSIONS_REACHED'); return; }
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
  const updated = await prisma.transaction.update({
    where: { id },
    data: { status: 'PENDING_VALIDATION', submissionDate: new Date(), resubmissionCount: { increment: 1 } },
    include: { personnel: { select: { firstName: true, lastName: true } }, transactionType: { select: { name: true } } },
  });
  await prisma.validationLog.create({ data: { entityType: 'Transaction', entityId: id, action: 'TRANSACTION_SUBMITTED', userId: req.user!.userId, status: 'SUCCESS' } });
  const applicantName = updated.personnel ? `${updated.personnel.firstName} ${updated.personnel.lastName}` : 'Personnel Staff';
  const targetNotifyUsers = await prisma.user.findMany({
    where: { role: { name: 'AO_II' }, accountStatus: 'ACTIVE' },
    select: { id: true },
  });
  if (targetNotifyUsers.length > 0) {
    await prisma.notification.createMany({
      data: targetNotifyUsers.map(u => ({
        userId: u.id,
        message: `New transaction #${id} (${updated.transactionType.name}) submitted by ${applicantName} for validation.`,
        type: 'INFO' as const,
        relatedEntityId: id,
        relatedEntityType: 'Transaction',
      })),
    });
    notifyUserNotifications(targetNotifyUsers.map(u => u.id));
  }
  notifyTransactionChange();
  sendSuccess(res, { id: updated.id, status: updated.status, submissionDate: updated.submissionDate }, 'Transaction submitted for validation.');
};

/** POST /transactions/:id/validate */
export const validateTransaction = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0 || id > 2147483647) { sendNotFound(res, 'Transaction not found.'); return; }
  const { documentValidations, overallValidationStatus, targetStatus, remarks } = req.body;
  const transaction = await prisma.transaction.findUnique({ where: { id } });
  if (!transaction) { sendNotFound(res, 'Transaction not found.'); return; }
  if (transaction.status === 'APPROVED') {
    sendBadRequest(res, `Transaction #${id} has already been approved and finalized.`, 'TRANSACTION_ALREADY_APPROVED');
    return;
  }

  const hasDeficiencies = targetStatus === 'DEFICIENCY' || documentValidations?.some((v: any) => !v.isValid);
  let newStatus: any = hasDeficiencies ? 'DEFICIENCY' : 'FOR_APPROVAL';
  if (targetStatus && ['FOR_APPROVAL', 'DEFICIENCY', 'REJECTED'].includes(targetStatus)) { newStatus = targetStatus; }

  await prisma.$transaction(async (tx) => {
    const deficientDocNames: string[] = [];

    if (documentValidations && Array.isArray(documentValidations) && documentValidations.length > 0) {
      for (const dv of documentValidations) {
        if (dv.documentId) {
          const docId = parseInt(dv.documentId, 10);
          if (!isNaN(docId) && docId > 0) {
            const isVal = dv.isValid !== false;
            await tx.uploadedDocument.updateMany({
              where: { id: docId },
              data: {
                status: isVal ? 'VALIDATED' : 'REJECTED',
                validationNotes: dv.feedback || remarks,
                validatedByUserId: req.user!.userId,
                validationDate: new Date(),
              },
            });
            if (!isVal) {
              const docItem = await tx.uploadedDocument.findUnique({
                where: { id: docId },
                include: { requirementTemplate: { select: { name: true } } },
              });
              if (docItem) {
                deficientDocNames.push(docItem.requirementTemplate?.name || docItem.fileName || 'Requirement Document');
              }
            }
          }
        }
      }
    } else if (newStatus === 'DEFICIENCY') {
      const existingDocs = await tx.uploadedDocument.findMany({ where: { transactionId: id } });
      if (existingDocs.length > 0) {
        // Mark first doc as REJECTED and remaining as VALIDATED by default
        await tx.uploadedDocument.updateMany({
          where: { id: existingDocs[0].id },
          data: { status: 'REJECTED', validationNotes: remarks || 'Document flagged as deficient', validatedByUserId: req.user!.userId, validationDate: new Date() },
        });
        deficientDocNames.push(existingDocs[0].fileName || 'Requirement Document');
        for (let i = 1; i < existingDocs.length; i++) {
          await tx.uploadedDocument.updateMany({
            where: { id: existingDocs[i].id },
            data: { status: 'VALIDATED', validationNotes: 'Verified by AO II', validatedByUserId: req.user!.userId, validationDate: new Date() },
          });
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

      if (hasDeficiencies) {
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
      if (hasDeficiencies && txWithPersonnel.personnel.user.email) {
        try {
          const userObj = txWithPersonnel.personnel.user;
          const magicToken = generateMagicToken({
            userId: userObj.id,
            email: userObj.email,
            role: userObj.role?.name || 'TEACHING_PERSONNEL',
            txId: id,
          });

          const docItems = (deficientDocNames.length > 0 ? deficientDocNames : ['Requirement Checklist Documents']).map(name => ({
            name,
            remarks: remarks || 'Returned for compliance revision by Administrative Officer (AO II).',
          }));

          // Send asynchronously so response stays instant
          sendDeficiencyAlertEmail({
            recipientEmail: userObj.email,
            recipientName: `${txWithPersonnel.personnel.firstName} ${txWithPersonnel.personnel.lastName}`,
            transactionId: id,
            transactionType: txWithPersonnel.transactionType?.name || '201 Transaction',
            aoRemarks: remarks || undefined,
            deficientDocuments: docItems,
            magicToken,
          }).catch(err => {
            console.error(`[validateTransaction] Background deficiency email dispatch failed for TRX-${id}:`, err);
          });
        } catch (emailErr) {
          console.error(`[validateTransaction] Could not generate deficiency email for TRX-${id}:`, emailErr);
        }
      }
    }

    if (!hasDeficiencies) {
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
  if (isApproved === undefined) { sendBadRequest(res, 'isApproved (boolean) is required.'); return; }
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
    await tx.transaction.update({ where: { id }, data: { status: newStatus, approvalDate: new Date(), remarks: notes } });

    if (isApproved && transaction.personnelId) {
      const txTypeName = (transaction.transactionType?.name || '').toUpperCase();
      const isReclass = txTypeName.includes('RECLASSIFICATION') || txTypeName.includes('RECLASS');
      const isAppointment = txTypeName.includes('APPOINTMENT') || txTypeName.includes('APPOINT') || txTypeName.includes('NEWLY HIRED');
      const isPromo = txTypeName.includes('PROMOTION') || isReclass || isAppointment;

      // Update designation and record career history for promotions, appointments, and reclassifications
      if (isPromo) {
        let targetPosition: string | null = null;

        // 1. Try finding by linked transactionId first
        let selectedApp = await tx.promotionApplication.findFirst({
          where: {
            personnelId: transaction.personnelId,
            scoreDetailsJson: { path: ['transactionId'], equals: id },
          },
          include: { promotionCycle: true },
        });

        // 2. Fallback: match by personnelId and recent promotional status
        if (!selectedApp) {
          selectedApp = await tx.promotionApplication.findFirst({
            where: {
              personnelId: transaction.personnelId,
              OR: [
                { status: 'APPROVED' },
                { status: 'RANKED' },
                { scoreDetailsJson: { path: ['manuallyPromoted'], equals: true } },
                { scoreDetailsJson: { path: ['stageStatus'], equals: 'SELECTED_PENDING_DOCS' } },
                { scoreDetailsJson: { path: ['stageStatus'], equals: 'FINAL_RANKED' } },
                { scoreDetailsJson: { path: ['stageStatus'], equals: 'OFFICIALLY_PROMOTED' } },
              ],
            },
            include: { promotionCycle: true },
            orderBy: { updatedAt: 'desc' },
          });
        }

        // 3. Fallback: match any latest application for this personnel
        if (!selectedApp) {
          selectedApp = await tx.promotionApplication.findFirst({
            where: { personnelId: transaction.personnelId },
            include: { promotionCycle: true },
            orderBy: { updatedAt: 'desc' },
          });
        }

        if (selectedApp) {
          const cycleRules = (selectedApp.promotionCycle.rulesConfigurationJson as any) || {};
          targetPosition = cycleRules?.targetPosition || (selectedApp.scoreDetailsJson as any)?.targetPosition || null;
          const appDetails = (selectedApp.scoreDetailsJson as Record<string, any>) || {};
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
              }).catch((err: any) => console.error('Failed to log PLANTILLA_ITEM_OCCUPIED:', err));
            }
          }
        }

        // Extract from transaction remarks if still not found (e.g. 'active for position "Master Teacher I"')
        if (!targetPosition && transaction.remarks) {
          const match = transaction.remarks.match(/position ["']([^"']+)["']/i) ||
                        transaction.remarks.match(/as ([^•\(\n]+) under/i);
          if (match && match[1]) {
            targetPosition = match[1].trim();
          }
        }

        // Or fallback to assigned plantilla position title
        if (!targetPosition && transaction.personnel.plantillaItem?.positionTitle) {
          targetPosition = transaction.personnel.plantillaItem.positionTitle;
        }

        const finalDesignation = targetPosition || transaction.personnel.designation || 'Teacher I';

        // Automatically update personnel designation upon final HR document verification & approval
        await tx.personnel.update({
          where: { id: transaction.personnelId },
          data: { designation: finalDesignation },
        });

        // Create official Career History Entry for PROMOTION / APPOINTMENT / RECLASSIFICATION
        const eventType = isReclass
          ? 'RECLASSIFICATION'
          : (isAppointment && !txTypeName.includes('PROMOTION') ? 'APPOINTMENT' : 'PROMOTION');

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
    }
  });

  if (transaction.personnel.user) notifyUserNotifications([transaction.personnel.user.id]);
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
  const complianceScore = totalCount > 0 ? Math.round((uploadedCount / totalCount) * 100) : 100;
  const isComplete = checklist.filter(c => c.isMandatory).every(c => c.isUploaded);
  sendSuccess(res, { complianceScore, isComplete, status: isComplete ? 'Ready for Validation' : 'Incomplete Submission', recommendation: isComplete ? 'All required documents uploaded. You may submit this transaction for AO II validation.' : 'Please upload all missing required documents before submitting.', checklist });
};

/**
 * POST /transactions/:id/demo-upload
 * Demo mode: Auto-upload realistic sample documents for all requirements of this transaction.
 */
export const demoAutoUploadDocuments = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0 || id > 2147483647) {
    sendNotFound(res, 'Transaction not found.');
    return;
  }

  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: {
      transactionType: { include: { requirementTemplates: true } },
      uploadedDocuments: true,
    },
  });

  if (!transaction) {
    sendNotFound(res, 'Transaction not found.');
    return;
  }

  // Ensure permission: personnel itself or administrative staff
  const isOwner = transaction.personnelId === req.user?.personnelId;
  const isStaff = ['SYSTEM_ADMIN', 'HRMO', 'AO_II'].includes(req.user?.role || '');
  if (!isOwner && !isStaff) {
    sendForbidden(res, 'You do not have permission to upload documents for this transaction.');
    return;
  }

  // Retrieve requirement templates for this transaction type
  let templates = transaction.transactionType.requirementTemplates;
  if (templates.length === 0) {
    templates = await prisma.requirementTemplate.findMany();
  }

  const sampleFileNames: Record<string, string> = {
    'oath': 'DepEd_Oath_of_Office_2025_Signed.pdf',
    'omnibus': 'Omnibus_Certification_Authenticity_Veracity.pdf',
    'pds': 'CS_Form_212_Personal_Data_Sheet_Revised_2025.pdf',
    'personal data sheet': 'CS_Form_212_Personal_Data_Sheet_Revised_2025.pdf',
    'work experience': 'Work_Experience_Sheet_CS_Form_212.pdf',
    'prc': 'PRC_ID_Card_and_Verification_Printout.pdf',
    'board rating': 'PRC_Board_Rating_Certified_True_Copy.pdf',
    'eligibility': 'CSC_Certificate_of_Eligibility.pdf',
    'principal': 'Principals_Test_Certificate_of_Rating.pdf',
    'tor': 'Official_Transcript_of_Records_TOR_CAV.pdf',
    'transcript': 'Official_Transcript_of_Records_TOR_CAV.pdf',
    'saln': 'SALN_Revised_2025_Duly_Subscribed.pdf',
    'service record': 'DepEd_Updated_Service_Record_Signed.pdf',
    'payslip': 'Latest_DepEd_Monthly_Payslip_Certified.pdf',
    'performance': 'IPCRF_Very_Satisfactory_Rating_Signed.pdf',
    'ipcrf': 'IPCRF_Very_Satisfactory_Rating_Signed.pdf',
    'medical': 'Medical_Certificate_CS_Form_211.pdf',
    'nbi': 'NBI_Clearance_Valid_Copy.pdf',
    'birth': 'PSA_Authenticated_Birth_Certificate.pdf',
    'marriage': 'PSA_Authenticated_Marriage_Certificate.pdf',
    'position': 'Position_Description_Form_DBM_CSC.pdf',
    'plantilla': 'Plantilla_Allocation_Appointment_Form.pdf',
  };

  const getRealisticFileName = (templateName: string): string => {
    const lower = templateName.toLowerCase();
    for (const [key, val] of Object.entries(sampleFileNames)) {
      if (lower.includes(key)) return val;
    }
    const clean = templateName.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_');
    return `Verified_Sample_${clean}.pdf`;
  };

  const existingDocMap = new Map(transaction.uploadedDocuments.map(d => [d.requirementTemplateId, d]));
  const processedDocs: any[] = [];

  for (const tmpl of templates) {
    const fileName = getRealisticFileName(tmpl.name);
    const existing = existingDocMap.get(tmpl.id);

    if (existing) {
      const updated = await prisma.uploadedDocument.update({
        where: { id: existing.id },
        data: {
          status: 'VALIDATED',
          fileName,
          validationNotes: null,
          storagePath: `/uploads/demo_${transaction.id}_${tmpl.id}.pdf`,
          fileSize: 1024 * (180 + (tmpl.id * 15)),
          mimeType: 'application/pdf',
        },
      });
      processedDocs.push(updated);
    } else {
      const created = await prisma.uploadedDocument.create({
        data: {
          transactionId: transaction.id,
          requirementTemplateId: tmpl.id,
          fileName,
          storagePath: `/uploads/demo_${transaction.id}_${tmpl.id}.pdf`,
          fileSize: 1024 * (180 + (tmpl.id * 15)),
          mimeType: 'application/pdf',
          uploadedByUserId: req.user!.userId,
          status: 'VALIDATED',
        },
      });
      processedDocs.push(created);
    }
  }

  // Log in validation log
  try {
    await prisma.validationLog.create({
      data: {
        entityType: 'Transaction',
        entityId: transaction.id,
        action: 'DEMO_AUTO_UPLOAD_COMPLETED',
        detailsJson: {
          count: processedDocs.length,
          documents: processedDocs.map(d => ({ id: d.id, name: d.fileName })),
        },
        userId: req.user!.userId,
        status: 'SUCCESS',
      },
    });
  } catch (logErr) {
    console.warn('Could not write demo auto-upload validation log:', logErr);
  }

  notifyTransactionChange();

  sendSuccess(res, {
    transactionId: transaction.id,
    uploadedCount: processedDocs.length,
    documents: processedDocs,
    complianceScore: 100,
    isComplete: true,
  }, `Demo Auto-Upload complete: ${processedDocs.length} required documents uploaded and verified!`);
};
