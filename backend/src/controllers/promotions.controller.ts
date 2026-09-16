import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { notifyTransactionChange } from './transactions.controller';
import { notifyUserNotifications } from './notifications.controller';
import {
  sendSuccess, sendCreated, sendNotFound, sendBadRequest, sendForbidden,
  getPaginationParams, buildPaginationMeta,
} from '../utils/response.util';
import { PromotionCycleStatus, PromotionCycleType } from '@prisma/client';
import { getAOSchoolScope } from '../utils/scope.util';
import { generateEmployeeNumber } from './users.controller';
import { hashPassword, validatePasswordComplexity } from '../utils/hash.util';

// ── Promotion Cycles ───────────────────────────────────────────────────────

const normalizePositionTitle = (value: unknown): string => String(value || '')
  .normalize('NFKD')
  .toLowerCase()
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\b(?:salary\s*grade|sg)\s*\d+\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const getCycleTargetPosition = (cycle: { name?: string | null; rulesConfigurationJson?: unknown }): string => {
  const rules = (cycle.rulesConfigurationJson as Record<string, any>) || {};
  if (rules.targetPosition || rules.positionTitle) return String(rules.targetPosition || rules.positionTitle).trim();
  return String(cycle.name || '')
    .replace(/^ranking\s+for\s+(?:natural\s+)?vacancy\s*:\s*/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
};

export const getPromotionCycles = async (req: Request, res: Response): Promise<void> => {
  if (req.user?.role === 'SYSTEM_ADMIN' || req.user?.role === 'AO_II') {
    res.status(403).json({
      status: 'error',
      message: 'Access denied: Promotion cycles and Comparative Assessment Results are managed exclusively by HR (HRMO).',
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

  const [data, total] = await Promise.all([
    prisma.promotionCycle.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { promotionApplications: true } },
      },
    }),
    prisma.promotionCycle.count({ where }),
  ]);

  let appliedCycleIds: number[] = [];
  let currentPosition = '';
  if (req.user?.personnelId) {
    const [myApps, personnel] = await Promise.all([
      prisma.promotionApplication.findMany({
        where: { personnelId: req.user.personnelId },
        select: { promotionCycleId: true },
      }),
      prisma.personnel.findUnique({
        where: { id: req.user.personnelId },
        select: { designation: true, plantillaItem: { select: { positionTitle: true } } },
      }),
    ]);
    appliedCycleIds = myApps.map(a => a.promotionCycleId);
    currentPosition = personnel?.designation || personnel?.plantillaItem?.positionTitle || '';
  }

  const enriched = data.map(cycle => {
    const targetPosition = getCycleTargetPosition(cycle);
    return {
      ...cycle,
      applicantCount: cycle._count?.promotionApplications || 0,
      hasApplied: appliedCycleIds.includes(cycle.id),
      targetPosition,
      currentPosition: currentPosition || undefined,
      isCurrentPosition: Boolean(currentPosition) && normalizePositionTitle(currentPosition) === normalizePositionTitle(targetPosition),
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

    const cycle = await prisma.promotionCycle.create({
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
      try {
        await prisma.validationLog.create({
          data: {
            entityType: 'PromotionCycle',
            entityId: cycle.id,
            action: 'PROMOTION_CYCLE_CREATED',
            userId: req.user.userId,
            status: 'SUCCESS',
          },
        });
      } catch (logErr) {
        console.warn('Could not write validation log:', logErr);
      }
    }

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
            ? `📋 New Promotion Cycle Active: "${cycle.name}" has been created. Prepare for applicant qualification and initial rating.`
            : `📢 New Promotion Cycle Opened: "${cycle.name}" is now active for applications. Check your requirements and apply!`;

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
      console.warn('Failed to send promotion cycle creation notifications:', notifyErr);
    }

    sendCreated(res, cycle, 'Promotion cycle created.');
  } catch (error: any) {
    console.error('Failed to create promotion cycle:', error);
    res.status(500).json({ status: 'error', message: error?.message || 'Failed to create promotion cycle.' });
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
  const { status, endDate, rulesConfigurationJson } = req.body;
  let targetStatus = status;
  if (targetStatus === 'COMPLETED') {
    targetStatus = 'CLOSED';
  }

  if (targetStatus && !Object.values(PromotionCycleStatus).includes(targetStatus as PromotionCycleStatus)) {
    sendBadRequest(res, `Invalid status "${status}". Allowed values: ${Object.values(PromotionCycleStatus).join(', ')}`);
    return;
  }

  const updated = await prisma.promotionCycle.update({
    where: { id },
    data: {
      ...(targetStatus && { status: targetStatus as PromotionCycleStatus }),
      ...(endDate && { endDate: new Date(endDate) }),
      ...(rulesConfigurationJson && { rulesConfigurationJson }),
    },
  });
  notifyTransactionChange();
  sendSuccess(res, updated, 'Promotion cycle updated.');
};

export const computeCycleRankingInternal = async (cycleId: number) => {
  try {
    const cycle = await prisma.promotionCycle.findUnique({
      where: { id: cycleId },
      include: {
        promotionApplications: {
          include: {
            personnel: {
              include: { careerHistoryEntries: true, plantillaItem: true },
            },
          },
        },
      },
    });
    if (!cycle) return [];

    const rules = (cycle.rulesConfigurationJson as Record<string, number>) || {
      yearsOfService: 25,
      trainingHours: 25,
      performanceRating: 25,
      seniority: 25,
    };

    const ranked = cycle.promotionApplications.map(app => {
      const inputScores = (app.scoreDetailsJson as Record<string, any>) || {};
      const initialRating = inputScores.initialRating || null;
      const finalRating = inputScores.finalRating || null;

      let score = 0;

      if (finalRating && typeof finalRating.finalTotalScore === 'number' && finalRating.finalTotalScore > 0) {
        const initScore = initialRating ? Number(initialRating.initialTotalScore) : (inputScores.initialTotalScore || 0);
        score = parseFloat((initScore + Number(finalRating.finalTotalScore)).toFixed(2));
      } else if (finalRating && typeof finalRating.overallTotalScore === 'number' && finalRating.overallTotalScore > 0) {
        score = finalRating.overallTotalScore;
      } else if (initialRating && typeof initialRating.initialTotalScore === 'number' && initialRating.initialTotalScore > 0) {
        score = initialRating.initialTotalScore;
      } else if (typeof inputScores.totalScore === 'number' && inputScores.totalScore > 0 && (initialRating || finalRating)) {
        score = inputScores.totalScore;
      } else {
        score = 0;
      }

      const breakdown = score > 0 ? {
        yearsOfServiceScore: parseFloat((score * 0.25).toFixed(2)),
        trainingScore: parseFloat((score * 0.25).toFixed(2)),
        performanceScore: parseFloat((score * 0.25).toFixed(2)),
        seniorityScore: parseFloat((score * 0.25).toFixed(2)),
      } : undefined;

      return { app, score: parseFloat(score.toFixed(2)), breakdown };
    });

    ranked.sort((a, b) => b.score - a.score);

    // Update ranks in DB while preserving exact scoreDetailsJson rating values
    await Promise.all(
      ranked.map((r, idx) => {
        const details = (r.app.scoreDetailsJson as Record<string, any>) || {};
        const hasRating = Boolean(details.initialRating || details.finalRating);
        const currentInitial = details.initialRating?.initialTotalScore ?? (hasRating ? (details.initialTotalScore ?? 0) : 0);
        const currentStatus = details.stageStatus || r.app.status;
        const updatedFinalRating = details.finalRating
          ? { ...details.finalRating, overallTotalScore: r.score }
          : undefined;

        return prisma.promotionApplication.update({
          where: { id: r.app.id },
          data: {
            finalRank: idx + 1,
            scoreDetailsJson: {
              ...details,
              totalScore: hasRating ? r.score : 0,
              initialTotalScore: hasRating ? currentInitial : 0,
              ...(updatedFinalRating ? { finalRating: updatedFinalRating } : {}),
              breakdown: hasRating ? (details.breakdown || r.breakdown) : undefined,
            },
            status: currentStatus as any,
          },
        });
      })
    );

    await prisma.promotionCycle.update({ where: { id: cycleId }, data: { status: 'RESULTS_READY' } });
    return ranked;
  } catch (err) {
    console.error('Error in computeCycleRankingInternal:', err);
    return [];
  }
};

export const generateRanking = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { sendBadRequest(res, 'Invalid cycle ID format.'); return; }
  const cycle = await prisma.promotionCycle.findUnique({ where: { id } });
  if (!cycle) { sendNotFound(res, 'Promotion cycle not found.'); return; }

  const ranked = await computeCycleRankingInternal(id);
  sendSuccess(res, { rankingJobId: `job-${id}-${Date.now()}`, status: 'Completed', totalRanked: ranked.length }, 'Initial top list ranking generated successfully.');
};

export const getRankingResults = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { sendBadRequest(res, 'Invalid cycle ID format.'); return; }
  const where: any = { promotionCycleId: id };

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
  const where: any = { promotionCycleId: cycleId };

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

  const applications = await prisma.promotionApplication.findMany({
    where,
    include: {
      personnel: {
        select: { id: true, firstName: true, lastName: true, employeeId: true, designation: true, address: true },
      },
    },
    orderBy: { applicationDate: 'desc' },
  });
  sendSuccess(res, applications);
};

// ── Two-Stage AO II & HRMO Realtime Rating & Ranking Workflows ──────────────

export const submitInitialRating = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'AO_II' && req.user?.role !== 'SYSTEM_ADMIN') {
      sendForbidden(res, 'Forbidden: Only Administrative Officer II (AO II) officers can submit or revise initial ratings.');
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
      educationScore,
      trainingScore,
      experienceScore,
      performanceScore,
      outstandingAccomplishmentsScore,
      applicationOfEducationScore,
      applicationOfLdScore,
      remarks,
    } = req.body;

    const app = await prisma.promotionApplication.findFirst({
      where: { id: appId, promotionCycleId: cycleId },
      include: { personnel: true },
    });

    if (!app) {
      sendNotFound(res, 'Promotion application not found for this cycle.');
      return;
    }

    const cycle = await prisma.promotionCycle.findUnique({
      where: { id: cycleId },
    });

    if (!cycle) {
      sendNotFound(res, 'Promotion cycle not found.');
      return;
    }

    const rules = (cycle.rulesConfigurationJson as Record<string, any>) || {};
    const cycleDistrict = rules.district;

    // Strict District Jurisdiction Check for AO II officers
    if (req.user?.role === 'AO_II') {
      const aoScope = await getAOSchoolScope(req.user);
      if (cycleDistrict && cycleDistrict !== 'ALL' && cycleDistrict !== 'DIVISION_WIDE') {
        const aoDist = (aoScope.districtName || '').toLowerCase().trim();
        const targetDist = cycleDistrict.toLowerCase().trim();
        if (!aoDist || (!aoDist.includes(targetDist) && !targetDist.includes(aoDist))) {
          sendForbidden(res, `District Scope Restriction: Only Administrative Officer II (AO II) assigned to ${cycleDistrict} can evaluate applicants for this promotion cycle. Your assigned jurisdiction is ${aoScope.districtName || 'Different District / Unassigned'}.`);
          return;
        }
      }
    }

    const isNonTeaching = track === 'NON_TEACHING' ||
      app.personnel.designation?.toLowerCase().includes('administrative') ||
      app.personnel.designation?.toLowerCase().includes('registrar') ||
      app.personnel.designation?.toLowerCase().includes('officer') ||
      app.personnel.designation?.toLowerCase().includes('assistant');

    const edu = Math.min(10, Math.max(0, Number(educationScore) || 0));
    const train = Math.min(10, Math.max(0, Number(trainingScore) || 0));
    const exp = Math.min(10, Math.max(0, Number(experienceScore) || 0));
    const maxPerf = isNonTeaching ? 20 : 30;
    const perf = Math.min(maxPerf, Math.max(0, Number(performanceScore) || 0));

    let initialTotalScore = 0;
    let nonTeachingDetails: Record<string, number> = {};

    if (isNonTeaching) {
      const outAcc = Math.min(5, Math.max(0, Number(outstandingAccomplishmentsScore) || 0));
      const appEdu = Math.min(15, Math.max(0, Number(applicationOfEducationScore) || 0));
      const appLd = Math.min(10, Math.max(0, Number(applicationOfLdScore) || 0));
      initialTotalScore = parseFloat((edu + train + exp + perf + outAcc + appEdu + appLd).toFixed(2));
      nonTeachingDetails = {
        outstandingAccomplishmentsScore: outAcc,
        applicationOfEducationScore: appEdu,
        applicationOfLdScore: appLd,
      };
    } else {
      // Teaching AO subtotal (10 + 10 + 10 + 30 = 60 pts max)
      initialTotalScore = parseFloat((edu + train + exp + perf).toFixed(2));
    }

    const currentDetails = (app.scoreDetailsJson as Record<string, any>) || {};

    const updatedDetails = {
      ...currentDetails,
      track: isNonTeaching ? 'NON_TEACHING' : 'TEACHING',
      stageStatus: 'INITIAL_RATED',
      initialRating: {
        track: isNonTeaching ? 'NON_TEACHING' : 'TEACHING',
        educationScore: edu,
        trainingScore: train,
        experienceScore: exp,
        performanceScore: perf,
        ...nonTeachingDetails,
        initialTotalScore,
        aoRemarks: remarks || 'Initial Rating completed by AO II in accordance with DepEd CAR guidelines',
        ratedByUserId: req.user?.userId,
        ratedAt: new Date().toISOString(),
      },
      initialTotalScore,
      totalScore: initialTotalScore,
    };

    const updated = await prisma.promotionApplication.update({
      where: { id: appId },
      data: {
        status: 'UNDER_REVIEW',
        scoreDetailsJson: updatedDetails,
      },
    });

    // Re-calculate ranks across the cycle
    await computeCycleRankingInternal(cycleId);

    // Notify all HRMO officers that AO II has submitted an initial rating
    const hrmoUsers = await prisma.user.findMany({
      where: { role: { name: { in: ['HRMO'] } } },
      select: { id: true },
    });
    if (hrmoUsers.length > 0) {
      const applicantName = `${app.personnel.firstName} ${app.personnel.lastName}`.trim();
      const maxAo = isNonTeaching ? 80 : 50;

      await prisma.notification.createMany({
        data: hrmoUsers.map(h => ({
          userId: h.id,
          message: `⭐ AO II Initial Rating Submitted: ${applicantName} was evaluated by AO II (${initialTotalScore}/${maxAo} pts) and passed to HRMO for final deliberation.`,
          type: 'INFO',
          relatedEntityId: cycleId,
          relatedEntityType: 'PromotionCycle',
        })),
      });
      notifyUserNotifications(hrmoUsers.map(h => h.id));
    }

    notifyTransactionChange();

    sendSuccess(res, updated, 'Initial rating submitted successfully by AO II and forwarded to HRMO.');
  } catch (err: any) {
    console.error('Failed to submit initial rating:', err);
    res.status(500).json({ status: 'error', message: err?.message || 'Failed to submit initial rating.' });
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

    const currentDetails = (app.scoreDetailsJson as Record<string, any>) || {};
    const isNonTeaching = track === 'NON_TEACHING' || currentDetails.track === 'NON_TEACHING' ||
      app.personnel.designation?.toLowerCase().includes('administrative') ||
      app.personnel.designation?.toLowerCase().includes('registrar') ||
      app.personnel.designation?.toLowerCase().includes('officer') ||
      app.personnel.designation?.toLowerCase().includes('assistant');

    let hrmoFinalScore = 0;
    let hrmoBreakdown: Record<string, any> = {};

    if (isNonTeaching) {
      // Non-Teaching Potential (20 pts max)
      const written = Math.min(5, Math.max(0, Number(potentialWrittenScore) || 0));
      const bei = Math.min(5, Math.max(0, Number(potentialBeiScore) || 0));
      const skills = Math.min(10, Math.max(0, Number(potentialSkillsScore) || 0));
      const totalPotential = potentialScore !== undefined ? Math.min(20, Math.max(0, Number(potentialScore))) : Math.min(20, written + bei + skills);
      hrmoFinalScore = parseFloat(totalPotential.toFixed(2));
      hrmoBreakdown = {
        potentialScore: totalPotential,
        potentialWrittenScore: written,
        potentialBeiScore: bei,
        potentialSkillsScore: skills,
      };
    } else {
      // Teaching PPST COIs (25 pts max) & PPST NCOIs (15 pts max) -> 40 pts max
      const coi = Math.min(25, Math.max(0, Number(ppstCoiScore) || 0));
      const ncoi = Math.min(15, Math.max(0, Number(ppstNcoiScore) || 0));
      hrmoFinalScore = parseFloat((coi + ncoi).toFixed(2));
      hrmoBreakdown = {
        ppstCoiScore: coi,
        ppstNcoiScore: ncoi,
      };
    }

    const rawInitialTotal = currentDetails.initialRating?.initialTotalScore ?? currentDetails.initialTotalScore;
    if (rawInitialTotal === undefined || rawInitialTotal === null || !Number.isFinite(Number(rawInitialTotal))) {
      sendBadRequest(res, 'AO II initial rating must be completed before HRMO final rating.', 'INITIAL_RATING_REQUIRED');
      return;
    }
    const initialTotal = Number(rawInitialTotal);
    const overallTotalScore = parseFloat((initialTotal + hrmoFinalScore).toFixed(2));

    const updatedDetails = {
      ...currentDetails,
      track: isNonTeaching ? 'NON_TEACHING' : 'TEACHING',
      stageStatus: currentDetails.manuallyPromoted ? (currentDetails.stageStatus || 'SELECTED_PENDING_DOCS') : 'FINAL_RANKED',
      finalRating: {
        track: isNonTeaching ? 'NON_TEACHING' : 'TEACHING',
        ...hrmoBreakdown,
        finalTotalScore: hrmoFinalScore,
        overallTotalScore,
        hrmoRemarks: remarks || 'Comparative Assessment completed by HRMO Board',
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
    notifyTransactionChange();

    sendSuccess(res, updated, 'Comparative Assessment Result (CAR) finalized successfully by HRMO.');
  } catch (err: any) {
    console.error('Failed to submit final rating:', err);
    res.status(500).json({ status: 'error', message: err?.message || 'Failed to finalize promotion rating.' });
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
  const [cycle, applications] = await Promise.all([
    prisma.promotionCycle.findUnique({ where: { id: cycleId } }),
    prisma.promotionApplication.findMany({
      where: { promotionCycleId: cycleId },
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

    const autoApplicantNo = details.applicantNumber || (a.personnel?.employeeId ? (a.personnel.employeeId.startsWith('APP-') ? a.personnel.employeeId : `APP-2026-${String(a.id).padStart(4, '0')}`) : `APP-2026-${String(a.id).padStart(4, '0')}`);

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
        assignedPlantilla = freePlantilla || configuredPlantillas[0] || null;
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

  const targetPos = (app.promotionCycle.rulesConfigurationJson as any)?.targetPosition || 'Master Teacher I';
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

    for (const reqItem of defaultRequirements) {
      const existingReq = await db.requirementTemplate.findFirst({
        where: { transactionTypeId: txType.id, name: reqItem.name },
      });
      if (!existingReq) {
        await db.requirementTemplate.create({
          data: {
            transactionTypeId: txType.id,
            name: reqItem.name,
            description: reqItem.description,
            isMandatory: reqItem.isMandatory,
            expectedDataType: reqItem.expectedDataType,
          },
        });
      }
    }

    // 2. Create or find active Transaction for this candidate personnel
    let activeTx = await db.transaction.findFirst({
      where: {
        personnelId: app.personnelId,
        transactionTypeId: txType.id,
        status: { in: ['DRAFT', 'PENDING_VALIDATION', 'FOR_APPROVAL', 'DEFICIENCY', 'ESCALATED'] },
      },
    });

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
      await db.user.update({
        where: { id: app.personnel.userId },
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
        ? `🎉 Congratulations! You have been selected for Newly Hired Appointment as ${targetPos} under ${app.promotionCycle.name}${assignedPlantilla ? ` (Plantilla: ${assignedPlantilla})` : ''}. Your appointment transaction #${activeTx.id} is now active. Please submit your required onboarding compliance documents on your portal for HR validation.`
        : `🎉 Congratulations! You have been selected for Promotion to ${targetPos} under ${app.promotionCycle.name}. Your Promotion Appointment transaction #${activeTx.id} is now active. Please submit your required appointment documents for HR validation and approval to confirm your promotion.`;

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
      await db.transaction.updateMany({
        where: { id: linkedTransactionId, status: { in: ['DRAFT', 'DEFICIENCY'] } },
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
  }
  });

  if (notificationUserId) notifyUserNotifications([notificationUserId]);
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
  const schoolStation = cycleRules.schoolStation || cycleRules.designatedSchool || null;
  const district = cycleRules.designatedDistrict || null;

  const targetCode = applicantId || employeeId;
  let targetPersonnelId = personnelId ? parseInt(personnelId, 10) : undefined;

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
      include: { personnel: true },
    });

    if (existingUser && existingUser.personnel) {
      targetPersonnelId = existingUser.personnel.id;
    } else {
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
            status: 'INACTIVE',
            dateHired: null,
            profileComplete: false,
          },
        });

        await tx.user.update({
          where: { id: assignedUserId },
          data: { personnelId: newPersonnel.id },
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

    if (!found) { sendNotFound(res, `No personnel record matches applicant code "${targetCode}".`); return; }
    targetPersonnelId = found.id;
  }

  if (!targetPersonnelId) {
    sendBadRequest(res, 'Select an existing personnel record or provide complete applicant identity details.');
    return;
  }

  const targetPersonnel = await prisma.personnel.findUnique({ where: { id: targetPersonnelId }, select: { id: true, designation: true } });
  if (!targetPersonnel) { sendNotFound(res, 'Selected personnel record not found.'); return; }
  if (normalizePositionTitle(targetPersonnel.designation) === normalizePositionTitle(targetPos)) {
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

  const appCount = await prisma.promotionApplication.count({ where: { promotionCycleId: cycleId } });
  const autoApplicantNo = targetCode || `APP-2026-${String(appCount + 1).padStart(4, '0')}`;

  const scoreDetailsJson = {
    applicantNumber: autoApplicantNo,
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
    application = await prisma.promotionApplication.create({
      data: {
        personnelId: targetPersonnelId,
        promotionCycleId: cycleId,
        status: 'SUBMITTED',
        scoreDetailsJson,
      },
    });
  }

  // Auto-rank applicants immediately upon application form submission
  await computeCycleRankingInternal(cycleId);

  // Notify all AO II & HRMO officers about the application form submission
  const adminUsers = await prisma.user.findMany({
    where: { role: { name: { in: ['AO_II', 'HRMO'] } } },
    select: { id: true },
  });
  if (adminUsers.length > 0) {
    const targetPersonnel = await prisma.personnel.findUnique({
      where: { id: targetPersonnelId },
      select: { firstName: true, lastName: true, employeeId: true },
    });
    const applicantName = targetPersonnel ? `${targetPersonnel.firstName} ${targetPersonnel.lastName}`.trim() : 'Candidate Applicant';
    const empId = targetPersonnel?.employeeId || autoApplicantNo;

    await prisma.notification.createMany({
      data: adminUsers.map(u => ({
        userId: u.id,
        message: `📋 New Promotion Application Received: ${applicantName} (${empId}) registered for ${cycle.name}.`,
        type: 'INFO',
        relatedEntityId: cycleId,
        relatedEntityType: 'PromotionCycle',
      })),
    });
    notifyUserNotifications(adminUsers.map(u => u.id));
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
  if (currentPosition && targetPosition && normalizePositionTitle(currentPosition) === normalizePositionTitle(targetPosition)) {
    sendBadRequest(
      res,
      `You cannot apply for ${targetPosition} because it is already your current position.`,
      'SAME_CURRENT_POSITION'
    );
    return;
  }

  const existing = await prisma.promotionApplication.findUnique({
    where: { personnelId_promotionCycleId: { personnelId: req.user.personnelId, promotionCycleId: cycleId } },
  });
  if (existing) {
    sendBadRequest(res, 'You have already applied for this promotion cycle.', 'ALREADY_APPLIED');
    return;
  }

  const cycleRules = (cycle.rulesConfigurationJson as any) || {};
  const maxCapacity = Number(cycleRules.maxApplicants) || 10;
  const appCount = await prisma.promotionApplication.count({ where: { promotionCycleId: cycleId } });
  if (appCount >= maxCapacity) {
    sendBadRequest(res, `This promotion cycle has reached its maximum applicant capacity (${maxCapacity}).`, 'CAPACITY_REACHED');
    return;
  }
  const autoApplicantNo = `APP-2026-${String(appCount + 1).padStart(4, '0')}`;

  const application = await prisma.promotionApplication.create({
    data: {
      personnelId: req.user.personnelId,
      promotionCycleId: cycleId,
      status: 'SUBMITTED',
      applicationDate: new Date(),
      scoreDetailsJson: {
        applicantNumber: autoApplicantNo,
        appliedVia: 'MOBILE_APP',
      },
    },
  });

  // Notify all AO II & HRMO officers about the new promotion application
  const adminUsers = await prisma.user.findMany({
    where: { role: { name: { in: ['AO_II', 'HRMO'] } } },
    select: { id: true },
  });
  if (adminUsers.length > 0) {
    const applicantPersonnel = await prisma.personnel.findUnique({
      where: { id: req.user.personnelId },
      select: { firstName: true, lastName: true, employeeId: true },
    });
    const applicantName = applicantPersonnel ? `${applicantPersonnel.firstName} ${applicantPersonnel.lastName}`.trim() : 'Personnel Applicant';
    const empId = applicantPersonnel?.employeeId || `EMP-${req.user.personnelId}`;

    await prisma.notification.createMany({
      data: adminUsers.map(u => ({
        userId: u.id,
        message: `📋 New Promotion Application Received: ${applicantName} (${empId}) applied for ${cycle.name}.`,
        type: 'INFO',
        relatedEntityId: cycleId,
        relatedEntityType: 'PromotionCycle',
      })),
    });
    notifyUserNotifications(adminUsers.map(u => u.id));
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

const ADMIN_ROLES = ['SYSTEM_ADMIN', 'AO_II', 'HRMO'];

export const getCareerHistory = async (req: Request, res: Response): Promise<void> => {
  const personnelId = parseInt(req.params.personnelId, 10);
  if (isNaN(personnelId)) { sendBadRequest(res, 'Invalid personnel ID format.'); return; }
  const isAdmin = ADMIN_ROLES.includes(req.user!.role);

  if (!isAdmin && req.user?.personnelId !== personnelId) {
    sendForbidden(res, 'You do not have permission to view this career history.');
    return;
  }

  if (req.user!.role === 'AO_II') {
    const scope = await getAOSchoolScope(req.user);
    const target = await prisma.personnel.findUnique({ where: { id: personnelId }, select: { id: true, address: true, designation: true } });
    const school = scope.schoolName?.toLowerCase();
    const belongsToSchool = Boolean(target && school && (
      target.address?.toLowerCase().includes(school) ||
      target.designation?.toLowerCase().includes(school) ||
      target.id === scope.aoPersonnelId
    ));
    if (!belongsToSchool) {
      sendForbidden(res, 'You do not have permission to view career history outside your assigned school.');
      return;
    }
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
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { personnelId: true } });
  const personnelId = user?.personnelId || req.user?.personnelId;

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

  // 1. Check for official approved promotion transaction or career history entry
  const approvedTx = await prisma.transaction.findFirst({
    where: {
      personnelId,
      transactionType: { name: { contains: 'Promotion', mode: 'insensitive' } },
      status: 'APPROVED',
    },
    orderBy: { approvalDate: 'desc' },
  });

  const promotionEntry = await prisma.careerHistoryEntry.findFirst({
    where: { personnelId, eventType: 'PROMOTION' },
    orderBy: { eventDate: 'desc' },
  });

  if (approvedTx || promotionEntry) {
    const details = (promotionEntry?.detailsJson as Record<string, any>) || {};
    sendSuccess(res, {
      isPromoted: true,
      isPendingApproval: false,
      promotionStage: 'OFFICIALLY_PROMOTED',
      promotionDetails: {
        transactionId: approvedTx?.id || null,
        promotedAt: approvedTx?.approvalDate || promotionEntry?.eventDate || new Date().toISOString(),
        targetPosition: details.newDesignation || 'Promoted Rank',
        remarks: approvedTx?.remarks || details.remarks || 'Promotion officially approved by HRMO',
      },
      message: '🎉 Congratulations! Your promotion appointment documents have been approved by HR. You are officially promoted!',
    });
    return;
  }

  // 2. Check for active pending promotion transaction or selection by HRMO
  const pendingTx = await prisma.transaction.findFirst({
    where: {
      personnelId,
      transactionType: { name: { contains: 'Promotion', mode: 'insensitive' } },
      status: { in: ['DRAFT', 'PENDING_VALIDATION', 'FOR_APPROVAL', 'DEFICIENCY', 'ESCALATED'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  const selectedApp = await prisma.promotionApplication.findFirst({
    where: {
      personnelId,
      OR: [
        { status: 'APPROVED' },
        { scoreDetailsJson: { path: ['manuallyPromoted'], equals: true } },
        { scoreDetailsJson: { path: ['stageStatus'], equals: 'SELECTED_PENDING_DOCS' } },
      ],
    },
    include: {
      promotionCycle: { select: { id: true, name: true, type: true, rulesConfigurationJson: true } },
    },
  });

  if (pendingTx || selectedApp) {
    const appDetails = (selectedApp?.scoreDetailsJson as Record<string, any>) || {};
    const targetPosition = (selectedApp?.promotionCycle?.rulesConfigurationJson as any)?.targetPosition || 'Master Teacher I / Promoted Rank';
    const txId = pendingTx?.id || appDetails.transactionId || null;
    const txStatus = pendingTx?.status || 'DRAFT';

    sendSuccess(res, {
      isPromoted: false,
      isPendingApproval: true,
      promotionStage: 'SELECTED_PENDING_DOCUMENT_APPROVAL',
      transactionId: txId,
      transactionStatus: txStatus,
      promotionDetails: {
        applicationId: selectedApp?.id || null,
        cycleId: selectedApp?.promotionCycleId || null,
        cycleName: selectedApp?.promotionCycle?.name || 'Promotion Cycle',
        selectedAt: appDetails.selectedAt || appDetails.promotedAt || selectedApp?.updatedAt,
        targetPosition,
        remarks: 'Selected for promotion by HRMO. Appointment documents pending HR validation & approval.',
      },
      message: 'Selected for Promotion! Please submit your promotion appointment documents for HR validation and approval. You are not officially promoted until HR approves your documents.',
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

    const { CarDocumentService } = await import('../services/car-document.service');
    const result = await CarDocumentService.generateCarDocument(cycleId);

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.buffer.length);
    res.send(result.buffer);
  } catch (err: any) {
    console.error('Failed to generate CAR document:', err);
    res.status(500).json({ status: 'error', message: err?.message || 'Failed to generate CAR document.' });
  }
};
