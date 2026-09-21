import { Request, Response } from 'express';
import { validatePersonnelInput, isPersonnelRole } from '../utils/personnel-validation.util';
import prisma from '../config/prisma';
import { sendSuccess, sendNotFound, sendBadRequest, sendForbidden, getPaginationParams, buildPaginationMeta } from '../utils/response.util';
import {
  getStationScope,
  hasStationAssignment,
  isWithinStation,
  stationPersonnelFilter,
  STATION_SUBJECT_ROLES,
} from '../utils/scope.util';
import { getPlantillaActivePromotionCycle } from '../utils/deped.util';
import { logger } from '../utils/logger';

const personnelSelect = {
  id: true, employeeId: true, firstName: true, lastName: true, middleName: true,
  suffix: true, birthDate: true, gender: true, civilStatus: true, contactNumber: true,
  address: true, school: true, district: true, designation: true, dateHired: true,
  status: true, profileComplete: true,
  createdAt: true, updatedAt: true,
  plantillaItem: {
    select: { id: true, itemNumber: true, positionTitle: true, salaryGrade: true, department: true, division: true },
  },
  user: { select: { email: true, lastLogin: true, role: { select: { name: true } } } },
  transactions: {
    select: {
      id: true,
      status: true,
      submissionDate: true,
      validationDate: true,
      approvalDate: true,
      remarks: true,
      createdAt: true,
      transactionType: { select: { id: true, name: true, description: true } },
      uploadedDocuments: {
        select: {
          id: true, fileName: true, status: true, validationDate: true,
          requirementTemplate: { select: { name: true } },
        },
        orderBy: { uploadDate: 'desc' as const },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  },
  careerHistoryEntries: {
    select: {
      id: true,
      eventType: true,
      eventDate: true,
      detailsJson: true,
      createdAt: true,
    },
    orderBy: { eventDate: 'desc' as const },
  },
  promotionApplications: {
    select: {
      id: true,
      status: true,
      applicationDate: true,
      finalRank: true,
      scoreDetailsJson: true,
      promotionCycle: {
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          rulesConfigurationJson: true,
        },
      },
    },
    orderBy: { applicationDate: 'desc' as const },
  },
};

/**
 * Lightweight select projection for personnel list queries (ARCH-M2)
 */
export const personnelSelectLite = {
  id: true,
  employeeId: true,
  firstName: true,
  lastName: true,
  middleName: true,
  suffix: true,
  birthDate: true,
  gender: true,
  civilStatus: true,
  contactNumber: true,
  address: true,
  school: true,
  district: true,
  designation: true,
  dateHired: true,
  status: true,
  profileComplete: true,
  createdAt: true,
  updatedAt: true,
  plantillaItem: {
    select: { id: true, itemNumber: true, positionTitle: true, salaryGrade: true, department: true, division: true },
  },
  user: { select: { email: true, lastLogin: true, role: { select: { name: true } } } },
  careerHistoryEntries: {
    select: { id: true, eventType: true, eventDate: true, detailsJson: true },
    orderBy: { eventDate: 'desc' as const },
  },
  transactions: {
    select: {
      id: true, status: true, approvalDate: true, createdAt: true,
      transactionType: { select: { name: true, requirementTemplates: { where: { isMandatory: true }, select: { id: true } } } },
      uploadedDocuments: { select: { requirementTemplateId: true, status: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
};

/**
 * Helper to compute authentic DepEd service record metrics & career timeline from database records
 */
export const buildServiceRecordPayload = (p: any) => {
  const hiredDate = p.dateHired ? new Date(p.dateHired) : null;
  const now = new Date();

  // Precise years and months calculation
  let years = hiredDate ? now.getFullYear() - hiredDate.getFullYear() : 0;
  let months = hiredDate ? now.getMonth() - hiredDate.getMonth() : 0;
  if (hiredDate && now.getDate() < hiredDate.getDate()) {
    months--;
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  let yearsInServiceStr = '';
  if (!hiredDate) {
    yearsInServiceStr = 'Not recorded';
  } else if (years <= 0 && months <= 0) {
    yearsInServiceStr = 'Newly Appointed (< 1 Month)';
  } else if (years <= 0) {
    yearsInServiceStr = `${months} Month${months > 1 ? 's' : ''}`;
  } else if (months === 0) {
    yearsInServiceStr = `${years} Year${years > 1 ? 's' : ''}`;
  } else {
    yearsInServiceStr = `${years} Year${years > 1 ? 's' : ''}, ${months} Month${months > 1 ? 's' : ''}`;
  }

  // Find latest approved promotion transaction or application
  const approvedPromotions = (p.transactions || []).filter(
    (t: any) => (t.status === 'APPROVED' || t.status === 'COMPLETED') &&
      (t.transactionType?.name?.toLowerCase().includes('promotion') || t.remarks?.toLowerCase().includes('promotion'))
  );

  const approvedApps = (p.promotionApplications || []).filter((a: any) => a.status === 'APPROVED');

  let latestPromotionDateStr = 'Original Appointment (No Promotions Yet)';
  let latestAppointmentDateStr = hiredDate?.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) || 'Not recorded';

  if (approvedPromotions.length > 0) {
    const latestPromo = approvedPromotions[0];
    const pDate = latestPromo.approvalDate ? new Date(latestPromo.approvalDate) : new Date(latestPromo.createdAt);
    latestPromotionDateStr = pDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    latestAppointmentDateStr = latestPromotionDateStr;
  } else if (approvedApps.length > 0) {
    const latestApp = approvedApps[0];
    const pDate = new Date(latestApp.applicationDate || latestApp.updatedAt);
    latestPromotionDateStr = pDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    latestAppointmentDateStr = latestPromotionDateStr;
  }

  const currentPosition = p.designation || p.plantillaItem?.positionTitle || 'Teaching Personnel';
  const currentSG = p.plantillaItem?.salaryGrade ? `SG ${p.plantillaItem.salaryGrade}` : 'Not recorded';

  // Build authentic interactive career timeline
  const timeline: any[] = [];

  // 1. Add approved promotion transactions
  (p.transactions || []).forEach((t: any) => {
    if (t.status === 'APPROVED' || t.status === 'COMPLETED') {
      const isPromo = t.transactionType?.name?.toLowerCase().includes('promotion');
      const isAppoint = t.transactionType?.name?.toLowerCase().includes('appointment') || t.transactionType?.name?.toLowerCase().includes('appoint');
      const isSalary = t.transactionType?.name?.toLowerCase().includes('salary') || t.transactionType?.name?.toLowerCase().includes('step');
      const eventDate = t.approvalDate ? new Date(t.approvalDate) : new Date(t.createdAt);
      timeline.push({
        id: `tx-${t.id}`,
        year: eventDate.getFullYear(),
        date: eventDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        rawDate: eventDate.getTime(),
        event: isPromo
          ? `Promoted to ${currentPosition} (${currentSG})`
          : isAppoint
            ? `Appointed as ${currentPosition} (${currentSG})`
            : `${t.transactionType?.name || 'Transaction Approved'}`,
        type: isPromo ? 'Promotion' : isSalary ? 'Salary Adjustment' : 'Appointment',
        ref: `TX-${String(t.id).padStart(3, '0')}`,
        status: 'APPROVED',
        salary: (isPromo || isAppoint) ? `${currentSG} Plantilla Compensation` : 'Official Step Adjusted',
        remarks: t.remarks || 'Officially Approved by Division HRMO',
      });
    }
  });

  // 2. Add career history entries from DB
  (p.careerHistoryEntries || []).forEach((ch: any) => {
    const eDate = new Date(ch.eventDate || ch.createdAt);
    timeline.push({
      id: `che-${ch.id}`,
      year: eDate.getFullYear(),
      date: eDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      rawDate: eDate.getTime(),
      event: ch.detailsJson?.newDesignation
        ? `Appointment to ${ch.detailsJson.newDesignation}`
        : `${ch.eventType?.replace('_', ' ') || 'Career Event'}`,
      type: ch.eventType === 'PROMOTION' ? 'Promotion' : ch.eventType === 'AWARD' ? 'Award' : 'Career Milestone',
      ref: ch.detailsJson?.transactionId ? `TX-${String(ch.detailsJson.transactionId).padStart(3, '0')}` : 'CH-LOG',
      status: 'APPROVED',
      salary: ch.detailsJson?.salary || `${currentSG}`,
      remarks: ch.detailsJson?.notes || 'DepEd SDO Service Milestone',
    });
  });

  // 3. Add base Initial Appointment
  if (hiredDate) {
    timeline.push({
      id: 'initial-appointment',
      year: hiredDate.getFullYear(),
      date: hiredDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      rawDate: hiredDate.getTime(),
      event: `Initial Appointment: ${p.designation || 'Teacher I'} (${currentSG})`,
      type: 'Appointment',
      ref: 'Initial',
      status: 'APPROVED',
      salary: `${currentSG} Base Entry`,
      remarks: 'DepEd SDO Koronadal City Permanent Appointment',
    });
  }

  // Sort timeline descending by date
  timeline.sort((a, b) => b.rawDate - a.rawDate);

  // De-duplicate timeline items with identical dates and events
  const uniqueTimeline: any[] = [];
  const seen = new Set<string>();
  timeline.forEach((item) => {
    const key = `${item.date}-${item.event}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueTimeline.push(item);
    }
  });

  return {
    personnel: {
      id: p.id,
      employeeId: p.employeeId,
      fullName: `${p.firstName} ${p.lastName}`,
      firstName: p.firstName,
      lastName: p.lastName,
      middleName: p.middleName,
      suffix: p.suffix,
      email: p.user?.email,
      designation: currentPosition,
      dateHired: p.dateHired,
      plantillaItem: p.plantillaItem,
      status: p.status,
      // Printed in the service record STATUS column. Null when not on file.
      appointmentStatus: p.appointmentStatus,
    },
    serviceRecordDetails: [
      { label: 'Current Position', value: currentPosition, highlight: false },
      { label: 'First Appointment Date', value: hiredDate?.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) || 'Not recorded', highlight: false },
      { label: 'Years in Service', value: yearsInServiceStr, highlight: true, color: 'var(--color-success)' },
      { label: 'Latest Salary Grade', value: currentSG, highlight: true, color: 'var(--color-primary-light)' },
      { label: 'Latest Appointment Date', value: latestAppointmentDateStr, highlight: false },
      { label: 'Latest Promotion Date', value: latestPromotionDateStr, highlight: false },
    ],
    careerTimeline: uniqueTimeline,
  };
};

/**
 * GET /personnel/me
 */
export const getMyProfile = async (req: Request, res: Response): Promise<void> => {
  let targetId = req.user?.personnelId;
  let personnel: any = null;

  if (targetId) {
    personnel = await prisma.personnel.findUnique({
      where: { id: targetId },
      select: personnelSelect,
    });
  }

  if (!personnel && req.user?.userId) {
    const pRecord = await prisma.personnel.findFirst({
      where: {
        OR: [
          { userId: req.user.userId },
          { user: { email: { equals: req.user.email, mode: 'insensitive' } } },
        ],
      },
      select: personnelSelect,
    });

    if (pRecord) {
      personnel = pRecord;
      targetId = pRecord.id;
      await prisma.user.update({
        where: { id: req.user.userId },
        data: { personnelId: pRecord.id },
      }).catch((err: any) => logger.error({ err }, 'Failed to link user personnelId'));
    }
  }

  if (!personnel) {
    sendNotFound(res, 'Personnel profile not found.');
    return;
  }
  const documentRows = await prisma.uploadedDocument.findMany({
    where: {
      transaction: { personnelId: personnel.id },
      status: 'VALIDATED',
      OR: [
        { requirementTemplate: { name: { contains: 'Personal Data Sheet', mode: 'insensitive' } } },
        { requirementTemplate: { name: { contains: 'PDS', mode: 'insensitive' } } },
        { requirementTemplate: { name: { contains: 'Work Experience', mode: 'insensitive' } } },
      ],
    },
    select: {
      status: true, uploadDate: true, ocrExtractedDataJson: true, correctedOcrDataJson: true,
      requirementTemplate: { select: { name: true } },
    },
    orderBy: { uploadDate: 'desc' },
  });
  const profileDocumentData: Record<string, unknown> = {};
  for (const document of documentRows) {
    const name = document.requirementTemplate.name.toLowerCase();
    const type = name.includes('work experience') ? 'wes' : 'pds';
    if (!profileDocumentData[type]) {
      const extracted: any = document.correctedOcrDataJson || document.ocrExtractedDataJson;
      if (extracted?.fields) profileDocumentData[type] = { ...extracted, status: document.status, uploadDate: document.uploadDate };
    }
  }

  sendSuccess(res, { ...personnel, profileDocumentData });
};

/**
 * GET /personnel/me/service-record — Return authentic computed service record & timeline
 */
export const getMyServiceRecord = async (req: Request, res: Response): Promise<void> => {
  let targetId = req.user?.personnelId;

  if (!targetId && req.user?.userId) {
    const pRecord = await prisma.personnel.findFirst({
      where: {
        OR: [
          { userId: req.user.userId },
          { user: { email: { equals: req.user.email, mode: 'insensitive' } } },
        ],
      },
      select: { id: true },
    });
    if (pRecord) targetId = pRecord.id;
  }

  if (!targetId) {
    sendNotFound(res, 'Personnel profile not found.');
    return;
  }

  const personnel = await prisma.personnel.findUnique({
    where: { id: targetId },
    select: personnelSelect,
  });

  if (!personnel) {
    sendNotFound(res, 'Personnel record not found.');
    return;
  }

  const payload = buildServiceRecordPayload(personnel);
  sendSuccess(res, payload);
};

/**
 * PUT /personnel/me — Update personal 201 file info and persist directly to database
 */
/** A work-experience sheet longer than this is malformed input, not a career. */
const MAX_WES_ENTRIES = 60;

export const updateMyProfile = async (req: Request, res: Response): Promise<void> => {
  const inputError = validatePersonnelInput(req.body);
  if (inputError) { sendBadRequest(res, inputError); return; }
  if (Array.isArray(req.body.wes) && req.body.wes.length > MAX_WES_ENTRIES) {
    sendBadRequest(res, `A work experience sheet cannot contain more than ${MAX_WES_ENTRIES} entries.`, 'WES_TOO_LARGE');
    return;
  }
  let targetId = req.user?.personnelId;

  if (targetId) {
    const exists = await prisma.personnel.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!exists) targetId = undefined;
  }

  if (!targetId && req.user?.userId) {
    const pRecord = await prisma.personnel.findFirst({
      where: {
        OR: [
          { userId: req.user.userId },
          { user: { email: { equals: req.user.email, mode: 'insensitive' } } },
        ],
      },
      select: { id: true },
    });

    if (pRecord) targetId = pRecord.id;
  }

  if (!targetId) {
    sendBadRequest(res, 'No personnel profile linked to this account.');
    return;
  }

  const existingPersonnel = await prisma.personnel.findUnique({
    where: { id: targetId },
  });

  if (!existingPersonnel) {
    sendNotFound(res, 'Personnel profile not found.');
    return;
  }

  const staffRoles = ['SYSTEM_ADMIN', 'AO_II', 'HRMO'];
  const isStaffUpdate = staffRoles.includes(req.user?.role || '');
  const staffOnlyFields = [
    'firstName', 'lastName', 'middleName', 'suffix',
    'birthDate', 'gender', 'civilStatus', 'designation', 'dateHired',
    'position', 'firstDayOfService', 'wes'
  ];
  const requestedStaffFields = staffOnlyFields.filter(field => req.body[field] !== undefined);
  if (!isStaffUpdate && requestedStaffFields.length > 0) {
    sendForbidden(res, 'Personal identity and appointment information is maintained by AO II and cannot be edited from a personnel account.');
    return;
  }
  const allowedFields = isStaffUpdate
    ? [...staffOnlyFields, 'contactNumber', 'address', 'designation', 'dateHired']
    : ['contactNumber', 'address'];
  const updateData: Record<string, unknown> = {};

  // Store every updated field directly in the database without skipping
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined && req.body[field] !== null && req.body[field] !== '') {
      if (field === 'birthDate' || field === 'dateHired') {
        const parsedDate = new Date(req.body[field]);
        if (!isNaN(parsedDate.getTime())) {
          updateData[field] = parsedDate;
        }
      } else if (field === 'gender') {
        const g = req.body[field].toString().toUpperCase();
        updateData[field] = (g === 'FEMALE') ? 'FEMALE' : (g === 'OTHER') ? 'OTHER' : 'MALE';
      } else if (field === 'civilStatus') {
        const cs = req.body[field].toString().toUpperCase();
        const validStatuses = ['SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED'];
        updateData[field] = validStatuses.includes(cs) ? cs : 'SINGLE';
      } else {
        updateData[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
      }
    }
  });

  // Support alias fields from PDS and Employment forms if standard names omitted
  if (!updateData['contactNumber'] && (req.body.mobileNo || req.body.telephoneNo)) {
    updateData['contactNumber'] = String(req.body.mobileNo || req.body.telephoneNo).trim();
  }
  if (!updateData['address'] && (req.body.residentialAddress || req.body.permanentAddress)) {
    updateData['address'] = String(req.body.residentialAddress || req.body.permanentAddress).trim();
  }
  if (isStaffUpdate && !updateData['designation'] && req.body.position) {
    updateData['designation'] = String(req.body.position).trim();
  }
  if (isStaffUpdate && !updateData['dateHired'] && req.body.firstDayOfService) {
    const d = new Date(req.body.firstDayOfService);
    if (!isNaN(d.getTime())) updateData['dateHired'] = d;
  }

  // DI-H1: Validate profile completeness based on required Civil Service PDS fields
  const isComplete = Boolean(
    (updateData['firstName'] ?? existingPersonnel.firstName) &&
    (updateData['lastName'] ?? existingPersonnel.lastName) &&
    (updateData['birthDate'] ?? existingPersonnel.birthDate) &&
    (updateData['gender'] ?? existingPersonnel.gender) &&
    (updateData['civilStatus'] ?? existingPersonnel.civilStatus) &&
    (updateData['contactNumber'] ?? existingPersonnel.contactNumber) &&
    (updateData['address'] ?? existingPersonnel.address) &&
    (updateData['designation'] ?? existingPersonnel.designation) &&
    (updateData['dateHired'] ?? existingPersonnel.dateHired)
  );
  updateData['profileComplete'] = isComplete;

  const updated = await prisma.personnel.update({
    where: { id: targetId },
    data: updateData,
    select: personnelSelect,
  });

  // Persist WES entries as CareerHistoryEntry records. One read and one write for the
  // whole sheet rather than a find-then-create round trip per row.
  if (isStaffUpdate && Array.isArray(req.body.wes) && req.body.wes.length > 0) {
    const byDate = new Map<number, { entry: any; eventDate: Date }>();
    for (const entry of req.body.wes) {
      if (!entry?.positionTitle || !entry.dateFrom) continue;
      const eventDate = new Date(entry.dateFrom);
      if (isNaN(eventDate.getTime())) continue;
      // An event date identifies the row, so the last entry for a date wins.
      byDate.set(eventDate.getTime(), { entry, eventDate });
    }

    if (byDate.size > 0) {
      const candidates = [...byDate.values()];
      const existing = await prisma.careerHistoryEntry.findMany({
        where: { personnelId: targetId, eventDate: { in: candidates.map(c => c.eventDate) } },
        select: { eventDate: true },
      });
      const alreadyStored = new Set(existing.map(e => e.eventDate.getTime()));

      const toCreate = candidates
        .filter(c => !alreadyStored.has(c.eventDate.getTime()))
        .map(({ entry, eventDate }) => ({
          personnelId: targetId!,
          eventType: 'DESIGNATION_CHANGE' as const,
          eventDate,
          detailsJson: {
            title: entry.positionTitle,
            department: entry.department || 'DepEd',
            salary: entry.monthlySalary || '',
            salaryGrade: entry.salaryGrade || '',
            status: entry.status || 'Permanent',
            government: Boolean(entry.government),
            dateTo: entry.dateTo || 'Present',
          },
        }));

      if (toCreate.length > 0) {
        await prisma.careerHistoryEntry.createMany({ data: toCreate })
          .catch((err: any) => logger.error({ err, personnelId: targetId }, 'Failed to create career history entries for WES'));
      }
    }
  }

  await prisma.validationLog.create({
    data: {
      entityType: 'Personnel',
      entityId: targetId,
      action: '201_FILE_UPDATED',
      detailsJson: { fields: Object.keys(updateData) },
      userId: req.user?.userId || 0,
      status: 'SUCCESS',
    },
  });
  res.locals.auditLogged = true;

  sendSuccess(res, updated, '201 Information successfully saved to database.');
};

/**
 * GET /personnel — All personnel (admin)
 */
export const getAllPersonnel = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, skip } = getPaginationParams(req.query as Record<string, unknown>);
  const { search, status, excludeAdmin } = req.query;

  const where: Record<string, any> = {};
  if (status) where.status = status;

  if (excludeAdmin === 'true' || excludeAdmin === '1') {
    where.user = {
      role: {
        name: {
          notIn: ['SYSTEM_ADMIN', 'HRMO', 'AO_II'],
        },
      },
    };
  }

  // Scope AO II to strictly see only Teaching and Non-Teaching personnel under their assigned school station/district
  const scope = await getStationScope(req.user);
  if (scope.isScoped) {
    if (!hasStationAssignment(scope)) {
      sendForbidden(res, 'No school assignment is configured for this account.');
      return;
    }
    where.user = { role: { name: { in: STATION_SUBJECT_ROLES } } };
    Object.assign(where, stationPersonnelFilter(scope));
  }

  if (search) {
    const searchFilter = [
      { firstName: { contains: String(search), mode: 'insensitive' } },
      { lastName: { contains: String(search), mode: 'insensitive' } },
      { employeeId: { contains: String(search), mode: 'insensitive' } },
      { designation: { contains: String(search), mode: 'insensitive' } },
    ];
    if (where.OR) {
      where.AND = [
        { OR: where.OR },
        { OR: searchFilter },
      ];
      delete where.OR;
    } else {
      where.OR = searchFilter;
    }
  }

  const [data, total] = await Promise.all([
    prisma.personnel.findMany({ where, skip, take: limit, select: personnelSelectLite, orderBy: { lastName: 'asc' } }),
    prisma.personnel.count({ where }),
  ]);

  sendSuccess(res, data, undefined, 200, buildPaginationMeta(page, limit, total));
};

/**
 * GET /personnel/:id
 */
export const getPersonnelById = async (req: Request, res: Response): Promise<void> => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) {
    sendBadRequest(res, 'Invalid personnel ID.');
    return;
  }

  const personnel = await prisma.personnel.findUnique({
    where: { id: targetId },
    select: personnelSelect,
  });
  if (!personnel) { sendNotFound(res, 'Personnel not found.'); return; }

  const scope = await getStationScope(req.user);
  if (scope.isScoped && scope.personnelId !== targetId) {
    if (!isPersonnelRole(personnel.user?.role?.name) || !isWithinStation(scope, personnel)) {
      sendForbidden(res, 'Access denied. You can only view personnel records under your assigned school station.');
      return;
    }
  }

  sendSuccess(res, personnel);
};

/**
 * GET /personnel/:id/service-record — Return authentic computed service record & timeline for specific personnel
 */
export const getPersonnelServiceRecord = async (req: Request, res: Response): Promise<void> => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) {
    sendBadRequest(res, 'Invalid personnel ID.');
    return;
  }

  const personnel = await prisma.personnel.findUnique({
    where: { id: targetId },
    select: personnelSelect,
  });

  if (!personnel) {
    sendNotFound(res, 'Personnel not found.');
    return;
  }

  const scope = await getStationScope(req.user);
  if (scope.isScoped && scope.personnelId !== targetId) {
    if (!isPersonnelRole(personnel.user?.role?.name) || !isWithinStation(scope, personnel)) {
      sendForbidden(res, 'Access denied. You can only view service records under your assigned school station.');
      return;
    }
  }

  const payload = buildServiceRecordPayload(personnel);
  sendSuccess(res, payload);
};

/**
 * PUT /personnel/:id — Update personnel profile by ID with full 201 field support & DB persistence
 */
export const updatePersonnelById = async (req: Request, res: Response): Promise<void> => {
  const inputError = validatePersonnelInput(req.body);
  if (inputError) { sendBadRequest(res, inputError); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    sendBadRequest(res, 'Invalid personnel ID.');
    return;
  }

  const existingPersonnel = await prisma.personnel.findUnique({
    where: { id },
    include: {
      user: { select: { role: { select: { name: true } } } },
      plantillaItem: { select: { department: true } },
    },
  });
  if (!existingPersonnel) {
    sendNotFound(res, 'Personnel record not found.');
    return;
  }

  const scope = await getStationScope(req.user);
  if (scope.isScoped && scope.personnelId !== id) {
    if (!isPersonnelRole(existingPersonnel.user?.role?.name) || !isWithinStation(scope, existingPersonnel)) {
      sendForbidden(res, 'Access denied. You can only update personnel under your assigned school station.');
      return;
    }
  }

  const updateData: Record<string, unknown> = {};

  if (req.body.firstName !== undefined) updateData.firstName = String(req.body.firstName).trim();
  if (req.body.lastName !== undefined) updateData.lastName = String(req.body.lastName).trim();
  if (req.body.middleName !== undefined) updateData.middleName = req.body.middleName ? String(req.body.middleName).trim() : null;
  if (req.body.suffix !== undefined) updateData.suffix = req.body.suffix ? String(req.body.suffix).trim() : null;
  if (req.body.employeeId !== undefined && req.body.employeeId) updateData.employeeId = String(req.body.employeeId).trim();
  if (req.body.designation !== undefined) updateData.designation = String(req.body.designation).trim();
  if (req.body.contactNumber !== undefined) updateData.contactNumber = req.body.contactNumber ? String(req.body.contactNumber).trim() : null;
  if (req.body.address !== undefined) updateData.address = req.body.address ? String(req.body.address).trim() : null;
  // Reassigning a station moves the record between AO II jurisdictions, so it stays division-level.
  if (!scope.isScoped) {
    if (req.body.school !== undefined) updateData.school = req.body.school ? String(req.body.school).trim() : null;
    if (req.body.district !== undefined) updateData.district = req.body.district ? String(req.body.district).trim() : null;
  }

  if (req.body.birthDate) {
    const d = new Date(req.body.birthDate);
    if (!isNaN(d.getTime())) updateData.birthDate = d;
  }

  if (req.body.dateHired) {
    const d = new Date(req.body.dateHired);
    if (!isNaN(d.getTime())) updateData.dateHired = d;
  }

  if (req.body.gender) {
    const g = req.body.gender.toString().toUpperCase();
    updateData.gender = (g === 'FEMALE') ? 'FEMALE' : (g === 'OTHER') ? 'OTHER' : 'MALE';
  }

  if (req.body.civilStatus) {
    const cs = req.body.civilStatus.toString().toUpperCase();
    const valid = ['SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED'];
    updateData.civilStatus = valid.includes(cs) ? cs : 'SINGLE';
  }

  if (req.body.status) {
    const s = req.body.status.toString().toUpperCase();
    const valid = ['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RETIRED', 'ARCHIVED'];
    updateData.status = valid.includes(s) ? s : 'ACTIVE';
  }

  // Validate Plantilla assignment before entering the atomic update.
  let requestedPlantillaId: number | null | undefined;
  if (req.body.plantillaItemId !== undefined) {
    requestedPlantillaId = req.body.plantillaItemId ? parseInt(String(req.body.plantillaItemId), 10) : null;
    if (requestedPlantillaId !== null && (!Number.isInteger(requestedPlantillaId) || requestedPlantillaId <= 0)) {
      sendBadRequest(res, 'Invalid plantilla item ID.'); return;
    }
    if (requestedPlantillaId) {
      const [item, holder] = await Promise.all([
        prisma.plantillaItem.findUnique({ where: { id: requestedPlantillaId } }),
        prisma.personnel.findFirst({ where: { plantillaItemId: requestedPlantillaId, id: { not: id } }, select: { id: true, employeeId: true } }),
      ]);
      if (!item) { sendNotFound(res, 'Plantilla item not found.'); return; }
      if (holder) {
        sendBadRequest(res, `Plantilla item is already assigned to ${holder.employeeId}. Vacate it through the proper personnel action first.`, 'PLANTILLA_ALREADY_OCCUPIED');
        return;
      }
      const promoLock = await getPlantillaActivePromotionCycle(item);
      if (promoLock.isLocked) {
        sendBadRequest(res, promoLock.reason || `Plantilla item '${item.itemNumber}' is currently open for grab in an active promotion cycle.`, 'PLANTILLA_IN_PROMOTION_CYCLE');
        return;
      }
    }
    updateData.plantillaItemId = requestedPlantillaId;
  }

  // DI-H1: Determine profile completeness
  const isComplete = Boolean(
    (updateData.firstName ?? existingPersonnel.firstName) &&
    (updateData.lastName ?? existingPersonnel.lastName) &&
    (updateData.birthDate ?? existingPersonnel.birthDate) &&
    (updateData.gender ?? existingPersonnel.gender) &&
    (updateData.civilStatus ?? existingPersonnel.civilStatus) &&
    (updateData.contactNumber ?? existingPersonnel.contactNumber) &&
    (updateData.address ?? existingPersonnel.address) &&
    (updateData.designation ?? existingPersonnel.designation) &&
    (updateData.dateHired ?? existingPersonnel.dateHired)
  );
  updateData.profileComplete = isComplete;

  const updated = await prisma.$transaction(async tx => {
    if (requestedPlantillaId !== undefined && requestedPlantillaId !== existingPersonnel.plantillaItemId) {
      if (existingPersonnel.plantillaItemId) await tx.plantillaItem.update({ where: { id: existingPersonnel.plantillaItemId }, data: { isOccupied: false } });
      if (requestedPlantillaId) await tx.plantillaItem.update({ where: { id: requestedPlantillaId }, data: { isOccupied: true } });
    }
    return tx.personnel.update({ where: { id }, data: updateData, select: personnelSelect });
  });

  // Record audit log
  await prisma.validationLog.create({
    data: {
      entityType: 'Personnel',
      entityId: id,
      action: '201_FILE_UPDATED',
      detailsJson: { updatedFields: Object.keys(updateData) },
      userId: req.user?.userId || 0,
      status: 'SUCCESS',
    },
  }).catch((err: any) => logger.error({ err }, 'Failed to log 201_FILE_UPDATED'));
  res.locals.auditLogged = true;

  sendSuccess(res, updated, 'Personnel 201 file changes applied and stored in database successfully.');
};
