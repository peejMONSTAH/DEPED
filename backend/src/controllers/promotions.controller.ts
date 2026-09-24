import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { notifyTransactionChange } from './transactions.controller';
import { notifyUserNotifications } from './notifications.controller';
import {
  sendSuccess, sendCreated, sendNotFound, sendBadRequest, sendForbidden, sendError,
  getPaginationParams, buildPaginationMeta,
} from '../utils/response.util';
import { PromotionCycleStatus, PromotionCycleType } from '@prisma/client';
import {
  getStationScope,
  isWithinDistrict,
  personnelInScope,
  promotionApplicationScopeFilter,
  sameStation,
  stationOfficerUserIds,
  StationScope,
} from '../utils/scope.util';
import { denyOutOfScope } from '../utils/access-denial.util';
import { isPersonnelRole } from '../utils/personnel-validation.util';
import { generateEmployeeNumber } from './users.controller';
import { processWorkflowOutbox, queueTransactionalEmail } from '../services/workflow-outbox.service';
import { config } from '../config';
import { hashPassword, validatePasswordComplexity } from '../utils/hash.util';
import { checkPromotionEligibility, resolveCanonicalPosition } from '../utils/deped.util';
import { logger } from '../utils/logger';
import { applicantNumberFor } from '../utils/applicant-number.util';
import { CarDocumentService, CarDataIncompleteError, CarCycleNotFoundError } from '../services/car-document.service';
import { computeCycleRanking } from '../services/promotion-ranking.service';
import { deliberationBlockReason, selectionBlockReason } from '../utils/promotion-stage.util';
import { ANNEX_C_REQUIREMENTS, MANDATORY_ANNEX_C_CODES } from '../utils/annex-c.util';
import { lockTransaction, workflowConflict } from '../utils/transaction-lock.util';

// ── Promotion Cycles ───────────────────────────────────────────────────────

/**
 * Applications an account sees in promotion lists, rankings, exports and
 * applicant counts. An AO II sees their own station's applicants only; HRMO
 * sees the division. Built on the one scope policy in scope.util.
 */
const reviewableApplications = (scope: StationScope) => promotionApplicationScopeFilter(scope, 'review');

/** HRMO plus the AO II of the applicant's station, never every AO II in the division. */
const promotionReviewerIds = async (applicantSchool: unknown): Promise<number[]> => {
  const [hrmo, officers] = await Promise.all([
    prisma.user.findMany({ where: { role: { name: 'HRMO' }, accountStatus: 'ACTIVE' }, select: { id: true } }),
    stationOfficerUserIds(applicantSchool),
  ]);
  return Array.from(new Set([...hrmo.map(u => u.id), ...officers]));
};

const normalizePositionTitle = (value: unknown): string => String(value || '')
  .normalize('NFKD')
  .toLowerCase()
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\b(?:salary\s*grade|sg)\s*\d+\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export const getCycleTargetPosition = (cycle: { name?: string | null; rulesConfigurationJson?: unknown }): string => {
  const rules = (cycle.rulesConfigurationJson as Record<string, any>) || {};
  if (rules.targetPosition || rules.positionTitle) return String(rules.targetPosition || rules.positionTitle).trim();
  return String(cycle.name || '')
    .replace(/^ranking\s+for\s+(?:natural\s+)?vacancy\s*:\s*/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
};

export const getPromotionCycles = async (req: Request, res: Response): Promise<void> => {
  if (req.user?.role === 'SYSTEM_ADMIN') {
    res.status(403).json({
      status: 'error',
      message: 'Access denied: System Administrator cannot access promotions. Promotion cycles and Comparative Assessment Results are managed by HRMO and AO officers.',
      code: 'FORBIDDEN',
    });
    return;
  }

  const { page, limit, skip } = getPaginationParams(req.query as Record<string, unknown>);
  const { status, search } = req.query;
  let where: any = {};

  if (status) {
    const raw = String(status).trim().toUpperCase();
    if (raw === 'ALL') {
      where = {};
    } else if (raw === 'ONGOING' || raw === 'ACTIVE') {
      where = { status: { in: ['ACTIVE', 'EVALUATION', 'COMPARATIVE_ASSESSMENT'] } };
    } else if (raw === 'FINISHED' || raw === 'CLOSED') {
      where = { status: { in: ['CLOSED', 'FINALIZED', 'RESULTS_READY', 'PUBLISHED', 'RESOLVED'] } };
    } else if (raw === 'CANCELLED') {
      where = { status: 'CANCELLED' };
    } else if (raw === 'PLANNING') {
      where = { status: { in: ['PLANNING', 'CONFIGURED'] } };
    } else if (raw.includes(',')) {
      where = { status: { in: raw.split(',').map(s => s.trim()) as PromotionCycleStatus[] } };
    } else {
      where = { status: raw as PromotionCycleStatus };
    }
  } else {
    // By default for general public / personnel home without params:
    where = { status: { in: ['ACTIVE', 'PLANNING'] } };
  }

  if (search) {
    where.name = { contains: String(search), mode: 'insensitive' };
  }

  if (req.user?.personnelId && (req.query.includeMyApplications === 'true' || req.query.forPersonnel === 'true')) {
    where = {
      OR: [
        where,
        { promotionApplications: { some: { personnelId: req.user.personnelId } } },
      ],
    };
  } else if (!status || String(status).toUpperCase() === 'ACTIVE' || String(status).toUpperCase() === 'ONGOING') {
    // For open opportunity queries without explicit application history, never include cancelled cycles
    where.status = { not: 'CANCELLED', in: ['ACTIVE', 'PLANNING'] };
  }

  // An AO II is told how many of their own station's personnel applied, never
  // the division-wide total, which would disclose other stations' activity.
  const scope = await getStationScope(req.user);
  const countedApplications = scope.role === 'AO_II' ? { where: reviewableApplications(scope) } : true;

  const [data, total] = await Promise.all([
    prisma.promotionCycle.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { promotionApplications: countedApplications } },
      },
    }),
    prisma.promotionCycle.count({ where }),
  ]);

  let myApplications: any[] = [];
  let currentPosition = '';
  if (req.user?.personnelId) {
    const [myApps, personnel] = await Promise.all([
      prisma.promotionApplication.findMany({
        where: { personnelId: req.user.personnelId },
        select: {
          id: true,
          promotionCycleId: true,
          status: true,
          finalRank: true,
          applicationDate: true,
          scoreDetailsJson: true,
        },
      }),
      prisma.personnel.findUnique({
        where: { id: req.user.personnelId },
        select: { designation: true, plantillaItem: { select: { positionTitle: true } } },
      }),
    ]);
    myApplications = myApps;
    currentPosition = personnel?.designation || personnel?.plantillaItem?.positionTitle || '';
  }

  const appsMap = new Map(myApplications.map(a => [a.promotionCycleId, a]));

  const enriched = data.map(cycle => {
    const targetPosition = getCycleTargetPosition(cycle);
    const eligibility = currentPosition
      ? checkPromotionEligibility(currentPosition, targetPosition, cycle.type)
      : null;

    const myApp = appsMap.get(cycle.id);
    const hasChecklist = Boolean((myApp?.scoreDetailsJson as any)?.annexCChecklist);
    const appDetails = (myApp?.scoreDetailsJson as Record<string, any>) || {};

    return {
      ...cycle,
      applicantCount: cycle._count?.promotionApplications || 0,
      hasApplied: Boolean(myApp),
      hasChecklist,
      myApplication: myApp ? {
        id: myApp.id,
        status: myApp.status,
        finalRank: myApp.finalRank,
        applicationDate: myApp.applicationDate,
        hasChecklist,
        annexCChecklist: appDetails.annexCChecklist || null,
        applicantNumber: appDetails.applicantNumber,
        stageStatus: appDetails.stageStatus,
        verificationStatus: appDetails.verificationStatus || appDetails.completenessStatus,
        verificationRemarks: appDetails.verificationRemarks || appDetails.initialRating?.aoRemarks,
        totalScore: appDetails.totalScore ?? appDetails.finalRating?.finalTotalScore ?? appDetails.initialTotalScore,
        disqualificationReason: appDetails.disqualificationReason,
        deliberationRemarks: appDetails.remarks || appDetails.finalRating?.hrmoRemarks,
        forAppointment: appDetails.forAppointment,
        cycleStatus: appDetails.cycleStatus || cycle.status,
      } : null,
      targetPosition,
      currentPosition: currentPosition || undefined,
      isCurrentPosition: Boolean(currentPosition) && normalizePositionTitle(currentPosition) === normalizePositionTitle(targetPosition),
      isEligible: eligibility ? eligibility.isEligible : true,
      ineligibilityReason: eligibility && !eligibility.isEligible ? eligibility.reason : null,
      jumpPositions: eligibility?.jump ?? null,
      maxAllowedJump: eligibility?.maxAllowedJump ?? (cycle.type === 'ECP' ? 3 : 2),
    };
  });

  sendSuccess(res, enriched, undefined, 200, buildPaginationMeta(page, limit, total));
};

export const createPromotionCycle = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'HRMO') {
      res.status(403).json({
        status: 'error',
        message: 'Access denied: System Administrator cannot create promotions. Promotion cycles can only be created by HR (HRMO).',
        code: 'FORBIDDEN',
      });
      return;
    }

    const { name, type, startDate, endDate, rulesConfigurationJson, status } = req.body;
    if (!name || !type || !startDate || !endDate) {
      sendBadRequest(res, 'name, type, startDate, and endDate are required.');
      return;
    }
    if (!Object.values(PromotionCycleType).includes(type as PromotionCycleType)) {
      sendBadRequest(res, `Invalid type. Must be: ${Object.values(PromotionCycleType).join(', ')}`);
      return;
    }

    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);

    if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
      sendBadRequest(res, 'Invalid startDate or endDate format.');
      return;
    }

    const initialStatus = (status && Object.values(PromotionCycleStatus).includes(status as PromotionCycleStatus))
      ? (status as PromotionCycleStatus)
      : 'ACTIVE';

    // A cycle and the audit entry recording who opened it are one unit of work.
    // Notifications below are deliberately post-commit.
    const cycle = await prisma.$transaction(async tx => {
      const created = await tx.promotionCycle.create({
        data: {
          name,
          type: type as PromotionCycleType,
          startDate: parsedStartDate,
          endDate: parsedEndDate,
          status: initialStatus,
          rulesConfigurationJson: rulesConfigurationJson || null,
        },
      });

      if (req.user?.userId) {
        await tx.validationLog.create({
          data: {
            entityType: 'PromotionCycle',
            entityId: created.id,
            action: 'PROMOTION_CYCLE_CREATED',
            userId: req.user.userId,
            status: 'SUCCESS',
          },
        });
      }
      return created;
    });

    // Notify all personnels (TEACHING_PERSONNEL, NON_TEACHING_PERSONNEL) and AO (AO_II)
    // Strictly exclude SYSTEM_ADMIN and HRMO as required
    try {
      const targetNotifyUsers = await prisma.user.findMany({
        where: {
          accountStatus: 'ACTIVE',
          role: {
            name: {
              in: ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL', 'AO_II'],
              notIn: ['SYSTEM_ADMIN', 'HRMO'],
            },
          },
        },
        select: {
          id: true,
          role: { select: { name: true } },
        },
      });

      if (targetNotifyUsers.length > 0) {
        const notificationsData = targetNotifyUsers.map(u => {
          const isAo = u.role?.name === 'AO_II';
          const message = isAo
            ? `New Promotion Cycle Active: "${cycle.name}" has been created. Prepare for applicant qualification and initial rating.`
            : `New Promotion Cycle Opened: "${cycle.name}" is now active for applications. Check your requirements and apply!`;

          return {
            userId: u.id,
            message,
            type: 'INFO' as const,
            relatedEntityId: cycle.id,
            relatedEntityType: 'PromotionCycle',
          };
        });

        await prisma.notification.createMany({
          data: notificationsData,
        });

        notifyUserNotifications(targetNotifyUsers.map(u => u.id));
        notifyTransactionChange();
      }
    } catch (notifyErr) {
      logger.warn({ err: notifyErr }, 'Failed to send promotion cycle creation notifications');
    }

    sendCreated(res, cycle, 'Promotion cycle created.');
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to create promotion cycle');
    sendError(res, 'Failed to create promotion cycle.', 500);
  }
};

export const updatePromotionCycle = async (req: Request, res: Response): Promise<void> => {
  if (req.user?.role !== 'HRMO') {
    res.status(403).json({
      status: 'error',
      message: 'Access denied: Only HR (HRMO) can modify promotion cycles.',
      code: 'FORBIDDEN',
    });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { sendBadRequest(res, 'Invalid cycle ID format.'); return; }
  const { status, endDate, rulesConfigurationJson, cancellationReason } = req.body;
  let targetStatus = status;
  if (targetStatus === 'COMPLETED') {
    targetStatus = 'CLOSED';
  }

  if (targetStatus && !Object.values(PromotionCycleStatus).includes(targetStatus as PromotionCycleStatus)) {
    sendBadRequest(res, `Invalid status "${status}". Allowed values: ${Object.values(PromotionCycleStatus).join(', ')}`);
    return;
  }

  const previousCycle = await prisma.promotionCycle.findUnique({
    where: { id },
    include: {
      promotionApplications: {
        include: {
          personnel: {
            include: { user: true },
          },
        },
      },
    },
  });

  if (!previousCycle) {
    sendNotFound(res, 'Promotion cycle not found.');
    return;
  }

  const isCancelling = Boolean(targetStatus) && targetStatus !== previousCycle.status && targetStatus === 'CANCELLED';
  const reason = typeof cancellationReason === 'string' ? cancellationReason.trim() : '';
  if (isCancelling && reason.length < 10) {
    sendBadRequest(res, 'A cancellation reason of at least 10 characters is required.', 'CANCELLATION_REASON_REQUIRED');
    return;
  }
  if (isCancelling && ['FINALIZED', 'PUBLISHED', 'RESOLVED'].includes(previousCycle.status)) {
    sendBadRequest(res, 'This cycle has finalized results. Review issued appointments before cancellation.', 'CYCLE_ALREADY_FINALIZED');
    return;
  }

  // Cancelling a cycle must also discontinue its applications and their draft
  // transactions. Doing that outside a transaction could leave a cancelled cycle
  // whose applicants still appear active. Notifications stay post-commit.
  const updated = await prisma.$transaction(async tx => {
    const row = await tx.promotionCycle.update({
      where: { id },
      data: {
        ...(targetStatus && { status: targetStatus as PromotionCycleStatus }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(rulesConfigurationJson && { rulesConfigurationJson }),
      },
    });

    if (isCancelling) {
      const apps = await tx.promotionApplication.findMany({ where: { promotionCycleId: id } });

      // One statement for every linked draft transaction instead of one per application.
      const linkedTransactionIds = apps
        .map(app => Number(((app.scoreDetailsJson as Record<string, any>) || {}).transactionId))
        .filter(txId => Number.isInteger(txId) && txId > 0);

      if (linkedTransactionIds.length > 0) {
        await tx.transaction.updateMany({
          where: {
            id: { in: linkedTransactionIds },
            status: { in: ['DRAFT', 'PENDING_VALIDATION', 'DEFICIENCY', 'ESCALATED'] },
          },
          data: { status: 'ABANDONED', remarks: `Promotion cycle "${row.name}" was cancelled by HRMO: ${reason}` },
        });
      }

      // Each application merges into its own scoreDetailsJson, so these stay per-row.
      const cancelledAt = new Date().toISOString();
      for (const app of apps) {
        const currentDetails = (app.scoreDetailsJson as Record<string, any>) || {};
        await tx.promotionApplication.update({
          where: { id: app.id },
          data: {
            scoreDetailsJson: {
              ...currentDetails,
              stageStatus: 'CANCELLED',
              cycleCancelled: true,
              cancelledAt,
              cancelledByUserId: req.user?.userId,
              cancellationRemarks: reason,
            },
          },
        });
      }
    }

    return row;
  });

  // Notify affected applicants and relevant personnel when cycle status changes
  if (targetStatus && targetStatus !== previousCycle.status) {
    try {
      if (targetStatus === 'CANCELLED') {
        // Applications and their draft transactions were already discontinued in the
        // transaction above; what remains here is purely notifying people.
        const applicantUserIds = Array.from(new Set(
          previousCycle.promotionApplications
            .map(a => a.personnel?.user?.id || a.personnel?.userId)
            .filter((uId): uId is number => typeof uId === 'number')
        ));

        if (applicantUserIds.length > 0) {
          await prisma.notification.createMany({
            data: applicantUserIds.map(uid => ({
              userId: uid,
              message: `Promotion Cycle Cancelled: The promotion cycle "${updated.name}" has been cancelled by HRMO. Applications under this cycle have been discontinued.`,
              type: 'WARNING' as const,
              relatedEntityId: updated.id,
              relatedEntityType: 'PromotionCycle',
            })),
          });
          notifyUserNotifications(applicantUserIds);
        }

        // 3. Notify Administrative Officers (AO II)
        const aoUsers = await prisma.user.findMany({
          where: { role: { name: 'AO_II' } },
          select: { id: true },
        });
        if (aoUsers.length > 0) {
          const aoIds = aoUsers.map(u => u.id);
          await prisma.notification.createMany({
            data: aoIds.map(uid => ({
              userId: uid,
              message: `Promotion Cycle Cancelled: "${updated.name}" has been cancelled by HRMO.`,
              type: 'WARNING' as const,
              relatedEntityId: updated.id,
              relatedEntityType: 'PromotionCycle',
            })),
          });
          notifyUserNotifications(aoIds);
        }
      } else if (targetStatus === 'CLOSED' || targetStatus === 'FINALIZED') {
        const applicantUserIds = Array.from(new Set(
          previousCycle.promotionApplications
            .map(a => a.personnel?.user?.id || a.personnel?.userId)
            .filter((uId): uId is number => typeof uId === 'number')
        ));

        if (applicantUserIds.length > 0) {
          await prisma.notification.createMany({
            data: applicantUserIds.map(uid => ({
              userId: uid,
              message: `Promotion Cycle Concluded: "${updated.name}" is now ${targetStatus === 'CLOSED' ? 'closed' : 'finalized'}. Deliberation and Comparative Assessment Results (CAR) are officially available.`,
              type: 'INFO' as const,
              relatedEntityId: updated.id,
              relatedEntityType: 'PromotionCycle',
            })),
          });
          notifyUserNotifications(applicantUserIds);
        }
      } else if (targetStatus === 'ACTIVE' && previousCycle.status !== 'ACTIVE') {
        const targetUsers = await prisma.user.findMany({
          where: { role: { name: { in: ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL', 'AO_II'] } } },
          select: { id: true, role: { select: { name: true } } },
        });
        if (targetUsers.length > 0) {
          await prisma.notification.createMany({
            data: targetUsers.map(u => ({
              userId: u.id,
              message: u.role?.name === 'AO_II'
                ? `Promotion Cycle Active: "${updated.name}" is now open for applicant evaluations.`
                : `Promotion Cycle Opened: "${updated.name}" is now active and accepting applications. Check your requirements and apply!`,
              type: 'INFO' as const,
              relatedEntityId: updated.id,
              relatedEntityType: 'PromotionCycle',
            })),
          });
          notifyUserNotifications(targetUsers.map(u => u.id));
        }
      }
    } catch (notifErr) {
      logger.error({ err: notifErr }, 'Failed to notify users of promotion cycle status change');
    }
  }

  notifyTransactionChange();
  sendSuccess(res, updated, 'Promotion cycle updated.');
};

/** Kept as the controller-facing name; the rules now live in the ranking service. */
export const computeCycleRankingInternal = computeCycleRanking;

export const generateRanking = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { sendBadRequest(res, 'Invalid cycle ID format.'); return; }
  const cycle = await prisma.promotionCycle.findUnique({ where: { id } });
  if (!cycle) { sendNotFound(res, 'Promotion cycle not found.'); return; }

  const ranked = await computeCycleRankingInternal(id);
  if (ranked === null) {
    sendError(res, 'Ranking could not be generated for this cycle. The previous results are unchanged.', 500, 'RANKING_FAILED');
    return;
  }
  sendSuccess(res, { rankingJobId: `job-${id}-${Date.now()}`, status: 'Completed', totalRanked: ranked.length }, 'Initial top list ranking generated successfully.');
};

export const getRankingResults = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { sendBadRequest(res, 'Invalid cycle ID format.'); return; }
  const where = { AND: [{ promotionCycleId: id }, reviewableApplications(await getStationScope(req.user))] };

  const [cycle, applications] = await Promise.all([
    prisma.promotionCycle.findUnique({ where: { id } }),
    prisma.promotionApplication.findMany({
      where,
      orderBy: { finalRank: 'asc' },
      include: { personnel: { select: { id: true, firstName: true, lastName: true, employeeId: true, designation: true, address: true } } },
    }),
  ]);

  sendSuccess(res, applications.map(a => {
    const details = (a.scoreDetailsJson as Record<string, any>) || {};
    const init = details.initialRating || null;
    const fin = details.finalRating || null;
    const hasAoRating = Boolean(init && (init.initialTotalScore !== undefined || init.ratedAt));
    const hasHrmoRating = Boolean(fin && (fin.finalTotalScore !== undefined || fin.ratedAt));
    const desig = a.personnel?.designation?.toLowerCase() || '';
    const cycleTrack = (cycle?.rulesConfigurationJson as any)?.track;
    const isNonTeaching = cycleTrack
      ? (cycleTrack === 'NON_TEACHING')
      : (details.track === 'NON_TEACHING' || desig.includes('administrative') || desig.includes('registrar') || desig.includes('officer') || desig.includes('assistant'));
    const track = isNonTeaching ? 'NON_TEACHING' : 'TEACHING';

    const aoSubtotal = hasAoRating ? Number(init.initialTotalScore || 0) : 0;
    const hrmoSubtotal = hasHrmoRating ? Number(fin.finalTotalScore || 0) : 0;
    const overallTotal = hasAoRating && hasHrmoRating ? (aoSubtotal + hrmoSubtotal) : (hasAoRating ? aoSubtotal : (hasHrmoRating ? hrmoSubtotal : 0));

    return {
      personnelId: a.personnelId,
      applicationId: a.id,
      applicantCode: `APP-${String(a.id).padStart(4, '0')}`,
      firstName: a.personnel.firstName,
      lastName: a.personnel.lastName,
      name: `${a.personnel.lastName}, ${a.personnel.firstName}`,
      employeeId: a.personnel.employeeId,
      designation: a.personnel.designation,
      station: a.personnel.address || 'District Station',
      track,
      hasAoRating,
      hasHrmoRating,
      // AO II Criteria
      educationScore: hasAoRating ? Number(init.educationScore ?? 0) : 0,
      trainingScore: hasAoRating ? Number(init.trainingScore ?? 0) : 0,
      experienceScore: hasAoRating ? Number(init.experienceScore ?? 0) : 0,
      performanceScore: hasAoRating ? Number(init.performanceScore ?? 0) : 0,
      outstandingAccomplishmentsScore: hasAoRating ? Number(init.outstandingAccomplishmentsScore ?? 0) : 0,
      applicationOfEducationScore: hasAoRating ? Number(init.applicationOfEducationScore ?? 0) : 0,
      applicationOfLdScore: hasAoRating ? Number(init.applicationOfLdScore ?? 0) : 0,
      aoSubtotal: parseFloat(aoSubtotal.toFixed(2)),
      aoRemarks: init?.aoRemarks || '',
      // HRMO Criteria
      ppstCoiScore: hasHrmoRating ? Number(fin.ppstCoiScore ?? 0) : 0,
      ppstNcoiScore: hasHrmoRating ? Number(fin.ppstNcoiScore ?? 0) : 0,
      potentialScore: hasHrmoRating ? Number(fin.potentialScore ?? 0) : 0,
      potentialWrittenScore: hasHrmoRating ? Number(fin.potentialWrittenScore ?? 0) : 0,
      potentialBeiScore: hasHrmoRating ? Number(fin.potentialBeiScore ?? 0) : 0,
      potentialSkillsScore: hasHrmoRating ? Number(fin.potentialSkillsScore ?? 0) : 0,
      hrmoSubtotal: parseFloat(hrmoSubtotal.toFixed(2)),
      hrmoRemarks: fin?.hrmoRemarks || '',
      // CAR Master Results
      totalScore: parseFloat(overallTotal.toFixed(2)),
      remarks: details.remarks || fin?.hrmoRemarks || (hasAoRating ? init?.aoRemarks : 'Pending Evaluation'),
      forBackgroundInvestigation: details.forBackgroundInvestigation || 'YES',
      forAppointment: details.forAppointment || 'Recommended for Appointment',
      forProbation: details.forProbation || '6 months',
      rank: a.finalRank || 1,
      status: a.status,
      stageStatus: details.stageStatus || a.status,
    };
  }));
};

export const getPromotionApplications = async (req: Request, res: Response): Promise<void> => {
  const cycleId = parseInt(req.params.id, 10);
  if (isNaN(cycleId)) { sendBadRequest(res, 'Invalid cycle ID format.'); return; }
  const where = { AND: [{ promotionCycleId: cycleId }, reviewableApplications(await getStationScope(req.user))] };

  const applications = await prisma.promotionApplication.findMany({
    where,
    include: {
      personnel: {
        select: { id: true, firstName: true, lastName: true, employeeId: true, designation: true, address: true, school: true, district: true },
      },
    },
    orderBy: { applicationDate: 'desc' },
  });
  sendSuccess(res, applications);
};

// ── AO II Requirements Completeness Verification & HRMO CAR Deliberation ───

export const verifyApplicationRequirements = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'AO_II' && req.user?.role !== 'HRMO' && req.user?.role !== 'SYSTEM_ADMIN') {
      sendForbidden(res, 'Forbidden: Only Administrative Officer II (AO II) and HRMO can verify application requirements.');
      return;
    }

    const cycleId = parseInt(req.params.id, 10);
    const appId = parseInt(req.params.appId, 10);
    if (isNaN(cycleId) || isNaN(appId)) {
      sendBadRequest(res, 'Invalid cycle ID or application ID.');
      return;
    }

    const {
      status, // 'COMPLETE' | 'INCOMPLETE'
      remarks,
      itemVerifications, // Array of { code: string, status: 'VERIFIED' | 'INCOMPLETE' | 'NOT_APPLICABLE', remarks?: string }
    } = req.body;

    const app = await prisma.promotionApplication.findFirst({
      where: { id: appId, promotionCycleId: cycleId },
      include: { personnel: true },
    });

    if (!app) {
      sendNotFound(res, 'Promotion application not found for this cycle.');
      return;
    }

    // Who may verify is decided by the applicant's own station, never by the
    // cycle: Morales and Matulas share District 1, so a district check alone let
    // either AO II verify the other's applicants. Checked before anything about
    // the application is read back or revealed.
    const scope = await getStationScope(req.user);
    if (!(await personnelInScope(scope, app.personnelId, 'review'))) {
      await denyOutOfScope(req, res, { entityType: 'PromotionApplication', entityId: appId, action: 'REQUIREMENTS_VERIFY' }, 'Promotion application not found for this cycle.');
      return;
    }

    const cycle = await prisma.promotionCycle.findUnique({
      where: { id: cycleId },
    });

    if (!cycle) {
      sendNotFound(res, 'Promotion cycle not found.');
      return;
    }

    if (cycle.status === 'CANCELLED' || (app.scoreDetailsJson as Record<string, any> | null)?.stageStatus === 'CANCELLED') {
      sendBadRequest(res, 'This promotion cycle was cancelled. Its applications can no longer be verified.', 'CYCLE_CANCELLED');
      return;
    }

    const rules = (cycle.rulesConfigurationJson as Record<string, any>) || {};
    const cycleDistrict = rules.district;

    // A district-restricted cycle further limits which AO II may verify. It
    // narrows station scope; it never stands in for it.
    if (req.user?.role === 'AO_II' && !isWithinDistrict(scope, cycleDistrict)) {
      sendForbidden(res, `District Scope Restriction: Only Administrative Officer II (AO II) assigned to ${cycleDistrict} can verify requirements for this promotion cycle. Your assigned jurisdiction is ${scope.district || 'Different District / Unassigned'}.`);
      return;
    }

    const currentDetails = (app.scoreDetailsJson as Record<string, any>) || {};
    const isComplete = status === 'COMPLETE';

    // Update items in annexCChecklist if itemVerifications is provided
    let updatedAnnexC = currentDetails.annexCChecklist;
    if (updatedAnnexC && Array.isArray(updatedAnnexC.items) && Array.isArray(itemVerifications)) {
      const verifMap = new Map(itemVerifications.map((v: any) => [v.code, v]));
      const updatedItems = updatedAnnexC.items.map((it: any) => {
        const v = verifMap.get(it.code);
        if (v) {
          return {
            ...it,
            verificationStatus: v.status || (isComplete ? 'VERIFIED' : it.verificationStatus),
            verificationRemarks: v.remarks !== undefined ? v.remarks : it.verificationRemarks,
          };
        }
        return it;
      });
      updatedAnnexC = { ...updatedAnnexC, items: updatedItems };
    }

    const verificationRecord = {
      status: isComplete ? 'COMPLETE' : 'INCOMPLETE',
      verifiedByUserId: req.user?.userId,
      verifiedByRole: req.user?.role,
      verifiedAt: new Date().toISOString(),
      remarks: remarks || (isComplete
        ? 'All documentary requirements verified complete and authentic by AO II in accordance with DepEd Annex C standards.'
        : 'Documentary requirements incomplete or deficient.'),
      itemVerifications: itemVerifications || [],
    };

    const updatedDetails = {
      ...currentDetails,
      stageStatus: isComplete ? 'REQUIREMENTS_VERIFIED' : 'REQUIREMENTS_DEFICIENT',
      requirementsCheck: verificationRecord,
      annexCChecklist: updatedAnnexC || currentDetails.annexCChecklist,
    };

    // The write carries the scope too, so it cannot land if the applicant left
    // the officer's station after the check above.
    const claimed = await prisma.promotionApplication.updateMany({
      where: { AND: [{ id: appId, promotionCycleId: cycleId }, reviewableApplications(scope)] },
      data: {
        status: 'UNDER_REVIEW',
        scoreDetailsJson: updatedDetails,
      },
    });
    if (claimed.count !== 1) {
      await denyOutOfScope(req, res, { entityType: 'PromotionApplication', entityId: appId, action: 'REQUIREMENTS_VERIFY' }, 'Promotion application not found for this cycle.');
      return;
    }
    const updated = await prisma.promotionApplication.findUniqueOrThrow({ where: { id: appId } });

    // Notify all HRMO officers that requirements completeness has been checked
    const hrmoUsers = await prisma.user.findMany({
      where: { role: { name: { in: ['HRMO'] } } },
      select: { id: true },
    });
    if (hrmoUsers.length > 0) {
      const applicantName = `${app.personnel.firstName} ${app.personnel.lastName}`.trim();
      await prisma.notification.createMany({
        data: hrmoUsers.map(h => ({
          userId: h.id,
          message: isComplete
            ? `AO II Requirements Verified: ${applicantName}'s documentary requirements were verified COMPLETE by AO II. Endorsed for HRMPSB score deliberation.`
            : `AO II Requirements Deficient: ${applicantName}'s documentary requirements were marked INCOMPLETE by AO II.`,
          type: isComplete ? 'SUCCESS' : 'WARNING',
          relatedEntityId: appId,
          relatedEntityType: 'PromotionApplication',
        })),
      });
      notifyUserNotifications(hrmoUsers.map(h => h.id));
    }

    // Notify the applicant personnel
    const applicantUserId = app.personnel?.userId || (await prisma.personnel.findUnique({
      where: { id: app.personnelId },
      select: { userId: true },
    }))?.userId;

    if (applicantUserId) {
      await prisma.notification.create({
        data: {
          userId: applicantUserId,
          message: isComplete
            ? `Requirements Verified Complete: Your documentary requirements for "${cycle.name}" were verified COMPLETE by AO II and endorsed for HRMPSB deliberation.`
            : `Requirements Incomplete / Deficient: Your documentary requirements for "${cycle.name}" were marked INCOMPLETE by AO II. Remarks: ${remarks || 'Please check deficiencies and resubmit required documents.'}`,
          type: isComplete ? 'SUCCESS' : 'WARNING',
          relatedEntityId: cycleId,
          relatedEntityType: 'PromotionCycle',
        },
      });
      notifyUserNotifications([applicantUserId]);
    }

    notifyTransactionChange();

    sendSuccess(
      res,
      updated,
      isComplete
        ? 'Requirements verified complete by AO II and applicant endorsed for HRMPSB deliberation.'
        : 'Requirements marked incomplete/deficient by AO II.'
    );
  } catch (err: any) {
    logger.error({ err: err }, 'Failed to verify application requirements');
    sendError(res, 'Failed to verify application requirements.', 500);
  }
};

export const submitFinalRating = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'HRMO' && req.user?.role !== 'SYSTEM_ADMIN') {
      sendForbidden(res, 'Forbidden: Only HRMO staff and System Administrators can finalize promotion ratings.');
      return;
    }

    const cycleId = parseInt(req.params.id, 10);
    const appId = parseInt(req.params.appId, 10);
    if (isNaN(cycleId) || isNaN(appId)) {
      sendBadRequest(res, 'Invalid cycle ID or application ID.');
      return;
    }

    const {
      track,
      // Deliberated Criteria from HRMPSB / HRMO (DepEd Order No. 007, s. 2023)
      educationScore,
      trainingScore,
      experienceScore,
      performanceScore,
      outstandingAccomplishmentsScore,
      applicationOfEducationScore,
      applicationOfLdScore,
      ppstCoiScore,
      ppstNcoiScore,
      potentialScore,
      potentialWrittenScore,
      potentialBeiScore,
      potentialSkillsScore,
      remarks,
      forBackgroundInvestigation,
      forAppointment,
      forProbation,
    } = req.body;

    const app = await prisma.promotionApplication.findFirst({
      where: { id: appId, promotionCycleId: cycleId },
      include: { personnel: true, promotionCycle: true },
    });

    if (!app) {
      sendNotFound(res, 'Promotion application not found for this cycle.');
      return;
    }

    // AO II completeness verification is a precondition of deliberation, not a
    // convention. Without it an unverified applicant could be scored here and
    // then ranked and selected through direct API calls.
    const deliberationBlocked = deliberationBlockReason(app.scoreDetailsJson);
    if (deliberationBlocked) {
      sendBadRequest(res, deliberationBlocked, 'REQUIREMENTS_NOT_VERIFIED');
      return;
    }

    const currentDetails = (app.scoreDetailsJson as Record<string, any>) || {};
    const isNonTeaching = track === 'NON_TEACHING' || currentDetails.track === 'NON_TEACHING' ||
      app.personnel.designation?.toLowerCase().includes('administrative') ||
      app.personnel.designation?.toLowerCase().includes('registrar') ||
      app.personnel.designation?.toLowerCase().includes('officer') ||
      app.personnel.designation?.toLowerCase().includes('assistant');

    // Deliberate Criteria (Max 100 pts overall according to DepEd Order No. 007, s. 2023)
    const edu = Math.min(10, Math.max(0, Number(educationScore ?? currentDetails.finalRating?.educationScore ?? currentDetails.initialRating?.educationScore ?? 10)));
    const train = Math.min(10, Math.max(0, Number(trainingScore ?? currentDetails.finalRating?.trainingScore ?? currentDetails.initialRating?.trainingScore ?? 10)));
    const exp = Math.min(10, Math.max(0, Number(experienceScore ?? currentDetails.finalRating?.experienceScore ?? currentDetails.initialRating?.experienceScore ?? 10)));
    const maxPerf = isNonTeaching ? 20 : 30;
    const perf = Math.min(maxPerf, Math.max(0, Number(performanceScore ?? currentDetails.finalRating?.performanceScore ?? currentDetails.initialRating?.performanceScore ?? maxPerf)));

    let overallTotalScore = 0;
    let hrmoBreakdown: Record<string, any> = {
      educationScore: edu,
      trainingScore: train,
      experienceScore: exp,
      performanceScore: perf,
    };

    if (isNonTeaching) {
      // Non-Teaching: Education (10), Training (10), Experience (10), Performance (20),
      // Accomplishments (5), App of Ed (15), App of L&D (10), Potential (20) = 100
      const outAcc = Math.min(5, Math.max(0, Number(outstandingAccomplishmentsScore ?? currentDetails.finalRating?.outstandingAccomplishmentsScore ?? currentDetails.initialRating?.outstandingAccomplishmentsScore ?? 5)));
      const appEdu = Math.min(15, Math.max(0, Number(applicationOfEducationScore ?? currentDetails.finalRating?.applicationOfEducationScore ?? currentDetails.initialRating?.applicationOfEducationScore ?? 15)));
      const appLd = Math.min(10, Math.max(0, Number(applicationOfLdScore ?? currentDetails.finalRating?.applicationOfLdScore ?? currentDetails.initialRating?.applicationOfLdScore ?? 10)));

      const written = Math.min(5, Math.max(0, Number(potentialWrittenScore ?? currentDetails.finalRating?.potentialWrittenScore ?? 5)));
      const bei = Math.min(5, Math.max(0, Number(potentialBeiScore ?? currentDetails.finalRating?.potentialBeiScore ?? 5)));
      const skills = Math.min(10, Math.max(0, Number(potentialSkillsScore ?? currentDetails.finalRating?.potentialSkillsScore ?? 10)));
      const totalPotential = potentialScore !== undefined ? Math.min(20, Math.max(0, Number(potentialScore))) : Math.min(20, written + bei + skills);

      overallTotalScore = parseFloat((edu + train + exp + perf + outAcc + appEdu + appLd + totalPotential).toFixed(2));
      hrmoBreakdown = {
        ...hrmoBreakdown,
        outstandingAccomplishmentsScore: outAcc,
        applicationOfEducationScore: appEdu,
        applicationOfLdScore: appLd,
        potentialScore: totalPotential,
        potentialWrittenScore: written,
        potentialBeiScore: bei,
        potentialSkillsScore: skills,
      };
    } else {
      // Teaching: Education (10), Training (10), Experience (10), Performance (30),
      // PPST COIs (25), PPST NCOIs (15) = 100
      const coi = Math.min(25, Math.max(0, Number(ppstCoiScore ?? currentDetails.finalRating?.ppstCoiScore ?? 25)));
      const ncoi = Math.min(15, Math.max(0, Number(ppstNcoiScore ?? currentDetails.finalRating?.ppstNcoiScore ?? 15)));
      overallTotalScore = parseFloat((edu + train + exp + perf + coi + ncoi).toFixed(2));
      hrmoBreakdown = {
        ...hrmoBreakdown,
        ppstCoiScore: coi,
        ppstNcoiScore: ncoi,
      };
    }

    const updatedDetails = {
      ...currentDetails,
      track: isNonTeaching ? 'NON_TEACHING' : 'TEACHING',
      stageStatus: currentDetails.manuallyPromoted ? (currentDetails.stageStatus || 'SELECTED_PENDING_DOCS') : 'FINAL_RANKED',
      finalRating: {
        track: isNonTeaching ? 'NON_TEACHING' : 'TEACHING',
        ...hrmoBreakdown,
        finalTotalScore: overallTotalScore,
        overallTotalScore,
        hrmoRemarks: remarks || 'Comparative Assessment deliberated and finalized by HRMPSB / HRMO',
        ratedByUserId: req.user?.userId,
        ratedAt: new Date().toISOString(),
      },
      totalScore: overallTotalScore,
      remarks: remarks || 'Meets DepEd Merit and Qualification Standards',
      forBackgroundInvestigation: forBackgroundInvestigation || 'YES',
      forAppointment: forAppointment || 'Recommended for Appointment',
      forProbation: forProbation || '6 months',
    };

    const updated = await prisma.promotionApplication.update({
      where: { id: appId },
      data: {
        status: currentDetails.manuallyPromoted ? 'APPROVED' : 'RANKED',
        scoreDetailsJson: updatedDetails,
      },
    });

    await computeCycleRankingInternal(cycleId);

    // Notify the applicant personnel that final deliberation rating has been completed
    const applicantUserId = app.personnel?.userId || (await prisma.personnel.findUnique({
      where: { id: app.personnelId },
      select: { userId: true },
    }))?.userId;

    if (applicantUserId) {
      await prisma.notification.create({
        data: {
          userId: applicantUserId,
          message: `HRMPSB Rating Finalized: Your comparative assessment score for "${app.promotionCycle.name}" has been deliberated and finalized (${overallTotalScore}/100 pts).`,
          type: 'INFO',
          relatedEntityId: cycleId,
          relatedEntityType: 'PromotionCycle',
        },
      });
      notifyUserNotifications([applicantUserId]);
    }

    notifyTransactionChange();

    sendSuccess(res, updated, 'Comparative Assessment Result (CAR) finalized successfully by HRMO.');
  } catch (err: any) {
    logger.error({ err: err }, 'Failed to submit final rating');
    sendError(res, 'Failed to finalize promotion rating.', 500);
  }
};

export const getCycleLeaderboard = async (req: Request, res: Response): Promise<void> => {
  if (req.user?.role === 'SYSTEM_ADMIN') {
    res.status(403).json({
      status: 'error',
      message: 'Access denied: System Administrator cannot access promotions. Promotion cycles and Comparative Assessment Results are managed by HRMO and AO officers.',
      code: 'FORBIDDEN',
    });
    return;
  }

  const cycleId = parseInt(req.params.id, 10);
  if (isNaN(cycleId)) { sendBadRequest(res, 'Invalid cycle ID format.'); return; }
  // Each row carries the applicant's full score details and Annex C checklist,
  // so the leaderboard is scoped exactly like the applications list.
  const scope = await getStationScope(req.user);
  const [cycle, applications] = await Promise.all([
    prisma.promotionCycle.findUnique({ where: { id: cycleId } }),
    prisma.promotionApplication.findMany({
      where: { AND: [{ promotionCycleId: cycleId }, reviewableApplications(scope)] },
      include: {
        personnel: {
          select: { id: true, firstName: true, lastName: true, employeeId: true, designation: true, address: true },
        },
      },
      orderBy: { finalRank: 'asc' },
    }),
  ]);

  // Fetch active or completed promotion transactions for candidates in this cycle
  const personnelIds = applications.map(a => a.personnelId);
  const promoTransactions = await prisma.transaction.findMany({
    where: {
      personnelId: { in: personnelIds },
      transactionType: { name: { contains: 'Promotion', mode: 'insensitive' } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const txMap = new Map<number, any>();
  for (const tx of promoTransactions) {
    if (!txMap.has(tx.id)) {
      txMap.set(tx.id, tx);
    }
  }

  const leaderboard = applications.map((a) => {
    const details = (a.scoreDetailsJson as Record<string, any>) || {};
    const initialRating = details.initialRating || null;
    const finalRating = details.finalRating || null;
    const hasAoRating = Boolean(initialRating && (initialRating.initialTotalScore !== undefined || initialRating.ratedAt));
    const hasHrmoRating = Boolean(finalRating && (finalRating.finalTotalScore !== undefined || finalRating.ratedAt));

    const assignedTxId = details.transactionId ? Number(details.transactionId) : null;
    const activeTx = assignedTxId ? (txMap.get(assignedTxId) || promoTransactions.find(t => t.id === assignedTxId)) : null;

    const isOfficiallyApproved = Boolean(details.appointmentApproved || (activeTx && activeTx.status === 'APPROVED'));
    const isSelectedForPromotion = Boolean(details.manuallyPromoted || (activeTx && activeTx.id === assignedTxId));
    
    let displayStatus = 'SUBMITTED';
    if (isOfficiallyApproved) {
      displayStatus = 'OFFICIALLY_PROMOTED';
    } else if (isSelectedForPromotion) {
      displayStatus = 'SELECTED_PENDING_DOCS';
    } else if (details.stageStatus) {
      displayStatus = details.stageStatus;
    } else if (hasHrmoRating) {
      displayStatus = 'FINAL_RANKED';
    } else if (hasAoRating) {
      displayStatus = 'INITIAL_RATED';
    } else {
      displayStatus = a.status || 'SUBMITTED';
    }

    const desig = a.personnel?.designation?.toLowerCase() || '';
    const cycleTrack = (cycle?.rulesConfigurationJson as any)?.track;
    const isNonTeaching = cycleTrack
      ? (cycleTrack === 'NON_TEACHING')
      : (details.track === 'NON_TEACHING' || desig.includes('administrative') || desig.includes('registrar') || desig.includes('officer') || desig.includes('assistant'));
    const track = isNonTeaching ? 'NON_TEACHING' : 'TEACHING';

    const initialScore = hasAoRating ? Number(initialRating.initialTotalScore || 0) : 0;
    const finalScore = hasHrmoRating ? Number(finalRating.finalTotalScore || 0) : 0;

    let overallTotal = 0;
    if (hasAoRating && hasHrmoRating) {
      overallTotal = parseFloat((initialScore + finalScore).toFixed(2));
    } else if (hasAoRating) {
      overallTotal = initialScore;
    } else if (hasHrmoRating) {
      overallTotal = finalScore;
    } else {
      overallTotal = 0;
    }

    const autoApplicantNo = details.applicantNumber || (a.personnel?.employeeId ? (a.personnel.employeeId.startsWith('APP-') ? a.personnel.employeeId : applicantNumberFor(a.id, a.createdAt)) : applicantNumberFor(a.id, a.createdAt));

    return {
      id: a.id,
      rank: a.finalRank || 1,
      personnelId: a.personnelId,
      employeeId: a.personnel?.employeeId || `EMP-${a.personnelId}`,
      applicantNumber: autoApplicantNo,
      applicantCode: autoApplicantNo,
      name: `${a.personnel?.firstName || ''} ${a.personnel?.lastName || ''}`.trim(),
      designation: a.personnel?.designation || 'Staff',
      station: (a.personnel as any)?.address || 'District Station',
      track,
      status: displayStatus,
      isPromoted: isOfficiallyApproved,
      isSelectedForPromotion,
      plantillaItemNumber: details.plantillaItemNumber || null,
      transactionId: activeTx?.id || null,
      transactionStatus: activeTx?.status || null,
      hasAoRating,
      hasHrmoRating,
      // AO criteria
      educationScore: hasAoRating ? Number(initialRating?.educationScore ?? 0) : 0,
      trainingScore: hasAoRating ? Number(initialRating?.trainingScore ?? 0) : 0,
      experienceScore: hasAoRating ? Number(initialRating?.experienceScore ?? 0) : 0,
      performanceScore: hasAoRating ? Number(initialRating?.performanceScore ?? 0) : 0,
      outstandingAccomplishmentsScore: hasAoRating ? Number(initialRating?.outstandingAccomplishmentsScore ?? 0) : 0,
      applicationOfEducationScore: hasAoRating ? Number(initialRating?.applicationOfEducationScore ?? 0) : 0,
      applicationOfLdScore: hasAoRating ? Number(initialRating?.applicationOfLdScore ?? 0) : 0,
      aoSubtotal: parseFloat(Number(initialScore).toFixed(2)),
      aoRemarks: initialRating?.aoRemarks || '',
      // HRMO criteria
      ppstCoiScore: hasHrmoRating ? Number(finalRating?.ppstCoiScore ?? 0) : 0,
      ppstNcoiScore: hasHrmoRating ? Number(finalRating?.ppstNcoiScore ?? 0) : 0,
      potentialScore: hasHrmoRating ? Number(finalRating?.potentialScore ?? 0) : 0,
      potentialWrittenScore: hasHrmoRating ? Number(finalRating?.potentialWrittenScore ?? 0) : 0,
      potentialBeiScore: hasHrmoRating ? Number(finalRating?.potentialBeiScore ?? 0) : 0,
      potentialSkillsScore: hasHrmoRating ? Number(finalRating?.potentialSkillsScore ?? 0) : 0,
      hrmoSubtotal: parseFloat(Number(finalScore).toFixed(2)),
      hrmoRemarks: finalRating?.hrmoRemarks || '',
      // CAR Master Results
      initialTotalScore: parseFloat(Number(initialScore).toFixed(2)),
      finalTotalScore: parseFloat(Number(finalScore).toFixed(2)),
      overallTotalScore: parseFloat(Number(overallTotal).toFixed(2)),
      totalScore: parseFloat(Number(overallTotal).toFixed(2)),
      remarks: details.remarks || (hasHrmoRating ? finalRating?.hrmoRemarks : (hasAoRating ? initialRating?.aoRemarks : 'Pending Evaluation')),
      forBackgroundInvestigation: details.forBackgroundInvestigation || 'YES',
      forAppointment: details.forAppointment || 'Recommended for Appointment',
      forProbation: details.forProbation || '6 months',
      initialDetails: initialRating,
      finalDetails: finalRating,
      scoreDetailsJson: details,
      updatedAt: a.updatedAt,
    };
  });

  sendSuccess(res, leaderboard);
};

export const selectPromotionCandidate = async (req: Request, res: Response): Promise<void> => {
  if (req.user?.role !== 'HRMO') {
    res.status(403).json({
      status: 'error',
      message: 'Access denied: System Administrator cannot create promotions. Only HR (HRMO) can select or approve candidates for promotion.',
      code: 'FORBIDDEN',
    });
    return;
  }

  const cycleId = parseInt(req.params.id, 10);
  const appId = parseInt(req.params.appId, 10);
  if (isNaN(cycleId) || isNaN(appId)) {
    sendBadRequest(res, 'Invalid cycle ID or application ID.');
    return;
  }
  const { isPromoted, remarks, plantillaItemNumber } = req.body;
  if (typeof isPromoted !== 'boolean') {
    sendBadRequest(res, 'isPromoted must be true or false.');
    return;
  }

  const app = await prisma.promotionApplication.findFirst({
    where: { id: appId, promotionCycleId: cycleId },
    include: {
      personnel: { include: { user: true } },
      promotionCycle: true,
    },
  });

  if (!app) {
    sendNotFound(res, 'Promotion application not found for this cycle.');
    return;
  }

  // Selecting a candidate is the final act of the cycle, so it must follow the
  // whole sequence. Deselecting stays open — undoing a mistake should never be
  // blocked by the gate that was missing when the mistake was made.
  if (isPromoted !== false) {
    const selectionBlocked = selectionBlockReason(app.scoreDetailsJson);
    if (selectionBlocked) {
      sendBadRequest(res, selectionBlocked, 'PROMOTION_STAGE_INCOMPLETE');
      return;
    }
  }

  const currentDetails = (app.scoreDetailsJson as Record<string, any>) || {};
  const newStatus = isPromoted ? 'APPROVED' : 'RANKED';

  // Determine plantilla to assign:
  // 1. Explicitly provided in req.body
  // 2. Previously assigned in currentDetails
  // 3. First available unassigned plantilla from cycle rules (plantillaItemNumbers / plantillaItemNumber)
  let assignedPlantilla: string | null = null;
  if (isPromoted) {
    if (plantillaItemNumber) {
      assignedPlantilla = String(plantillaItemNumber).trim();
    } else if (currentDetails.plantillaItemNumber) {
      assignedPlantilla = currentDetails.plantillaItemNumber;
    } else {
      const cycleRules = (app.promotionCycle.rulesConfigurationJson as any) || {};
      const configuredPlantillas: string[] = cycleRules.plantillaItemNumbers || (cycleRules.plantillaItemNumber ? [cycleRules.plantillaItemNumber] : []);
      if (configuredPlantillas.length > 0) {
        const existingApps = await prisma.promotionApplication.findMany({
          where: {
            promotionCycleId: cycleId,
            id: { not: appId },
          },
          select: { scoreDetailsJson: true },
        });
        const usedPlantillas = new Set(
          existingApps
            .map(a => (a.scoreDetailsJson as any)?.plantillaItemNumber)
            .filter(Boolean)
        );
        const freePlantilla = configuredPlantillas.find(p => !usedPlantillas.has(p));
        assignedPlantilla = freePlantilla || null;
      }
    }
  }

  const updatedDetails = {
    ...currentDetails,
    manuallyPromoted: Boolean(isPromoted),
    stageStatus: isPromoted ? 'SELECTED_PENDING_DOCS' : 'RANKED',
    promotedAt: isPromoted ? new Date().toISOString() : null,
    promotedByUserId: isPromoted ? req.user?.userId : null,
    promotionRemarks: remarks || '',
    plantillaItemNumber: isPromoted ? assignedPlantilla : null,
  };

  const targetPos = getCycleTargetPosition(app.promotionCycle);
  if (isPromoted && !targetPos) {
    sendBadRequest(res, 'Configure the target position before selecting a candidate.');
    return;
  }
  const isTeacherOne = /^(teacher (?:i|1))$/.test(normalizePositionTitle(targetPos));
  if (!isPromoted && currentDetails.appointmentApproved) {
    sendBadRequest(res, 'An officially approved appointment cannot be removed from candidate selection.', 'APPOINTMENT_ALREADY_APPROVED');
    return;
  }
  if (isPromoted && assignedPlantilla) {
    const plantillaItem = await prisma.plantillaItem.findUnique({ where: { itemNumber: assignedPlantilla } });
    if (!plantillaItem) { sendNotFound(res, `Plantilla item "${assignedPlantilla}" was not found.`); return; }
    const holder = await prisma.personnel.findFirst({ where: { plantillaItemId: plantillaItem.id, id: { not: app.personnelId } }, select: { employeeId: true } });
    if (holder) { sendBadRequest(res, `Selected plantilla is already occupied by ${holder.employeeId}.`, 'PLANTILLA_ALREADY_OCCUPIED'); return; }
  }

  let updated: any;
  let notificationUserId: number | null = null;
  await prisma.$transaction(async db => {
  // Serialize selection within a cycle and across cycles for the same person.
  await db.$queryRaw`SELECT id FROM promotion_cycles WHERE id = ${cycleId} FOR UPDATE`;
  await db.$queryRaw`SELECT id FROM personnel WHERE id = ${app.personnelId} FOR UPDATE`;
  await db.$queryRaw`SELECT id FROM promotion_applications WHERE id = ${appId} FOR UPDATE`;
  const currentApp = await db.promotionApplication.findUnique({ where: { id: appId }, include: { promotionCycle: true } });
  if (!currentApp || currentApp.updatedAt.getTime() !== app.updatedAt.getTime() ||
      currentApp.promotionCycle.updatedAt.getTime() !== app.promotionCycle.updatedAt.getTime()) {
    throw workflowConflict('The candidate or cycle changed. Refresh before selecting again.');
  }
  if (isPromoted && currentApp.promotionCycle.status === 'CANCELLED') throw workflowConflict('This promotion cycle was cancelled.');
  if (isPromoted && currentDetails.appointmentApproved) throw workflowConflict('This appointment is already approved.');
  if (isPromoted) {
    const rules = (currentApp.promotionCycle.rulesConfigurationJson as any) || {};
    const configured: string[] = rules.plantillaItemNumbers || (rules.plantillaItemNumber ? [rules.plantillaItemNumber] : []);
    const vacancies = Number(rules.vacantPositions || configured.length || 1);
    const selectedCount = await db.promotionApplication.count({ where: { promotionCycleId: cycleId, id: { not: appId }, status: 'APPROVED' } });
    if (!Number.isSafeInteger(vacancies) || vacancies < 1 || selectedCount >= vacancies) {
      throw workflowConflict('All available appointment slots have been selected.');
    }
    if (configured.length && (!assignedPlantilla || !configured.includes(assignedPlantilla))) {
      throw workflowConflict('No available configured plantilla slot. Refresh the candidate selection.');
    }
    if (assignedPlantilla) {
      // The item lock also prevents two different cycles from reserving the same item.
      await db.$queryRaw`SELECT id FROM plantilla_items WHERE item_number = ${assignedPlantilla} FOR UPDATE`;
      const holder = await db.personnel.findFirst({ where: { plantillaItem: { itemNumber: assignedPlantilla }, id: { not: app.personnelId } } });
      const reservation = await db.promotionApplication.findFirst({ where: {
        id: { not: appId }, status: 'APPROVED', promotionCycle: { status: { not: 'CANCELLED' } },
        scoreDetailsJson: { path: ['plantillaItemNumber'], equals: assignedPlantilla },
      } });
      if (holder || reservation) throw workflowConflict('This plantilla item is occupied or reserved by another selected candidate.');
    }
  }
  if (isPromoted) {
    // 1. Find or create the appropriate TransactionType (Newly Hired Appointment vs Promotion)
    const targetTxTypeName = isTeacherOne ? 'Newly Hired Appointment' : 'Promotion';

    let txType = await db.transactionType.findFirst({
      where: {
        name: { contains: isTeacherOne ? 'Newly Hired' : 'Promotion', mode: 'insensitive' },
      },
    });

    if (!txType) {
      txType = await db.transactionType.create({
        data: {
          name: targetTxTypeName,
          description: isTeacherOne
            ? 'Newly Hired Appointment Document Verification & Onboarding'
            : 'Promotion Appointment Document Verification & HR Approval',
        },
      });
    }

    // Ensure mandatory appointment requirement templates exist
    const defaultRequirements = isTeacherOne
      ? [
          { name: 'Personal Data Sheet (PDS)', description: 'CS Form No. 212 — fully accomplished and signed', isMandatory: true, expectedDataType: 'PDF' },
          { name: 'Transcript of Records (TOR)', description: 'Authenticated official TOR from institution', isMandatory: true, expectedDataType: 'PDF' },
          { name: 'Photocopy of PRC License', description: 'Valid and current PRC Professional Identification Card', isMandatory: true, expectedDataType: 'PDF' },
          { name: 'Medical Certificate', description: 'Current medical certificate from a licensed physician (CS Form 211)', isMandatory: true, expectedDataType: 'PDF' },
          { name: 'NBI Clearance', description: 'Valid NBI Clearance (not older than 6 months)', isMandatory: true, expectedDataType: 'PDF' },
          { name: 'Birth Certificate (PSA)', description: 'PSA-authenticated birth certificate', isMandatory: true, expectedDataType: 'PDF' },
          { name: 'Omnibus Certification', description: 'Signed omnibus certification of authenticity and veracity', isMandatory: true, expectedDataType: 'PDF' },
          { name: 'Oath of Office (CS Form No. 32)', description: 'Duly subscribed and sworn Oath of Office', isMandatory: true, expectedDataType: 'PDF' },
          { name: 'Position Description Form (PDF / DBM-CSC Form No. 1)', description: 'Duly accomplished PDF detailing duties & responsibilities', isMandatory: true, expectedDataType: 'PDF' },
        ]
      : [
          { name: 'CS Form 212 - Personal Data Sheet (PDS)', description: 'Revised 2017 PDS with Work Experience Sheet', isMandatory: true, expectedDataType: 'PDF' },
          { name: 'Oath of Office (CS Form No. 32)', description: 'Duly subscribed and sworn Oath of Office', isMandatory: true, expectedDataType: 'PDF' },
          { name: 'Position Description Form (PDF / DBM-CSC Form No. 1)', description: 'Duly accomplished PDF detailing duties & responsibilities', isMandatory: true, expectedDataType: 'PDF' },
          { name: 'Plantilla Allocation / Appointment Form', description: 'KSS Form No. 3 - Original Copy of Appointment', isMandatory: true, expectedDataType: 'PDF' },
          { name: 'Medical Certificate (CS Form No. 211)', description: 'Issued by licensed government physician with blood work & X-ray', isMandatory: false, expectedDataType: 'PDF' },
        ];

    // Two statements for the whole checklist; this runs inside an open transaction,
    // so a per-item find/create round trip would hold it for the duration.
    const existingRequirements = await db.requirementTemplate.findMany({
      where: { transactionTypeId: txType.id, name: { in: defaultRequirements.map(r => r.name) } },
      select: { name: true },
    });
    const existingNames = new Set(existingRequirements.map(r => r.name));
    const missingRequirements = defaultRequirements.filter(r => !existingNames.has(r.name));

    if (missingRequirements.length > 0) {
      await db.requirementTemplate.createMany({
        data: missingRequirements.map(reqItem => ({
          transactionTypeId: txType.id,
          name: reqItem.name,
          description: reqItem.description,
          isMandatory: reqItem.isMandatory,
          expectedDataType: reqItem.expectedDataType,
        })),
      });
    }

    // Only this application's explicit link may be reused, never another cycle's transaction.
    const linkedId = Number(currentDetails.transactionId);
    let activeTx = Number.isSafeInteger(linkedId) && linkedId > 0
      ? await db.transaction.findFirst({ where: {
          id: linkedId, personnelId: app.personnelId, transactionTypeId: txType.id,
          status: { in: ['DRAFT', 'PENDING_VALIDATION', 'FOR_APPROVAL', 'DEFICIENCY', 'ESCALATED'] },
        } })
      : null;

    if (!activeTx) {
      activeTx = await db.transaction.create({
        data: {
          personnelId: app.personnelId,
          transactionTypeId: txType.id,
          status: 'DRAFT',
          remarks: `${isTeacherOne ? 'Newly Hired Appointment' : 'Promotion Appointment'} Document Verification active for position "${targetPos}" (${app.promotionCycle.name})${assignedPlantilla ? ` • Assigned Plantilla: ${assignedPlantilla}` : ''}. Final appointment subject to HR document validation.`,
          submissionDate: new Date(),
        },
      });
    }

    // Ensure User account is active so candidate can log in and submit requirements
    if (app.personnel?.userId) {
      await db.user.updateMany({
        where: { id: app.personnel.userId, accountStatus: 'PENDING' },
        data: { accountStatus: 'ACTIVE' },
      });
    }

    // Update scoreDetailsJson with transactionId & appointment metadata
    updated = await db.promotionApplication.update({
      where: { id: appId },
      data: {
        status: newStatus as any,
        scoreDetailsJson: {
          ...updatedDetails,
          transactionId: activeTx.id,
          isNewlyHiredAppointment: isTeacherOne,
        },
      },
    });

    // 3. Send notification to candidate personnel
    if (app.personnel.user) {
      const notifMsg = isTeacherOne
        ? `Congratulations! You have been selected for Newly Hired Appointment as ${targetPos} under ${app.promotionCycle.name}${assignedPlantilla ? ` (Plantilla: ${assignedPlantilla})` : ''}. Your appointment transaction #${activeTx.id} is now active. Please submit your required onboarding compliance documents on your portal for HR validation.`
        : `Congratulations! You have been selected for Promotion to ${targetPos} under ${app.promotionCycle.name}. Your Promotion Appointment transaction #${activeTx.id} is now active. Please submit your required appointment documents for HR validation and approval to confirm your promotion.`;

      await db.notification.create({
        data: {
          userId: app.personnel.user.id,
          message: notifMsg,
          type: 'SUCCESS',
          relatedEntityId: activeTx.id,
          relatedEntityType: 'Transaction',
        },
      });
      notificationUserId = app.personnel.user.id;
    }
  } else {
    const linkedTransactionId = Number(currentDetails.transactionId);
    if (Number.isInteger(linkedTransactionId) && linkedTransactionId > 0) {
      await lockTransaction(db, linkedTransactionId);
      const linked = await db.transaction.findFirst({ where: { id: linkedTransactionId, personnelId: app.personnelId } });
      if (!linked || !['DRAFT', 'DEFICIENCY', 'ABANDONED'].includes(linked.status)) {
        throw workflowConflict('The appointment is already under review or completed. Return it for correction before withdrawing selection.');
      }
      await db.transaction.updateMany({
        where: { id: linkedTransactionId, personnelId: app.personnelId, status: { in: ['DRAFT', 'DEFICIENCY'] } },
        data: { status: 'ABANDONED', remarks: 'Candidate selection was withdrawn before appointment approval.' },
      });
    }
    if (isTeacherOne && app.personnel?.userId && app.personnel.designation === 'External Applicant') {
      await db.user.update({
        where: { id: app.personnel.userId },
        data: { accountStatus: 'PENDING' },
      });
    }
    updated = await db.promotionApplication.update({ where: { id: appId }, data: { status: newStatus as any, scoreDetailsJson: updatedDetails } });

    if (app.personnel?.user) {
      await db.notification.create({
        data: {
          userId: app.personnel.user.id,
          message: `Candidate Selection Withdrawn: Your candidate selection for promotion to ${targetPos} under "${app.promotionCycle.name}" has been removed/withdrawn by HRMO.`,
          type: 'WARNING',
          relatedEntityId: cycleId,
          relatedEntityType: 'PromotionCycle',
        },
      });
      notificationUserId = app.personnel.user.id;
    }
  }
  }, { timeout: 15000 });

  if (notificationUserId) notifyUserNotifications([notificationUserId]);
  if (isPromoted && app.personnel?.user?.email) {
    const transactionId = Number((updated.scoreDetailsJson as any)?.transactionId);
    await queueTransactionalEmail(`promotion-application:${app.id}:requirements-assigned:${transactionId}`, {
      recipientEmail: app.personnel.user.email,
      recipientName: `${app.personnel.firstName} ${app.personnel.lastName}`,
      subject: isTeacherOne ? 'New appointment requirements assigned' : 'Promotion requirements assigned',
      heading: isTeacherOne ? 'You were selected for appointment' : 'You were selected for promotion',
      message: `You were selected for ${targetPos} under ${app.promotionCycle.name}. Your required appointment documents are now available in Digital 201 for submission and validation.`,
      reference: Number.isInteger(transactionId) ? `TRX-${transactionId}` : app.promotionCycle.name,
      actionLabel: 'Open assigned requirements',
      actionUrl: Number.isInteger(transactionId)
        ? `${config.clientUrl}/personnel/checklist?txId=${transactionId}`
        : `${config.clientUrl}/personnel/home`,
    });
    void processWorkflowOutbox();
  }
  notifyTransactionChange();
  sendSuccess(
    res,
    updated,
    isPromoted
      ? (isTeacherOne
          ? 'Applicant selected for appointment! Newly Hired Appointment transaction created. Applicant notified to submit onboarding documents.'
          : 'Candidate selected for promotion! Active Promotion Appointment transaction created. Teacher notified to submit documents for HR approval.')
      : 'Selection removed.'
  );
};

export const submitManualApplication = async (req: Request, res: Response): Promise<void> => {
  const cycleId = parseInt(req.params.id, 10);
  if (isNaN(cycleId)) { sendBadRequest(res, 'Invalid cycle ID format.'); return; }
  const {
    personnelId,
    employeeId,
    applicantId,
    // Complete PDS Form 212 fields for external applicants
    firstName,
    middleName,
    lastName,
    suffix,
    birthDate,
    gender,
    civilStatus,
    contactNumber,
    address,
    email,
    password,
    // Scores and remarks
    performanceScore,
    experienceScore,
    educationScore,
    trainingScore,
    seniorityScore,
    remarks,
  } = req.body;

  const cycle = await prisma.promotionCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) {
    sendNotFound(res, 'Promotion cycle not found.');
    return;
  }

  const cycleRules = (cycle.rulesConfigurationJson as Record<string, any>) || {};
  const targetPos = cycleRules.targetPosition || 'Teacher I';
  let schoolStation = cycleRules.schoolStation || cycleRules.designatedSchool || null;
  let district = cycleRules.designatedDistrict || null;
  const scope = await getStationScope(req.user);
  const stationRefusal = 'You can only register applicants for your assigned station.';

  const targetCode = applicantId || employeeId;
  let targetPersonnelId = personnelId ? parseInt(personnelId, 10) : undefined;
  let lookupMissMessage = 'Selected personnel record not found.';

  // Case 1: Full PDS registration for newly registered external applicant (e.g. Teacher I Newly Hired)
  if (!targetPersonnelId && firstName && lastName) {
    const cleanFirstName = String(firstName).trim();
    const cleanLastName = String(lastName).trim();
    if (!email || !password || !birthDate || !['MALE', 'FEMALE', 'OTHER'].includes(String(gender).toUpperCase()) || !['SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED'].includes(String(civilStatus).toUpperCase())) {
      sendBadRequest(res, 'Email, temporary password, birth date, gender, and civil status are required for a new external applicant.');
      return;
    }
    const parsedBirthDate = new Date(birthDate);
    if (isNaN(parsedBirthDate.getTime()) || parsedBirthDate >= new Date()) { sendBadRequest(res, 'Enter a valid birth date.'); return; }
    const passwordCheck = validatePasswordComplexity(String(password));
    if (!passwordCheck.valid) { sendBadRequest(res, passwordCheck.message || 'Temporary password does not meet security requirements.'); return; }
    const cleanEmail = String(email).trim().toLowerCase();

    let existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: { personnel: true, role: { select: { name: true } } },
    });

    if (existingUser && existingUser.personnel) {
      targetPersonnelId = existingUser.personnel.id;
    } else {
      // A new applicant record takes a station, and the station decides which
      // AO II owns it. An AO II registers applicants into their own station
      // only -- never into a cycle designated for another -- and never attaches
      // a record to an account that is not personnel. Decided before any write.
      if (scope.isScoped) {
        const attachesToNonPersonnel = Boolean(existingUser) && !isPersonnelRole(existingUser?.role?.name);
        if (scope.kind !== 'STATION' || !scope.school || attachesToNonPersonnel || (schoolStation && !sameStation(schoolStation, scope.school))) {
          sendForbidden(res, stationRefusal);
          return;
        }
        schoolStation = scope.school;
        district = scope.district || district;
      }
      const isTeaching = targetPos.toLowerCase().includes('teacher') || targetPos.toLowerCase().includes('principal');
      const roleName = isTeaching ? 'TEACHING_PERSONNEL' : 'NON_TEACHING_PERSONNEL';
      const roleRecord = await prisma.role.findFirst({ where: { name: roleName as any } });
      const created = await prisma.$transaction(async (tx) => {
        let assignedUserId: number;
        if (existingUser) {
          assignedUserId = existingUser.id;
        } else {
          // Candidate applicants are not given active portal accounts yet; they receive accounts only if selected/recommended for the item
          const passwordHash = await hashPassword(String(password));
          const newUser = await tx.user.create({
            data: {
              email: cleanEmail,
              passwordHash,
              roleId: roleRecord ? roleRecord.id : 4,
              accountStatus: 'PENDING',
            },
          });
          assignedUserId = newUser.id;
        }

        const generatedEmployeeId = await generateEmployeeNumber(tx);
        const finalAddress = address && String(address).trim()
          ? String(address).trim()
          : (schoolStation ? `${schoolStation}${district ? `, ${district}` : ''}, SDO Koronadal City` : 'SDO Koronadal City');

        const newPersonnel = await tx.personnel.create({
          data: {
            userId: assignedUserId,
            employeeId: generatedEmployeeId,
            firstName: cleanFirstName,
            lastName: cleanLastName,
            middleName: middleName ? String(middleName).trim() : null,
            suffix: suffix ? String(suffix).trim() : null,
            designation: 'External Applicant',
            birthDate: parsedBirthDate,
            gender: String(gender).toUpperCase() as any,
            civilStatus: String(civilStatus).toUpperCase() as any,
            contactNumber: contactNumber ? String(contactNumber).trim() : null,
            address: finalAddress,
            school: schoolStation ? String(schoolStation).trim() : null,
            district: district ? String(district).trim() : null,
            status: 'INACTIVE',
            dateHired: null,
            profileComplete: false,
          },
        });

        return newPersonnel;
      });

      targetPersonnelId = created.id;
    }
  }

  // Case 2: Applicant lookup by targetCode (employeeId / applicantId)
  if (!targetPersonnelId && targetCode) {
    let found = await prisma.personnel.findFirst({
      where: {
        OR: [
          { employeeId: targetCode },
          ...(isNaN(parseInt(targetCode, 10)) ? [] : [{ id: parseInt(targetCode, 10) }]),
        ],
      },
    });

    lookupMissMessage = `No personnel record matches applicant code "${targetCode}".`;
    if (!found) { sendNotFound(res, lookupMissMessage); return; }
    targetPersonnelId = found.id;
  }

  if (!targetPersonnelId) {
    sendBadRequest(res, 'Select an existing personnel record or provide complete applicant identity details.');
    return;
  }

  const targetPersonnel = await prisma.personnel.findUnique({
    where: { id: targetPersonnelId },
    select: {
      id: true,
      designation: true,
      school: true,
      plantillaItem: { select: { positionTitle: true } },
    },
  });
  if (!targetPersonnel) { sendNotFound(res, lookupMissMessage); return; }

  // An AO II registers only their own station's personnel. Anyone else reads as
  // the same miss as an unknown code, so this cannot be used to find people.
  if (!(await personnelInScope(scope, targetPersonnel.id, 'review'))) {
    await denyOutOfScope(req, res, { entityType: 'Personnel', entityId: targetPersonnel.id, action: 'PROMOTION_MANUAL_APPLICATION' }, lookupMissMessage);
    return;
  }

  const candidateCurrentPos = targetPersonnel.designation || targetPersonnel.plantillaItem?.positionTitle || '';
  if (candidateCurrentPos && candidateCurrentPos !== 'External Applicant') {
    const eligibility = checkPromotionEligibility(candidateCurrentPos, targetPos, cycle.type);
    if (!eligibility.isEligible) {
      sendBadRequest(
        res,
        eligibility.reason || `Applicant is not eligible to apply for "${targetPos}".`,
        'PROMOTION_INELIGIBLE'
      );
      return;
    }
  } else if (normalizePositionTitle(targetPersonnel.designation) === normalizePositionTitle(targetPos)) {
    sendBadRequest(res, `Applicant already holds the target position "${targetPos}".`, 'SAME_POSITION_APPLICATION');
    return;
  }

  const rules = cycleRules;
  const maxApplicants = Number(rules.maxApplicants) || 0;

  const existing = await prisma.promotionApplication.findUnique({
    where: { personnelId_promotionCycleId: { personnelId: targetPersonnelId, promotionCycleId: cycleId } },
  });

  if (maxApplicants > 0 && !existing) {
    const currentCount = await prisma.promotionApplication.count({
      where: { promotionCycleId: cycleId },
    });
    if (currentCount >= maxApplicants) {
      sendBadRequest(res, `Maximum applicant capacity reached! This promotion cycle allows a maximum of ${maxApplicants} applicants.`);
      return;
    }
  }

  // Kept on re-submission; a new application is numbered from its id below.
  const existingNumber = (existing?.scoreDetailsJson as Record<string, any> | null)?.applicantNumber as string | undefined;
  let autoApplicantNo = existingNumber || '';

  const scoreDetailsJson: Record<string, any> = {
    remarks: remarks || 'Complete PDS Application Registered - Pending Initial Rating',
    submittedByUserId: req.user?.userId,
    submittedAt: new Date().toISOString(),
  };

  let application;
  if (existing) {
    application = await prisma.promotionApplication.update({
      where: { id: existing.id },
      data: {
        status: 'SUBMITTED',
        scoreDetailsJson: {
          ...((existing.scoreDetailsJson as Record<string, any>) || {}),
          ...scoreDetailsJson,
        },
      },
    });
  } else {
    application = await prisma.$transaction(async tx => {
      const created = await tx.promotionApplication.create({
        data: { personnelId: targetPersonnelId, promotionCycleId: cycleId, status: 'SUBMITTED', scoreDetailsJson },
      });
      const number = applicantNumberFor(created.id, created.createdAt);
      return tx.promotionApplication.update({
        where: { id: created.id },
        data: { applicantNumber: number, scoreDetailsJson: { ...scoreDetailsJson, applicantNumber: number } },
      });
    });
    autoApplicantNo = application.applicantNumber || autoApplicantNo;
  }

  // Auto-rank applicants immediately upon application form submission
  await computeCycleRankingInternal(cycleId);

  // HRMO and the applicant's own station officers; the message names the
  // applicant, so no other station's AO II may receive it.
  const reviewerIds = await promotionReviewerIds(targetPersonnel.school);
  if (reviewerIds.length > 0) {
    const applicant = await prisma.personnel.findUnique({
      where: { id: targetPersonnelId },
      select: { firstName: true, lastName: true, employeeId: true },
    });
    const applicantName = applicant ? `${applicant.firstName} ${applicant.lastName}`.trim() : 'Candidate Applicant';
    const empId = applicant?.employeeId || autoApplicantNo;

    await prisma.notification.createMany({
      data: reviewerIds.map(userId => ({
        userId,
        message: `New Promotion Application Received: ${applicantName} (${empId}) registered for ${cycle.name}.`,
        type: 'INFO',
        relatedEntityId: application.id,
        relatedEntityType: 'PromotionApplication',
      })),
    });
    notifyUserNotifications(reviewerIds);
  }

  notifyTransactionChange();
  sendCreated(res, application, 'Application form submitted and applicants automatically ranked.');
};

export const applyForPromotion = async (req: Request, res: Response): Promise<void> => {
  const cycleId = parseInt(req.params.id, 10);
  if (isNaN(cycleId)) { sendBadRequest(res, 'Invalid cycle ID format.'); return; }
  if (!req.user?.personnelId) { sendBadRequest(res, 'No personnel profile linked.'); return; }

  const cycle = await prisma.promotionCycle.findUnique({ where: { id: cycleId } });
  if (!cycle || cycle.status !== 'ACTIVE') {
    if (cycle && cycle.status === 'CANCELLED') {
      sendBadRequest(res, 'This promotion cycle has been cancelled or discontinued and is no longer accepting applications.', 'CYCLE_DISCONTINUED');
      return;
    }
    sendBadRequest(res, 'Promotion cycle is not active.', 'CYCLE_NOT_ACTIVE');
    return;
  }

  const personnel = await prisma.personnel.findUnique({
    where: { id: req.user.personnelId },
    select: { designation: true, plantillaItem: { select: { positionTitle: true } } },
  });
  if (!personnel) {
    sendBadRequest(res, 'Personnel profile not found.', 'PERSONNEL_NOT_FOUND');
    return;
  }

  const currentPosition = personnel.designation || personnel.plantillaItem?.positionTitle || '';
  const targetPosition = getCycleTargetPosition(cycle);

  const eligibility = checkPromotionEligibility(currentPosition, targetPosition, cycle.type);
  if (!eligibility.isEligible) {
    sendBadRequest(
      res,
      eligibility.reason || 'You are not eligible to apply for this promotion cycle.',
      'PROMOTION_INELIGIBLE'
    );
    return;
  }

  const checklistData = req.body?.checklist || null;
  const appliedVia = req.body?.appliedVia || 'WEB_PORTAL';

  // Server-side validation of Annex C requirements and referenced documents
  if (checklistData && Array.isArray(checklistData.items)) {
    const validCodes = new Set(ANNEX_C_REQUIREMENTS.map(r => r.code));
    for (const item of checklistData.items) {
      if (!item.code || !validCodes.has(String(item.code))) {
        sendBadRequest(res, `Unknown requirement code: "${item.code}".`, 'INVALID_REQUIREMENT_CODE');
        return;
      }
    }

    const itemsByCode = new Map<string, any>(checklistData.items.map((it: any) => [String(it.code), it]));
    for (const mCode of MANDATORY_ANNEX_C_CODES) {
      const item = itemsByCode.get(mCode);
      const hasAttachment = Boolean(item && (item.submitted || item.isSubmitted || item.personnelDocumentId || item.existingDocumentId));
      if (!hasAttachment) {
        sendBadRequest(res, `Mandatory Annex C requirement (${mCode.toUpperCase()}) is missing an attached document.`, 'MANDATORY_REQUIREMENT_MISSING');
        return;
      }
    }

    const existingForCheck = await prisma.promotionApplication.findUnique({
      where: { personnelId_promotionCycleId: { personnelId: req.user.personnelId, promotionCycleId: cycleId } },
    });

    const snapshottedItems: any[] = [];
    const seenCodes = new Set<string>();
    for (const item of checklistData.items) {
      const codeStr = String(item.code || '');
      if (seenCodes.has(codeStr)) continue;
      seenCodes.add(codeStr);

      const rawDocId = item.personnelDocumentId ?? item.existingDocumentId;
      const annexDef = ANNEX_C_REQUIREMENTS.find(r => r.code === item.code);
      if (rawDocId !== undefined && rawDocId !== null && String(rawDocId).trim() !== '') {
        const numDocId = Number(rawDocId);
        if (!Number.isInteger(numDocId) || numDocId <= 0) {
          sendBadRequest(res, `Invalid document ID format: ${rawDocId}`, 'INVALID_DOCUMENT_ID');
          return;
        }
        const docRecord = await prisma.personnelFile.findUnique({
          where: { id: numDocId },
        });
        if (!docRecord) {
          sendBadRequest(res, `Referenced personnel document (ID ${numDocId}) not found.`, 'DOCUMENT_NOT_FOUND');
          return;
        }
        if (docRecord.personnelId !== req.user.personnelId) {
          sendForbidden(res, `Access denied: Document "${docRecord.documentTypeName}" does not belong to your personnel profile.`);
          return;
        }
        if (!docRecord.storagePath) {
          sendBadRequest(res, `Document "${docRecord.documentTypeName}" has no file uploaded. A document placeholder cannot be attached.`, 'PLACEHOLDER_CANNOT_ATTACH');
          return;
        }
        if (docRecord.deletedAt) {
          const prevItems = (existingForCheck?.scoreDetailsJson as any)?.annexCChecklist?.items;
          const isHistoricalRef = Array.isArray(prevItems) && prevItems.some((pi: any) => pi.personnelDocumentId === numDocId || pi.existingDocumentId === numDocId);
          if (!isHistoricalRef) {
            sendBadRequest(res, `Document "${docRecord.documentTypeName}" has been archived or deleted and cannot be newly attached.`, 'DOCUMENT_ARCHIVED');
            return;
          }
        }

        snapshottedItems.push({
          code: item.code,
          title: item.title || annexDef?.title || docRecord.documentTypeName,
          description: item.description || annexDef?.description || '',
          isMandatory: annexDef?.isMandatory ?? Boolean(item.isMandatory),
          submitted: true,
          isSubmitted: true,
          documentName: docRecord.originalFileName || docRecord.documentTypeName,
          fileName: docRecord.originalFileName || docRecord.documentTypeName,
          personnelDocumentId: docRecord.id,
          existingDocumentId: docRecord.id,
          storagePath: docRecord.storagePath,
          fileSize: docRecord.fileSize,
          mimeType: docRecord.mimeType,
          submittedAt: item.submittedAt || new Date().toISOString(),
          remarks: item.remarks || '',
          verificationStatus: item.verificationStatus || 'PENDING',
        });
      } else {
        snapshottedItems.push({
          code: item.code,
          title: item.title || annexDef?.title || '',
          description: item.description || annexDef?.description || '',
          isMandatory: annexDef?.isMandatory ?? Boolean(item.isMandatory),
          submitted: false,
          isSubmitted: false,
          documentName: null,
          fileName: null,
          personnelDocumentId: null,
          existingDocumentId: null,
          remarks: item.remarks || '',
        });
      }
    }
    checklistData.items = snapshottedItems;
  }

  const existing = await prisma.promotionApplication.findUnique({
    where: { personnelId_promotionCycleId: { personnelId: req.user.personnelId, promotionCycleId: cycleId } },
  });
  if (existing) {
    if (checklistData && existing.status === 'SUBMITTED') {
      const currentDetails = (existing.scoreDetailsJson as Record<string, any>) || {};
      const updatedApp = await prisma.promotionApplication.update({
        where: { id: existing.id },
        data: {
          scoreDetailsJson: {
            ...currentDetails,
            annexCChecklist: checklistData,
            checklistUpdatedAt: new Date().toISOString(),
          },
        },
      });
      notifyTransactionChange();
      sendSuccess(res, updatedApp, 'Annex C requirements checklist submitted successfully.');
      return;
    }
    if (existing.status === 'SUBMITTED') {
      sendSuccess(res, existing, 'Application already submitted for this promotion cycle.');
      return;
    }
    sendBadRequest(res, 'You have already applied for this promotion cycle.', 'ALREADY_APPLIED');
    return;
  }

  const cycleRules = (cycle.rulesConfigurationJson as any) || {};
  const maxCapacity = Number(cycleRules.maxApplicants) || 10;

  let application;
  try {
    application = await prisma.$transaction(async tx => {
      const appCount = await tx.promotionApplication.count({ where: { promotionCycleId: cycleId } });
      if (appCount >= maxCapacity) {
        throw new Error('CAPACITY_REACHED');
      }
      // The number is the server's, from the new row's id; a browser-sent code is ignored.
      const details = { appliedVia, annexCChecklist: checklistData, submittedAt: new Date().toISOString() };
      const created = await tx.promotionApplication.create({
        data: {
          personnelId: req.user!.personnelId!,
          promotionCycleId: cycleId,
          status: 'SUBMITTED',
          applicationDate: new Date(),
          scoreDetailsJson: details,
        },
      });
      const number = applicantNumberFor(created.id, created.applicationDate ?? created.createdAt);
      if (checklistData && typeof checklistData === 'object') (details.annexCChecklist as any) = { ...checklistData, applicationCode: number };
      return tx.promotionApplication.update({
        where: { id: created.id },
        data: { applicantNumber: number, scoreDetailsJson: { ...details, applicantNumber: number } },
      });
    });
  } catch (err: any) {
    if (err.message === 'CAPACITY_REACHED') {
      sendBadRequest(res, `This promotion cycle has reached its maximum applicant capacity (${maxCapacity}).`, 'CAPACITY_REACHED');
      return;
    }
    if (err.code === 'P2002') {
      const existingAfterRace = await prisma.promotionApplication.findUnique({
        where: { personnelId_promotionCycleId: { personnelId: req.user!.personnelId!, promotionCycleId: cycleId } },
      });
      if (existingAfterRace) {
        sendSuccess(res, existingAfterRace, 'Promotion application submitted successfully.');
        return;
      }
    }
    throw err;
  }

  // HRMO and the applicant's own station officers; the message names the
  // applicant, so no other station's AO II may receive it.
  const applicantPersonnel = await prisma.personnel.findUnique({
    where: { id: req.user.personnelId },
    select: { firstName: true, lastName: true, employeeId: true, school: true },
  });
  const reviewerIds = await promotionReviewerIds(applicantPersonnel?.school);
  if (reviewerIds.length > 0) {
    const applicantName = applicantPersonnel ? `${applicantPersonnel.firstName} ${applicantPersonnel.lastName}`.trim() : 'Personnel Applicant';
    const empId = applicantPersonnel?.employeeId || `EMP-${req.user.personnelId}`;

    await prisma.notification.createMany({
      data: reviewerIds.map(userId => ({
        userId,
        message: `New Promotion Application Received: ${applicantName} (${empId}) applied for ${cycle.name}.`,
        type: 'INFO',
        relatedEntityId: application.id,
        relatedEntityType: 'PromotionApplication',
      })),
    });
    notifyUserNotifications(reviewerIds);
  }

  notifyTransactionChange();
  sendCreated(res, application, 'Promotion application submitted successfully.');
};

// ── Rules Configs ──────────────────────────────────────────────────────────

export const getRulesConfigs = async (req: Request, res: Response): Promise<void> => {
  const cycles = await prisma.promotionCycle.findMany({
    where: { rulesConfigurationJson: { not: null as any } },
    select: { id: true, name: true, type: true, rulesConfigurationJson: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  sendSuccess(res, cycles.map(c => ({ id: c.id, name: c.name, type: c.type, criteria: c.rulesConfigurationJson })));
};

export const createRulesConfig = async (req: Request, res: Response): Promise<void> => {
  const { name, criteria } = req.body;
  if (!name || !criteria) { sendBadRequest(res, 'name and criteria are required.'); return; }
  sendCreated(res, { id: Date.now(), name, criteria }, 'Promotion ruleset created. Attach to a promotion cycle when creating one.');
};

// ── Career History & 201 Files ─────────────────────────────────────────────

export const getCareerHistory = async (req: Request, res: Response): Promise<void> => {
  const personnelId = parseInt(req.params.personnelId, 10);
  if (isNaN(personnelId)) { sendBadRequest(res, 'Invalid personnel ID format.'); return; }

  // Personnel read their own history, an AO II their station's, HRMO all.
  if (!(await personnelInScope(await getStationScope(req.user), personnelId))) {
    await denyOutOfScope(req, res, { entityType: 'Personnel', entityId: personnelId, action: 'CAREER_HISTORY_VIEW' }, 'Personnel not found.');
    return;
  }

  const entries = await prisma.careerHistoryEntry.findMany({
    where: { personnelId },
    orderBy: { eventDate: 'desc' },
    include: { supportingDocument: { select: { fileName: true, storagePath: true } } },
  });
  sendSuccess(res, entries);
};

const getMonthlySalaryBySG = (sg: number): number => {
  const salaries: Record<number, number> = {
    1: 13000, 2: 13807, 3: 14678, 4: 15586, 5: 16543,
    6: 17553, 7: 18620, 8: 19744, 9: 21211, 10: 23176,
    11: 27000, 12: 29165, 13: 31320, 14: 33843, 15: 36619,
    16: 39672, 17: 43030, 18: 46725, 19: 51357, 20: 57347,
    21: 64147, 22: 71761, 23: 80303, 24: 90078,
  };
  return salaries[sg] || 27000;
};

export const getMyServiceRecords = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { personnel: { select: { id: true } } } });
  const personnelId = user?.personnel?.id || req.user?.personnelId;

  if (!personnelId) {
    sendSuccess(res, []);
    return;
  }

  const personnel = await prisma.personnel.findUnique({
    where: { id: personnelId },
    include: {
      plantillaItem: true,
      careerHistoryEntries: {
        orderBy: { eventDate: 'desc' },
        include: { supportingDocument: true },
      },
      transactions: {
        where: { status: 'APPROVED' },
        include: { transactionType: true },
        orderBy: { approvalDate: 'desc' },
      },
      promotionApplications: {
        where: { status: 'APPROVED' },
        include: { promotionCycle: true },
        orderBy: { updatedAt: 'desc' },
      },
    },
  });

  if (!personnel) {
    sendSuccess(res, []);
    return;
  }

  const currentPosition = personnel.designation || personnel.plantillaItem?.positionTitle || 'Teacher I';
  const currentSG = personnel.plantillaItem?.salaryGrade || 11;
  const stationName = personnel.plantillaItem?.department || 'SDO Koronadal City';
  const dateHiredStr = personnel.dateHired
    ? new Date(personnel.dateHired).toISOString().split('T')[0]
    : new Date(personnel.createdAt).toISOString().split('T')[0];

  const records: any[] = [];
  let recordIdCounter = 1;

  // 1. Current Active Appointed Post
  const latestApprovedTx = personnel.transactions?.find(t =>
    t.transactionType?.name?.toUpperCase().includes('PROMOTION') ||
    t.transactionType?.name?.toUpperCase().includes('APPOINTMENT')
  );
  const latestApp = personnel.promotionApplications?.[0];
  const latestCareerEntry = personnel.careerHistoryEntries?.[0];

  const currentDateFrom = latestApprovedTx?.approvalDate
    ? new Date(latestApprovedTx.approvalDate).toISOString().split('T')[0]
    : latestCareerEntry?.eventDate
      ? new Date(latestCareerEntry.eventDate).toISOString().split('T')[0]
      : latestApp?.updatedAt
        ? new Date(latestApp.updatedAt).toISOString().split('T')[0]
        : dateHiredStr;

  records.push({
    id: recordIdCounter++,
    designation: currentPosition,
    positionTitle: currentPosition,
    position_title: currentPosition,
    dateFrom: currentDateFrom,
    dateTo: null,
    status: 'PERMANENT',
    salaryGrade: currentSG,
    salary_grade: currentSG,
    stepIncrement: 1,
    step_increment: 1,
    monthlySalary: getMonthlySalaryBySG(currentSG),
    monthly_salary: getMonthlySalaryBySG(currentSG),
    stationPlace: stationName,
    station_place: stationName,
    stationDepartment: stationName,
    branch: 'NATIONAL',
    separationCause: null,
    remarks: 'Active DepEd Permanent Appointment verified by HRMO',
  });

  // 2. Past Career History Entries (Milestones, Promotions, Appointments)
  if (personnel.careerHistoryEntries && personnel.careerHistoryEntries.length > 0) {
    for (const entry of personnel.careerHistoryEntries) {
      const details = (entry.detailsJson as any) || {};
      const posTitle = details.newDesignation || details.previousDesignation || (entry.eventType === 'PROMOTION' ? 'Promoted Rank' : 'Appointed Rank');
      const entryDate = entry.eventDate ? new Date(entry.eventDate).toISOString().split('T')[0] : dateHiredStr;

      if (posTitle !== currentPosition || entryDate !== currentDateFrom) {
        const entrySg = details.salaryGrade ? parseInt(String(details.salaryGrade).replace(/[^0-9]/g, ''), 10) || 11 : 11;
        records.push({
          id: recordIdCounter++,
          designation: posTitle,
          positionTitle: posTitle,
          position_title: posTitle,
          dateFrom: entryDate,
          dateTo: currentDateFrom,
          status: 'PERMANENT',
          salaryGrade: entrySg,
          salary_grade: entrySg,
          stepIncrement: 1,
          step_increment: 1,
          monthlySalary: getMonthlySalaryBySG(entrySg),
          monthly_salary: getMonthlySalaryBySG(entrySg),
          stationPlace: stationName,
          station_place: stationName,
          stationDepartment: stationName,
          branch: 'NATIONAL',
          separationCause: null,
          remarks: details.notes || `${entry.eventType} officially confirmed in 201 file`,
        });
      }
    }
  }

  // 3. Initial Base Appointment (if distinct from current)
  const initialDesignation = (personnel.careerHistoryEntries && personnel.careerHistoryEntries.length > 0)
    ? ((personnel.careerHistoryEntries[personnel.careerHistoryEntries.length - 1]?.detailsJson as any)?.previousDesignation || 'Teacher I')
    : 'Teacher I';

  if (currentDateFrom !== dateHiredStr || currentPosition !== initialDesignation) {
    records.push({
      id: recordIdCounter++,
      designation: initialDesignation,
      positionTitle: initialDesignation,
      position_title: initialDesignation,
      dateFrom: dateHiredStr,
      dateTo: currentDateFrom,
      status: 'PERMANENT',
      salaryGrade: 11,
      salary_grade: 11,
      stepIncrement: 1,
      step_increment: 1,
      monthlySalary: getMonthlySalaryBySG(11),
      monthly_salary: getMonthlySalaryBySG(11),
      stationPlace: stationName,
      station_place: stationName,
      stationDepartment: stationName,
      branch: 'NATIONAL',
      separationCause: null,
      remarks: 'Original DepEd Appointment Entry',
    });
  }

  sendSuccess(res, records);
};

export const getMyPromotionStatus = async (req: Request, res: Response): Promise<void> => {
  const personnelId = req.user?.personnelId;

  if (!personnelId) {
    sendSuccess(res, {
      isPromoted: false,
      isPendingApproval: false,
      promotionStage: 'INELIGIBLE',
      promotionDetails: null,
      message: 'You are ineligible yet. No personnel profile linked to your account.',
    });
    return;
  }

  // Prefer an outstanding assigned transaction over a historical promotion.
  const selectedApps = await prisma.promotionApplication.findMany({
    where: {
      personnelId, status: { not: 'REJECTED' }, promotionCycle: { status: { not: 'CANCELLED' } },
      OR: [
        { status: 'APPROVED' },
        { scoreDetailsJson: { path: ['manuallyPromoted'], equals: true } },
        { scoreDetailsJson: { path: ['stageStatus'], equals: 'SELECTED_PENDING_DOCS' } },
      ],
    },
    include: { promotionCycle: { select: { id: true, name: true, type: true, rulesConfigurationJson: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  for (const selectedApp of selectedApps) {
    const details = (selectedApp.scoreDetailsJson as Record<string, any>) || {};
    const txId = Number(details.transactionId);
    if (!Number.isSafeInteger(txId) || txId <= 0) continue;
    const pendingTx = await prisma.transaction.findFirst({
      where: { id: txId, personnelId, status: { in: ['DRAFT', 'PENDING_VALIDATION', 'FOR_APPROVAL', 'DEFICIENCY', 'ESCALATED'] } },
    });
    if (!pendingTx) continue;
    sendSuccess(res, {
      isPromoted: false, isPendingApproval: true, promotionStage: 'SELECTED_PENDING_DOCUMENT_APPROVAL',
      transactionId: pendingTx.id, transactionStatus: pendingTx.status,
      promotionDetails: {
        applicationId: selectedApp.id, cycleId: selectedApp.promotionCycleId,
        cycleName: selectedApp.promotionCycle.name,
        selectedAt: details.selectedAt || details.promotedAt || selectedApp.updatedAt,
        targetPosition: (selectedApp.promotionCycle.rulesConfigurationJson as any)?.targetPosition || details.targetPosition || null,
        remarks: 'Selected by HRMO. Appointment documents are pending validation and approval.',
      },
      message: 'Your assigned appointment transaction is ready for document submission. The appointment becomes official after HRMO approval.',
    });
    return;
  }

  const approvedTx = await prisma.transaction.findFirst({
    where: { personnelId, transactionType: { name: { contains: 'Promotion', mode: 'insensitive' } }, status: 'APPROVED' },
    orderBy: { approvalDate: 'desc' },
  });
  const promotionEntry = await prisma.careerHistoryEntry.findFirst({
    where: { personnelId, eventType: 'PROMOTION' }, orderBy: { eventDate: 'desc' },
  });
  if (approvedTx || promotionEntry) {
    const details = (promotionEntry?.detailsJson as Record<string, any>) || {};
    sendSuccess(res, {
      isPromoted: true, isPendingApproval: false, promotionStage: 'OFFICIALLY_PROMOTED',
      promotionDetails: {
        transactionId: approvedTx?.id || null,
        promotedAt: approvedTx?.approvalDate || promotionEntry?.eventDate || null,
        targetPosition: details.newDesignation || null,
        remarks: approvedTx?.remarks || details.remarks || 'Promotion approved by HRMO',
      },
      message: 'Your promotion appointment documents have been approved by HRMO.',
    });
    return;
  }

  // 3. Check for any promotion application submitted by personnel
  const latestApp = await prisma.promotionApplication.findFirst({
    where: { personnelId },
    orderBy: { createdAt: 'desc' },
    include: {
      promotionCycle: true,
    },
  });

  if (latestApp) {
    const appDetails = (latestApp.scoreDetailsJson as Record<string, any>) || {};
    const isCycleCancelled = latestApp.promotionCycle.status === 'CANCELLED' || Boolean(appDetails.cycleCancelled) || appDetails.stageStatus === 'CANCELLED';

    if (isCycleCancelled) {
      sendSuccess(res, {
        isPromoted: false,
        isPendingApproval: false,
        promotionStage: 'CANCELLED',
        promotionDetails: {
          applicationId: latestApp.id,
          cycleId: latestApp.promotionCycleId,
          cycleName: latestApp.promotionCycle.name,
          targetPosition: (latestApp.promotionCycle.rulesConfigurationJson as any)?.targetPosition || 'Promoted Rank',
          remarks: appDetails.cancellationRemarks || 'Promotion cycle was cancelled by HRMO.',
        },
        message: `The promotion cycle "${latestApp.promotionCycle.name}" has been cancelled by HR.`,
      });
      return;
    }

    if (latestApp.status === 'REJECTED') {
      sendSuccess(res, {
        isPromoted: false,
        isPendingApproval: false,
        promotionStage: 'REJECTED',
        promotionDetails: {
          applicationId: latestApp.id,
          cycleId: latestApp.promotionCycleId,
          cycleName: latestApp.promotionCycle.name,
          targetPosition: (latestApp.promotionCycle.rulesConfigurationJson as any)?.targetPosition || 'Promoted Rank',
          remarks: appDetails.remarks || 'Application not selected for promotion.',
        },
        message: `Your application for "${latestApp.promotionCycle.name}" was not selected for promotion.`,
      });
      return;
    }

    // Active application under evaluation
    const stage = appDetails.stageStatus || latestApp.status;
    const isDeficient = stage === 'REQUIREMENTS_DEFICIENT';
    sendSuccess(res, {
      isPromoted: false,
      isPendingApproval: false,
      promotionStage: stage,
      promotionDetails: {
        applicationId: latestApp.id,
        cycleId: latestApp.promotionCycleId,
        cycleName: latestApp.promotionCycle.name,
        targetPosition: (latestApp.promotionCycle.rulesConfigurationJson as any)?.targetPosition || 'Promoted Rank',
        score: appDetails.totalScore || appDetails.initialRating?.initialTotalScore || null,
        requirementsStatus: appDetails.requirementsCheck?.status || 'PENDING_VERIFICATION',
        remarks: appDetails.requirementsCheck?.remarks || appDetails.remarks || 'Application under evaluation.',
      },
      message: isDeficient
        ? `Your requirements for "${latestApp.promotionCycle.name}" were marked incomplete/deficient by AO II. Remarks: ${appDetails.requirementsCheck?.remarks || 'Incomplete submission'}.`
        : `Your application for "${latestApp.promotionCycle.name}" is currently ${stage.toLowerCase().replace(/_/g, ' ')}.`,
    });
    return;
  }

  // Fallback: Not selected in any cycle yet
  sendSuccess(res, {
    isPromoted: false,
    isPendingApproval: false,
    promotionStage: 'NOT_SELECTED',
    promotionDetails: null,
    message: 'You are ineligible yet. Selection by HRMO in an active Promotion Cycle is required before initiating a Promotion Appointment.',
  });
};

/**
 * Generates and downloads the official Microsoft Word (.docx) Comparative Assessment Result (CAR) document.
 */
export const generateCarDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const cycleId = parseInt(req.params.id, 10);
    if (isNaN(cycleId)) {
      sendBadRequest(res, 'Invalid promotion cycle ID.');
      return;
    }

    // An AO II exports their own station's applicants; HRMO the whole cycle.
    const result = await CarDocumentService.generateCarDocument(cycleId, reviewableApplications(await getStationScope(req.user)));

    res.setHeader('Content-Type', result.mimeType);
    // The filename is ASCII-only by construction, so it is valid in the header as-is.
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.buffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.send(result.buffer);
  } catch (err: any) {
    if (err instanceof CarDataIncompleteError) {
      sendBadRequest(res, err.message, 'CAR_DATA_INCOMPLETE');
      return;
    }
    if (err instanceof CarCycleNotFoundError) {
      sendNotFound(res, 'Promotion cycle not found.');
      return;
    }
    logger.error({ err: err }, 'Failed to generate CAR document');
    sendError(res, 'Failed to generate CAR document.', 500);
  }
};

/**
 * GET /promotions/annex-c-requirements
 *
 * The Annex C checklist, served from one place so the web app, the Flutter app
 * and AO II verification all work from the same wording and the same mandatory
 * set. Previously each client carried its own copy.
 */
export const getAnnexCRequirements = async (_req: Request, res: Response): Promise<void> => {
  sendSuccess(res, ANNEX_C_REQUIREMENTS);
};
