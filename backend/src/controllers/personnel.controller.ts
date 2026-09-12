import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { sendSuccess, sendNotFound, sendBadRequest, sendForbidden, getPaginationParams, buildPaginationMeta } from '../utils/response.util';
import { getAOSchoolScope } from '../utils/scope.util';

const personnelSelect = {
  id: true, employeeId: true, firstName: true, lastName: true, middleName: true,
  suffix: true, birthDate: true, gender: true, civilStatus: true, contactNumber: true,
  address: true, designation: true, dateHired: true, status: true, profileComplete: true,
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
};

/**
 * Helper to compute authentic DepEd service record metrics & career timeline from database records
 */
export const buildServiceRecordPayload = (p: any) => {
  const hiredDate = p.dateHired ? new Date(p.dateHired) : new Date(p.createdAt);
  const now = new Date();

  // Precise years and months calculation
  let years = now.getFullYear() - hiredDate.getFullYear();
  let months = now.getMonth() - hiredDate.getMonth();
  if (now.getDate() < hiredDate.getDate()) {
    months--;
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  let yearsInServiceStr = '';
  if (years <= 0 && months <= 0) {
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
  let latestAppointmentDateStr = hiredDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

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
  const currentSG = p.plantillaItem?.salaryGrade ? `SG ${p.plantillaItem.salaryGrade}` : 'SG 11';

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
    },
    serviceRecordDetails: [
      { label: 'Current Position', value: currentPosition, highlight: false },
      { label: 'First Appointment Date', value: hiredDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), highlight: false },
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
      }).catch((err: any) => console.error('Failed to link user personnelId:', err));
    } else {
      // On-the-fly Personnel profile creation for unlinked accounts
      const userRecord = await prisma.user.findUnique({
        where: { id: req.user.userId },
        include: { role: true },
      });

      if (userRecord) {
        const empId = `EMP-2026-${String(userRecord.id).padStart(4, '0')}`;
        const emailPrefix = userRecord.email.split('@')[0];
        const nameParts = emailPrefix.split(/[\._]/);
        const fName = nameParts[0] ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1) : 'Personnel';
        const lName = nameParts[1] ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1) : 'Staff';

        const createdPersonnel = await prisma.personnel.create({
          data: {
            userId: userRecord.id,
            employeeId: empId,
            firstName: fName,
            lastName: lName,
            designation: userRecord.role?.name === 'TEACHING_PERSONNEL' ? 'Teacher I' : 'Administrative Assistant II',
            birthDate: new Date('1990-01-01'),
            gender: 'MALE',
            civilStatus: 'SINGLE',
            dateHired: new Date(),
            status: 'ACTIVE',
            profileComplete: true,
          },
        });

        await prisma.user.update({
          where: { id: userRecord.id },
          data: { personnelId: createdPersonnel.id },
        });

        personnel = await prisma.personnel.findUnique({
          where: { id: createdPersonnel.id },
          select: personnelSelect,
        });
      }
    }
  }

  if (!personnel) {
    sendNotFound(res, 'Personnel profile not found.');
    return;
  }

  sendSuccess(res, personnel);
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
export const updateMyProfile = async (req: Request, res: Response): Promise<void> => {
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

    if (pRecord) {
      targetId = pRecord.id;
    } else {
      // Auto-create personnel record if not linked yet
      const userRecord = await prisma.user.findUnique({
        where: { id: req.user.userId },
        include: { role: true },
      });

      if (userRecord) {
        const empId = `EMP-2026-${String(userRecord.id).padStart(4, '0')}`;
        const createdPersonnel = await prisma.personnel.create({
          data: {
            userId: userRecord.id,
            employeeId: empId,
            firstName: req.body.firstName || 'Personnel',
            lastName: req.body.lastName || 'Staff',
            designation: userRecord.role?.name === 'TEACHING_PERSONNEL' ? 'Teacher I' : 'Administrative Assistant II',
            birthDate: req.body.birthDate ? new Date(req.body.birthDate) : new Date('1990-01-01'),
            gender: (req.body.gender?.toString().toUpperCase() === 'FEMALE') ? 'FEMALE' : 'MALE',
            civilStatus: 'SINGLE',
            dateHired: new Date(),
            status: 'ACTIVE',
            profileComplete: true,
          },
        });

        await prisma.user.update({
          where: { id: userRecord.id },
          data: { personnelId: createdPersonnel.id },
        });

        targetId = createdPersonnel.id;
      }
    }
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

  const allowedFields = [
    'firstName', 'lastName', 'middleName', 'suffix',
    'birthDate', 'gender', 'civilStatus', 'contactNumber', 'address',
    'designation', 'dateHired'
  ];
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
  if (!updateData['designation'] && req.body.position) {
    updateData['designation'] = String(req.body.position).trim();
  }
  if (!updateData['dateHired'] && req.body.firstDayOfService) {
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

  // If WES entries are provided, persist them into CareerHistoryEntry records
  if (Array.isArray(req.body.wes) && req.body.wes.length > 0) {
    for (const entry of req.body.wes) {
      if (entry && entry.positionTitle && entry.dateFrom) {
        const parsedDate = new Date(entry.dateFrom);
        if (!isNaN(parsedDate.getTime())) {
          const existingCh = await prisma.careerHistoryEntry.findFirst({
            where: {
              personnelId: targetId,
              eventDate: parsedDate,
            },
          });
          if (!existingCh) {
            await prisma.careerHistoryEntry.create({
              data: {
                personnelId: targetId,
                eventType: 'DESIGNATION_CHANGE',
                eventDate: parsedDate,
                detailsJson: {
                  title: entry.positionTitle,
                  department: entry.department || 'DepEd',
                  salary: entry.monthlySalary || '',
                  salaryGrade: entry.salaryGrade || '',
                  status: entry.status || 'Permanent',
                  government: Boolean(entry.government),
                  dateTo: entry.dateTo || 'Present',
                },
              },
            }).catch((err: any) => console.error('Failed to create career history entry for WES:', err));
          }
        }
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

  sendSuccess(res, updated, '201 Information successfully saved to database.');
};

/**
 * GET /personnel — All personnel (admin)
 */
export const getAllPersonnel = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, skip } = getPaginationParams(req.query as Record<string, unknown>);
  const { search, status } = req.query;

  const where: Record<string, any> = {};
  if (status) where.status = status;

  // Scope AO II to only see personnel under their assigned school station
  const scope = await getAOSchoolScope(req.user);
  if (scope.isAo) {
    if (scope.schoolName) {
      where.OR = [
        { id: scope.aoPersonnelId },
        { address: { contains: scope.schoolName, mode: 'insensitive' } },
        { designation: { contains: scope.schoolName, mode: 'insensitive' } },
      ];
    } else if (scope.aoPersonnelId) {
      where.id = scope.aoPersonnelId;
    }
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

  const scope = await getAOSchoolScope(req.user);
  if (scope.isAo && scope.aoPersonnelId !== targetId) {
    const text = `${personnel.address || ''} ${personnel.designation || ''}`;
    if (!scope.schoolName || !text.toLowerCase().includes(scope.schoolName.toLowerCase())) {
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

  const payload = buildServiceRecordPayload(personnel);
  sendSuccess(res, payload);
};

/**
 * PUT /personnel/:id — Update personnel profile by ID with full 201 field support & DB persistence
 */
export const updatePersonnelById = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    sendBadRequest(res, 'Invalid personnel ID.');
    return;
  }

  const existingPersonnel = await prisma.personnel.findUnique({ where: { id } });
  if (!existingPersonnel) {
    sendNotFound(res, 'Personnel record not found.');
    return;
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

  // Handle Plantilla Item update & synchronization
  if (req.body.plantillaItemId !== undefined) {
    const newPlantillaId = req.body.plantillaItemId ? parseInt(String(req.body.plantillaItemId), 10) : null;
    const oldPlantillaId = existingPersonnel.plantillaItemId;

    if (newPlantillaId !== oldPlantillaId) {
      if (oldPlantillaId) {
        // Mark old plantilla item vacant
        await prisma.plantillaItem.update({
          where: { id: oldPlantillaId },
          data: { isOccupied: false },
        }).catch((err: any) => console.error('Failed to vacate old plantilla item:', err));
      }

      if (newPlantillaId) {
        // Mark new plantilla item occupied
        await prisma.plantillaItem.update({
          where: { id: newPlantillaId },
          data: { isOccupied: true },
        }).catch((err: any) => console.error('Failed to occupy new plantilla item:', err));
      }

      updateData.plantillaItemId = newPlantillaId;
    }
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

  const updated = await prisma.personnel.update({
    where: { id },
    data: updateData,
    select: personnelSelect,
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
  }).catch((err: any) => console.error('Failed to log 201_FILE_UPDATED:', err));

  sendSuccess(res, updated, 'Personnel 201 file changes applied and stored in database successfully.');
};
