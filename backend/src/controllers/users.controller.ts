import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { hashPassword, validatePasswordComplexity } from '../utils/hash.util';
import {
  sendSuccess, sendCreated, sendError, sendNotFound, sendBadRequest, sendForbidden,
  getPaginationParams, buildPaginationMeta,
} from '../utils/response.util';
import { Prisma, UserRole, AccountStatus, PersonnelDocumentStatus } from '@prisma/client';
import { notifyUserNotifications } from './notifications.controller';
import {
  getStationScope,
  sameStation,
  userInScope,
  userReviewFilter,
  STATION_SUBJECT_ROLES,
} from '../utils/scope.util';
import { validateAccountInput, validatePersonnelInput, isPersonnelRole } from '../utils/personnel-validation.util';
import { canAssignRole, canChangeRole, canManageAccount, MANAGE_REFUSAL, ROLE_REFUSAL } from '../utils/role-assignment.util';
import { denyOutOfScope } from '../utils/access-denial.util';
import { getPlantillaActivePromotionCycle } from '../utils/deped.util';
import { processWorkflowOutbox, queueTransactionalEmail } from '../services/workflow-outbox.service';
import { config } from '../config';
import { logger } from '../utils/logger';
import { generateInitialPassword } from '../utils/password-issue.util';
import { invalidateAuthUserCache } from '../middleware/auth.middleware';
import { initializePersonnelDocuments } from './personnel-documents.controller';
import { isValidPersonnelDocumentFile } from '../middleware/personnel-document-upload.middleware';
import { extractWithTesseract } from '../services/tesseract-ocr.service';
import { mapTrustedOcrFields } from '../utils/document-extraction.util';
import { discardUncommittedDocument, storeDocument } from '../services/document-storage.service';

/**
 * GET /users — List all users with pagination and filtering
 */
export const getUsers = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, skip } = getPaginationParams(req.query as Record<string, unknown>);
  const { role, search } = req.query;

  // Every condition is ANDed, so role, search and paging only narrow the scope.
  const conditions: Prisma.UserWhereInput[] = [];
  if (role) conditions.push({ role: { name: role as UserRole } });

  // An AO II manages the teaching and non-teaching accounts of their own station.
  const scope = await getStationScope(req.user);
  if (scope.isScoped) {
    conditions.push({ role: { name: { in: STATION_SUBJECT_ROLES } } }, userReviewFilter(scope));
  }

  if (search) {
    const q = String(search);
    conditions.push({
      OR: [
        { email: { contains: q, mode: 'insensitive' } },
        { personnel: { firstName: { contains: q, mode: 'insensitive' } } },
        { personnel: { lastName: { contains: q, mode: 'insensitive' } } },
        { personnel: { employeeId: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }

  const where: Prisma.UserWhereInput = conditions.length ? { AND: conditions } : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      select: {
        id: true, email: true, accountStatus: true, createdAt: true, lastLogin: true,
        mustChangePassword: true, lockedUntil: true,
        role: { select: { name: true } },
        personnel: { select: { id: true, firstName: true, lastName: true, employeeId: true, designation: true, address: true, school: true, district: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  sendSuccess(res, users.map(u => ({
    id: u.id,
    email: u.email,
    role: u.role.name,
    accountStatus: u.accountStatus,
    mustChangePassword: u.mustChangePassword,
    lockedUntil: u.lockedUntil,
    lastLogin: u.lastLogin,
    createdAt: u.createdAt,
    personnel: u.personnel,
  })), undefined, 200, buildPaginationMeta(page, limit, total));
};

/**
 * Helper to auto-generate unique Employee Numbers for Personnel (Collision-Proof, DI-C1 & PERF-L1)
 */
export const generateEmployeeNumber = async (txClient: any = prisma): Promise<string> => {
  const currentYear = new Date().getFullYear();
  const prefix = `EMP-${currentYear}-`;

  const latest = await txClient.personnel.findFirst({
    where: { employeeId: { startsWith: prefix } },
    orderBy: { employeeId: 'desc' },
    select: { employeeId: true },
  });

  let nextSeq = 101;
  if (latest?.employeeId) {
    const parts = latest.employeeId.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextSeq = lastNum + 1;
    }
  }

  let candidateId = `${prefix}${String(nextSeq).padStart(4, '0')}`;
  let attempts = 0;
  while (attempts < 10) {
    const exists = await txClient.personnel.findFirst({
      where: { employeeId: candidateId },
      select: { id: true },
    });
    if (!exists) return candidateId;
    nextSeq++;
    candidateId = `${prefix}${String(nextSeq).padStart(4, '0')}`;
    attempts++;
  }

  // Fallback random 4-digit suffix if sequential slots collision occurs
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${randomSuffix}`;
};

/**
 * POST /users — Create a new user account (SysAdmin direct creation)
 */
export const createUser = async (req: Request, res: Response): Promise<void> => {
  const {
    email, password, role, personnelId,
    firstName, lastName, middleName, suffix,
    birthDate, gender, civilStatus, contactNumber, address,
    designation, dateHired, district, schoolAssignment,
    plantillaItemId,
  } = req.body;

  if (!email || !password || !role) {
    sendBadRequest(res, 'Email, password, and role are required.');
    return;
  }
  const inputError = validateAccountInput(req.body);
  if (inputError) { sendBadRequest(res, inputError); return; }

  const passwordCheck = validatePasswordComplexity(password);
  if (!passwordCheck.valid) {
    sendBadRequest(res, passwordCheck.message!);
    return;
  }

  if (!Object.values(UserRole).includes(role as UserRole)) {
    sendBadRequest(res, `Invalid role. Must be one of: ${Object.values(UserRole).join(', ')}`);
    return;
  }
  if (!canAssignRole(req.user?.role, role)) {
    sendForbidden(res, ROLE_REFUSAL);
    return;
  }

  const cleanEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
  if (existing) {
    sendBadRequest(res, 'A user with this email already exists.', 'DUPLICATE_EMAIL');
    return;
  }

  const roleRecord = await prisma.role.findUnique({ where: { name: role as UserRole } });
  if (!roleRecord) {
    sendBadRequest(res, 'Role not found.');
    return;
  }

  const passwordHash = await hashPassword(password);

  // Execute User & Personnel creation atomically
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(201, 1)`;
    let targetPersonnelId = personnelId ? parseInt(personnelId, 10) : undefined;
    let generatedEmployeeId: string | undefined;

    // Validate and acquire Plantilla Item if provided
    let targetPlantillaItem: any = null;
    if (plantillaItemId) {
      const parsedPlantillaId = parseInt(String(plantillaItemId), 10);
      if (!isNaN(parsedPlantillaId)) {
        targetPlantillaItem = await tx.plantillaItem.findUnique({
          where: { id: parsedPlantillaId },
          include: { occupiedByPersonnel: { select: { id: true } } },
        });
        if (!targetPlantillaItem) {
          throw new Error(`Plantilla item #${plantillaItemId} does not exist.`);
        }
        if (targetPlantillaItem.occupiedByPersonnel) {
          throw new Error(`Plantilla item '${targetPlantillaItem.itemNumber}' is already occupied.`);
        }
        const promoLock = await getPlantillaActivePromotionCycle(targetPlantillaItem, tx);
        if (promoLock.isLocked) {
          throw new Error(promoLock.reason || `Plantilla item '${targetPlantillaItem.itemNumber}' is currently open for grab in an active promotion cycle and cannot be assigned to an account.`);
        }
      }
    }

    const newUser = await tx.user.create({
      data: {
        email: cleanEmail,
        passwordHash,
        roleId: roleRecord.id,
        accountStatus: req.body.distributeImmediately ? 'ACTIVE' : 'PENDING',
        // Whoever typed this password knows it, so it is good for one thing only:
        // signing in to replace it.
        mustChangePassword: true,
      },
      include: { role: { select: { name: true } } },
    });

    if (targetPersonnelId) {
      // Claiming an existing personnel record. This used to write only the
      // account side, so the record went on naming whichever account held it
      // before - and authorization reads this link. Check it is real and
      // unclaimed, then move it.
      const claimable = await tx.personnel.findUnique({
        where: { id: targetPersonnelId },
        select: { id: true, user: { select: { id: true, email: true, accountStatus: true } } },
      });
      if (!claimable) {
        throw new Error(`Personnel record #${targetPersonnelId} does not exist.`);
      }
      if (claimable.user.accountStatus !== 'INACTIVE') {
        throw new Error(`Personnel record #${targetPersonnelId} already belongs to the active account ${claimable.user.email}. Deactivate that account before reassigning the record.`);
      }
      await tx.personnel.update({
        where: { id: targetPersonnelId },
        data: { userId: newUser.id },
      });
    } else {
      generatedEmployeeId = await generateEmployeeNumber(tx);

      // School & District preference for AO and Division-level accounts
      const isDivisionLevel = role === 'HRMO' || role === 'SYSTEM_ADMIN';
      const finalFirstName = role === 'AO_II' ? 'AO II' : String(firstName).trim();
      const finalLastName = role === 'AO_II' ? String(schoolAssignment).trim() : String(lastName).trim();
      const finalDesignation = targetPlantillaItem
        ? targetPlantillaItem.positionTitle
        : (designation || (
          role === 'AO_II'
            ? (schoolAssignment ? `Administrative Officer II - ${schoolAssignment}${district ? ` (${district})` : ''}` : 'Administrative Officer II')
            : role === 'HRMO'
              ? 'HRMO Approver / Manager'
              : role === 'SYSTEM_ADMIN'
                ? 'System Administrator'
                : role === 'TEACHING_PERSONNEL'
                  ? 'Teacher I'
                  : 'Administrative Assistant II'
        ));
      const finalAddress = isDivisionLevel
        ? (role === 'HRMO' ? 'Schools Division Office, SDO Koronadal City' : 'ICT Unit, Schools Division Office, SDO Koronadal City')
        : (address || (
          targetPlantillaItem?.department
            ? `${targetPlantillaItem.department}, ${district || targetPlantillaItem.division || 'Division Office'}`
            : (schoolAssignment ? `${schoolAssignment}${district ? `, ${district}` : ''}` : null)
        ));

      const newPersonnel = await tx.personnel.create({
        data: {
          userId: newUser.id,
          employeeId: generatedEmployeeId,
          firstName: finalFirstName,
          lastName: finalLastName,
          middleName: role === 'AO_II' ? null : middleName || null,
          suffix: role === 'AO_II' ? null : suffix || null,
          designation: finalDesignation,
          birthDate: role === 'AO_II' ? null : new Date(birthDate),
          gender: role === 'AO_II' ? null : gender,
          civilStatus: role === 'AO_II' ? null : civilStatus,
          contactNumber: contactNumber || null,
          address: finalAddress,
          school: isDivisionLevel ? null : (targetPlantillaItem?.department || schoolAssignment || null),
          district: isDivisionLevel ? null : (district || targetPlantillaItem?.division || null),
          status: 'ACTIVE',
          dateHired: dateHired ? new Date(dateHired) : null,
          plantillaItemId: targetPlantillaItem ? targetPlantillaItem.id : undefined,
          profileComplete: role === 'AO_II' || Boolean(firstName && lastName && birthDate && gender && civilStatus && contactNumber && finalAddress && dateHired),
        },
      });

      targetPersonnelId = newPersonnel.id;

      // Creating the personnel record above bound the item; log the audit entry.
      if (targetPlantillaItem) {
        await tx.validationLog.create({
          data: {
            entityType: 'PlantillaItem',
            entityId: targetPlantillaItem.id,
            action: 'PLANTILLA_ITEM_ASSIGNED',
            detailsJson: {
              itemNumber: targetPlantillaItem.itemNumber,
              positionTitle: targetPlantillaItem.positionTitle,
              salaryGrade: targetPlantillaItem.salaryGrade,
              station: targetPlantillaItem.department,
              assignedPersonnelId: newPersonnel.id,
              personnelName: `${finalFirstName} ${finalLastName}`,
              source: 'DIRECT_ACCOUNT_CREATION',
            },
            userId: req.user!.userId,
            ipAddress: req.ip,
            status: 'SUCCESS',
          },
        });
      }
    }

    if (targetPersonnelId) {
      await initializePersonnelDocuments(targetPersonnelId, role, tx);
    }

    await tx.validationLog.create({
      data: {
        entityType: 'User',
        entityId: newUser.id,
        action: 'USER_CREATED',
        detailsJson: { email, role, employeeId: generatedEmployeeId },
        userId: req.user!.userId,
        ipAddress: req.ip,
        status: 'SUCCESS',
      },
    });

    // The outbox insert belongs in the same transaction as the account it
    // describes. Queued outside it, a queue failure left a usable account behind
    // while the request reported failure and no email was ever sent.
    const accountIsUsableNow = newUser.accountStatus === 'ACTIVE';
    await queueTransactionalEmail(
      `user:${newUser.id}:created`,
      {
        recipientEmail: newUser.email,
        recipientName: firstName && lastName ? `${firstName} ${lastName}` : newUser.email,
        subject: accountIsUsableNow
          ? 'Your Digital 201 account is ready'
          : 'Your Digital 201 account has been created',
        heading: accountIsUsableNow ? 'Account ready' : 'Account created',
        message: accountIsUsableNow
          ? `Your Digital 201 account (employee ID ${generatedEmployeeId}) is active. Sign in with the credentials below and change your password immediately.`
          : `Your Digital 201 account has been created with employee ID ${generatedEmployeeId}. It is not active yet — your authorized AO or System Administrator will send your sign-in details once access is distributed. There is nothing for you to do right now.`,
        reference: generatedEmployeeId,
        // Credentials and a sign-in button only once the account can actually be
        // used; a PENDING account cannot log in, so sending them invites failure.
        ...(accountIsUsableNow
          ? {
              credentials: { username: newUser.email, initialPassword: String(password) },
              actionLabel: 'Open Digital 201',
              actionUrl: `${config.clientUrl}/login`,
            }
          : {}),
      },
      tx,
    );

    return { newUser, generatedEmployeeId };
  });
  void processWorkflowOutbox();

  sendCreated(res, {
    id: result.newUser.id,
    email: result.newUser.email,
    role: result.newUser.role.name,
    employeeId: result.generatedEmployeeId,
    accountStatus: result.newUser.accountStatus,
  }, 'User created successfully with generated employee number.');
};

/**
 * GET /users/:id — Get user by ID
 */
export const getUserById = async (req: Request, res: Response): Promise<void> => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) {
    sendBadRequest(res, 'Invalid user ID.');
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true, email: true, accountStatus: true, createdAt: true, lastLogin: true,
      role: { select: { name: true } },
      personnel: { select: { id: true, firstName: true, lastName: true, employeeId: true, designation: true, address: true, school: true, district: true } },
    },
  });

  if (!user) { sendNotFound(res, 'User not found.'); return; }

  if (targetId !== req.user?.userId && !(await userInScope(await getStationScope(req.user), targetId))) {
    await denyOutOfScope(req, res, { entityType: 'User', entityId: targetId, action: 'USER_VIEW' }, 'User not found.');
    return;
  }

  sendSuccess(res, user);
};

/**
 * PUT /users/:id — Update user
 */
export const updateUser = async (req: Request, res: Response): Promise<void> => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    sendBadRequest(res, 'Invalid user ID.');
    return;
  }

  const { email, role, accountStatus } = req.body;
  const inputError = validatePersonnelInput({ email });
  if (inputError) { sendBadRequest(res, inputError); return; }
  if (role && !['SYSTEM_ADMIN', 'HRMO', 'AO_II', 'TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'].includes(role)) { sendBadRequest(res, 'Select a supported role.'); return; }

  const existing = await prisma.user.findUnique({ where: { id: userId }, include: { role: { select: { name: true } } } });
  if (!existing) { sendNotFound(res, 'User not found.'); return; }
  if (!canManageAccount(req.user?.role, existing.role.name)) { sendForbidden(res, MANAGE_REFUSAL); return; }
  if (role && role !== existing.role.name && !canChangeRole(req.user?.role, existing.role.name, role)) {
    sendForbidden(res, ROLE_REFUSAL);
    return;
  }
  if (userId === req.user!.userId && ((accountStatus && accountStatus !== existing.accountStatus) || role)) {
    sendBadRequest(res, 'You cannot change the status or role of your own account.');
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (email) {
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== existing.email) {
      const taken = await prisma.user.findUnique({ where: { email: cleanEmail }, select: { id: true } });
      if (taken) { sendBadRequest(res, 'Another account already uses this email address.', 'DUPLICATE_EMAIL'); return; }
    }
    updateData.email = cleanEmail;
  }
  if (accountStatus && Object.values(AccountStatus).includes(accountStatus)) {
    updateData.accountStatus = accountStatus;
  }
  if (role) {
    const roleRecord = await prisma.role.findUnique({ where: { name: role as UserRole } });
    if (roleRecord) updateData.roleId = roleRecord.id;
  }

  // A role is an authorization scope. Sessions issued under the old one end,
  // so every client must re-authenticate and drop what it cached.
  const roleChanged = typeof updateData.roleId === 'number' && updateData.roleId !== existing.roleId;
  // Deactivating ends the account's sessions as well, not just future sign-ins.
  const deactivated = updateData.accountStatus === 'INACTIVE' && existing.accountStatus !== 'INACTIVE';
  const updated = await prisma.$transaction(async tx => {
    const row = await tx.user.update({
      where: { id: userId },
      data: updateData,
      include: { role: { select: { name: true } } },
    });
    if (roleChanged || deactivated) {
      await tx.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } });
    }
    return row;
  });
  // authenticate() caches role and status for 30s; the change applies from the next request.
  invalidateAuthUserCache(userId);

  await prisma.validationLog.create({
    data: {
      entityType: 'User',
      entityId: userId,
      action: 'USER_UPDATED',
      detailsJson: { changes: updateData } as any,
      userId: req.user!.userId,
      status: 'SUCCESS',
    },
  });

  sendSuccess(res, { id: updated.id, email: updated.email, role: updated.role.name, accountStatus: updated.accountStatus }, 'User updated successfully.');
};

/**
 * DELETE /users/:id — Delete user (DI-C2: Safe cascade & audit preservation)
 */
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    sendBadRequest(res, 'Invalid user ID.');
    return;
  }

  if (userId === req.user!.userId) {
    sendBadRequest(res, 'You cannot delete your own account.');
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: { select: { name: true } },
      personnel: {
        include: {
          transactions: { select: { id: true } },
          careerHistoryEntries: { select: { id: true } },
          promotionApplications: { select: { id: true } },
        },
      },
    },
  });

  if (!existing) {
    sendNotFound(res, 'User not found.');
    return;
  }
  if (!canManageAccount(req.user?.role, existing.role.name)) { sendForbidden(res, MANAGE_REFUSAL); return; }

  // If the user has active transactions or promotion records, deactivate to preserve audit history
  const hasHistory =
    (existing.personnel?.transactions?.length ?? 0) > 0 ||
    (existing.personnel?.promotionApplications?.length ?? 0) > 0;

  if (hasHistory) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { accountStatus: 'INACTIVE' },
      }),
      prisma.refreshToken.deleteMany({ where: { userId } }),
      prisma.validationLog.create({
        data: {
          entityType: 'User',
          entityId: userId,
          action: 'USER_DEACTIVATED_PRESERVED_TRAIL',
          detailsJson: { reason: 'Deactivated to INACTIVE instead of hard-deleted to preserve transaction/audit history' },
          userId: req.user!.userId,
          status: 'SUCCESS',
        },
      }),
    ]);
    sendSuccess(res, { id: userId, accountStatus: 'INACTIVE' }, 'User account has existing transaction history and was set to INACTIVE to preserve government audit records.');
    return;
  }

  // Safe hard delete: clean up dependent transient records first
  await prisma.$transaction(async (tx) => {
    // The account and its personnel record are joined by personnel.user_id
    // alone, so there is no longer a circular reference to break first.

    // 1. Remove refresh tokens & used magic tokens
    await tx.refreshToken.deleteMany({ where: { userId } });
    await tx.usedMagicToken.deleteMany({ where: { userId } });

    // 2. Remove user notifications
    await tx.notification.deleteMany({ where: { userId } });

    // 3. Disassociate uploaded / validated documents
    await tx.uploadedDocument.updateMany({
      where: { uploadedByUserId: userId },
      data: { uploadedByUserId: req.user!.userId },
    });
    await tx.uploadedDocument.updateMany({
      where: { validatedByUserId: userId },
      data: { validatedByUserId: null },
    });

    // 4. Disassociate account creation requests
    await tx.accountCreationRequest.updateMany({
      where: { createdUserId: userId },
      data: { createdUserId: null },
    });
    await tx.accountCreationRequest.deleteMany({
      where: { requestedByUserId: userId },
    });

    // 5. Compliance checks performed by this user
    await tx.complianceCheck.deleteMany({
      where: { checkedByUserId: userId },
    });

    // 6. Unassign assigned transactions
    await tx.transaction.updateMany({
      where: { currentAssigneeId: userId },
      data: { currentAssigneeId: null },
    });

    // 7. Delete linked personnel if clean
    if (existing.personnel) {
      await tx.careerHistoryEntry.deleteMany({ where: { personnelId: existing.personnel.id } });
      // Deleting the occupant is what vacates the item.
      await tx.personnel.delete({ where: { id: existing.personnel.id } });
    }

    // 8. Delete validation logs for this user
    await tx.validationLog.deleteMany({ where: { userId } });

    // 9. Delete user record
    await tx.user.delete({ where: { id: userId } });
  });

  await prisma.validationLog.create({
    data: {
      entityType: 'User',
      entityId: userId,
      action: 'USER_DELETED',
      userId: req.user!.userId,
      status: 'SUCCESS',
    },
  }).catch((err: any) => logger.error({ err }, 'Failed to log USER_DELETED'));

  res.status(204).send();
};

/**
 * POST /users/:id/distribute-credentials — AO II / SysAdmin distributes credentials
 */
export const distributeCredentials = async (req: Request, res: Response): Promise<void> => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    sendBadRequest(res, 'Invalid user ID.');
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true, personnel: true } });
  if (!user) { sendNotFound(res, 'User not found.'); return; }
  if (!canManageAccount(req.user?.role, user.role.name)) { sendForbidden(res, MANAGE_REFUSAL); return; }

  if (!(await userInScope(await getStationScope(req.user), userId))) {
    await denyOutOfScope(req, res, { entityType: 'User', entityId: userId, action: 'CREDENTIALS_DISTRIBUTE' }, 'User not found.');
    return;
  }
  if (user.accountStatus !== 'PENDING') { sendBadRequest(res, 'Only pending accounts can receive initial credentials.'); return; }

  // Update account status to ACTIVE
  await prisma.user.update({
    where: { id: userId },
    data: { accountStatus: 'ACTIVE' },
  });

  // Create notification
  await prisma.notification.create({
    data: {
      userId,
      message: 'Your account credentials have been distributed. Please log in and change your password.',
      type: 'INFO',
    },
  });

  await prisma.validationLog.create({
    data: {
      entityType: 'User',
      entityId: userId,
      action: 'CREDENTIALS_DISTRIBUTED',
      userId: req.user!.userId,
      status: 'SUCCESS',
    },
  });

  // Distribution flips accountStatus to ACTIVE, which authenticate() caches for
  // 30s. Without this the account keeps being refused as PENDING after it is live.
  invalidateAuthUserCache(userId);
  notifyUserNotifications(userId);
  await queueTransactionalEmail(`user:${user.id}:credentials-distributed`, {
    recipientEmail: user.email,
    recipientName: user.personnel ? `${user.personnel.firstName} ${user.personnel.lastName}` : user.email,
    subject: 'Your Digital 201 account is ready',
    heading: 'Account access has been distributed',
    message: 'Your Digital 201 account is now active. Sign in using the credentials issued through your authorized AO or System Administrator, then change your temporary password.',
    reference: `User account ${user.id}`,
    actionLabel: 'Open Digital 201',
    actionUrl: `${config.clientUrl}/login`,
  });
  void processWorkflowOutbox();
  sendSuccess(res, null, `Credentials distribution initiated for user ${userId}.`);
};

/**
 * POST /users/:id/reset-password — System Admin resets user credentials
 */
export const resetUserPassword = async (req: Request, res: Response): Promise<void> => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    sendBadRequest(res, 'Invalid user ID.');
    return;
  }

  const { newPassword } = req.body;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { select: { name: true } }, personnel: { select: { firstName: true, lastName: true, employeeId: true } } },
  });
  if (!user) { sendNotFound(res, 'User not found.'); return; }
  // The caller receives the new password, so this is as strong as a sign-in.
  if (!canManageAccount(req.user?.role, user.role.name)) { sendForbidden(res, MANAGE_REFUSAL); return; }

  // Math.random() is not a cryptographic source and the old shape was guessable
  // from one example. Generate unless the administrator supplied a specific value.
  const tempPassword = newPassword || generateInitialPassword();

  const passwordCheck = validatePasswordComplexity(tempPassword);
  if (!passwordCheck.valid) {
    sendBadRequest(res, passwordCheck.message!);
    return;
  }

  const passwordHash = await hashPassword(tempPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        // The administrator knows this one too.
        mustChangePassword: true,
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId },
      data: { revoked: true },
    }),
    // SEC-H3: Do not persist temporary password plaintext in notification records
    prisma.notification.create({
      data: {
        userId,
        message: `Your account password has been reset by the System Administrator. Please use the temporary credentials provided to you to log in and update your password immediately.`,
        type: 'WARNING',
      },
    }),
    prisma.validationLog.create({
      data: {
        entityType: 'User',
        entityId: userId,
        action: 'PASSWORD_RESET_BY_ADMIN',
        detailsJson: { email: user.email, resetBy: req.user!.userId },
        userId: req.user!.userId,
        ipAddress: req.ip,
        status: 'SUCCESS',
      },
    }),
  ]);

  // The new hash and the re-armed forced-change flag must take effect at once,
  // not when the 30s auth cache happens to expire.
  invalidateAuthUserCache(userId);
  notifyUserNotifications(userId);
  sendSuccess(res, {
    userId: user.id,
    email: user.email,
    tempPassword,
    employeeId: user.personnel?.employeeId,
  }, `Password for ${user.email} reset successfully.`);
};

/**
 * POST /users/requests — AO II submits an account creation request for personnel
 */
export const extractAccountRequestPds = async (req: Request, res: Response): Promise<void> => {
  if (!isValidPersonnelDocumentFile(req.file)) {
    sendBadRequest(res, 'Choose a valid PDS PDF, PNG or JPEG up to 10 MB.');
    return;
  }
  try {
    const result = await extractWithTesseract(req.file.buffer, req.file.mimetype, 'PDS');
    const extracted = mapTrustedOcrFields('PDS', result.fields, result.confidence);
    if (!Object.values(extracted.fields).some(value => typeof value === 'string' && value.trim())) {
      throw new Error('No supported identity fields could be read from this PDS. The file can still be attached and the details entered manually.');
    }
    sendSuccess(res, {
      fields: extracted.fields,
      confidence: extracted.confidence,
      fileName: req.file.originalname,
    }, 'PDS fields extracted. Review every field before submitting the request.');
  } catch (error: any) {
    logger.warn({ err: error, userId: req.user?.userId }, 'Account-request PDS extraction failed');
    sendBadRequest(res, error?.message || 'The PDS could not be read. You may still enter the details manually.');
  }
};

export const submitAccountRequest = async (req: Request, res: Response): Promise<void> => {
  if (typeof req.body.nonPlantilla === 'string') req.body.nonPlantilla = req.body.nonPlantilla === 'true';
  const inputError = validateAccountInput(req.body);
  if (inputError) { sendBadRequest(res, inputError); return; }
  if (!isPersonnelRole(req.body.role)) { sendBadRequest(res, 'Only teaching and non-teaching personnel accounts can be requested.'); return; }
  const {
    firstName, lastName, middleName, suffix, email,
    birthDate, gender, civilStatus, contactNumber, address,
    role, designation, school, initialPassword
  } = req.body;

  if (!email || !initialPassword || !firstName || !lastName || !birthDate || !gender || !civilStatus || !designation) {
    sendBadRequest(res, 'First name, last name, birth date, gender, civil status, designation, official email, and initial password are required.');
    return;
  }

  if (req.file && !isValidPersonnelDocumentFile(req.file)) {
    sendBadRequest(res, 'Choose a valid PDS PDF, PNG or JPEG up to 10 MB.');
    return;
  }

  const administrativeRoles = ['AO_II', 'HRMO', 'SYSTEM_ADMIN'];
  if (role && administrativeRoles.includes(role)) {
    sendBadRequest(res, 'Administrative Officers (AO II) cannot request account creation for administrative roles. Only Teaching and Non-Teaching accounts are permitted.');
    return;
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const passwordCheck = validatePasswordComplexity(String(initialPassword));
  if (!passwordCheck.valid) { sendBadRequest(res, passwordCheck.message!); return; }
  const parsedBirthDate = new Date(birthDate);
  if (isNaN(parsedBirthDate.getTime()) || parsedBirthDate >= new Date()) { sendBadRequest(res, 'Enter a valid birth date.'); return; }

  // 1. Check if user email already exists
  const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
  if (existingUser) {
    sendBadRequest(res, `A user account with email "${cleanEmail}" already exists.`, 'DUPLICATE_EMAIL');
    return;
  }

  // 2. Check if a pending request for this email already exists
  const existingPending = await prisma.accountCreationRequest.findFirst({
    where: { email: cleanEmail, status: 'PENDING' },
  });
  if (existingPending) {
    sendBadRequest(res, `A pending account creation request for email "${cleanEmail}" already exists.`, 'DUPLICATE_REQUEST');
    return;
  }

  let finalSchool = school;
  let finalDistrict = req.body.district || null;
  let finalAddress = address;
  let finalDesignation = designation || 'Teacher I';

  if (role === 'HRMO' || role === 'SYSTEM_ADMIN') {
    finalSchool = null;
    finalDistrict = null;
    finalAddress = role === 'HRMO' ? 'Schools Division Office, SDO Koronadal City' : 'ICT Unit, Schools Division Office, SDO Koronadal City';
  }

  if (req.body.plantillaItemId) {
    const pId = parseInt(String(req.body.plantillaItemId), 10);
    if (!isNaN(pId)) {
      const pItem = await prisma.plantillaItem.findUnique({
        where: { id: pId },
        include: { occupiedByPersonnel: { select: { id: true } } },
      });
      if (!pItem || pItem.occupiedByPersonnel) { sendBadRequest(res, 'Select an available plantilla item.'); return; }
      const promoLock = await getPlantillaActivePromotionCycle(pItem);
      if (promoLock.isLocked) {
        sendBadRequest(res, promoLock.reason || `Plantilla item '${pItem.itemNumber}' is currently open for grab in an active promotion cycle.`);
        return;
      }
      if (pItem) {
        finalDesignation = `${pItem.positionTitle} [Item #${pItem.itemNumber}]`;
        finalSchool = pItem.department;
        finalDistrict = finalDistrict || pItem.division;
      }
    }
  }

  if (req.user?.role === 'AO_II') {
    const scope = await getStationScope(req.user);
    if (scope.kind !== 'STATION' || !scope.school || (finalSchool && !sameStation(finalSchool, scope.school))) {
      sendForbidden(res, 'You can only request accounts for your assigned school.'); return;
    }
    finalSchool = scope.school;
    finalDistrict = scope.district || null;
    finalAddress = `${scope.school}${scope.district ? `, ${scope.district}` : ''}`;
  }

  // Store the submitted PDS only after all identity, duplicate, plantilla and
  // station-scope checks have passed. Approval promotes this same private file
  // into the personnel's Digital 201 record.
  let pdsStoragePath: string | null = null;
  try {
    if (req.file) {
      pdsStoragePath = await storeDocument(req.file.buffer, req.file.mimetype, `account-requests/${req.user!.userId}`);
    }
    const accountRequest = await prisma.accountCreationRequest.create({
      data: {
      requestedByUserId: req.user!.userId,
      firstName,
      lastName,
      middleName: middleName || null,
      suffix: suffix || null,
      email: cleanEmail,
      birthDate: parsedBirthDate,
      gender: gender && ['MALE', 'FEMALE', 'OTHER'].includes(gender) ? gender : null,
      civilStatus: civilStatus && ['SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED'].includes(civilStatus) ? civilStatus : null,
      contactNumber: contactNumber || null,
      address: finalAddress || null,
      role: role && Object.values(UserRole).includes(role as UserRole) ? (role as UserRole) : UserRole.TEACHING_PERSONNEL,
      designation: finalDesignation,
      school: finalSchool || null,
      district: finalDistrict || null,
      initialPassword: await hashPassword(initialPassword),
      dateHired: req.body.dateHired ? new Date(req.body.dateHired) : null,
      pdsOriginalFileName: req.file?.originalname || null,
      pdsStoragePath,
      pdsMimeType: req.file?.mimetype || null,
      pdsFileSize: req.file?.size || null,
      status: 'PENDING',
      },
    });

    // Notify System Admins
    const sysAdmins = await prisma.user.findMany({
      where: { role: { name: UserRole.SYSTEM_ADMIN } },
      select: { id: true },
    });

    if (sysAdmins.length > 0) {
      await prisma.notification.createMany({
        data: sysAdmins.map(admin => ({
          userId: admin.id,
          message: `New Account Creation Request submitted by ${req.user!.email} for ${firstName} ${lastName} (${role}).`,
          type: 'INFO' as const,
          relatedEntityId: accountRequest.id,
          relatedEntityType: 'AccountCreationRequest',
        })),
      });
    }

    const { initialPassword: _password, pdsStoragePath: _storage, ...safeRequest } = accountRequest;
    await queueTransactionalEmail(`account-request:${accountRequest.id}:recorded`, {
      recipientEmail: req.user!.email,
      recipientName: req.user!.email,
      subject: `Account request received: ${firstName} ${lastName}`,
      heading: 'Account request recorded',
      message: `Your request to create a Digital 201 account for ${firstName} ${lastName} was recorded and is awaiting System Administrator approval.`,
      reference: `Account request ${accountRequest.id}`,
      actionLabel: 'Open Digital 201',
      actionUrl: `${config.clientUrl}/admin/personnel`,
    });
    void processWorkflowOutbox();
    sendCreated(res, { ...safeRequest, hasPdsFile: Boolean(accountRequest.pdsStoragePath) }, 'Account creation request submitted successfully. Awaiting System Administrator approval.');
  } catch (error) {
    if (pdsStoragePath) {
      await discardUncommittedDocument(pdsStoragePath).catch(cleanupError => logger.error({ err: cleanupError }, 'Failed to discard uncommitted account-request PDS'));
    }
    throw error;
  }
};

/**
 * GET /users/requests — View all account creation requests
 */
export const getAccountRequests = async (req: Request, res: Response): Promise<void> => {
  const isSysAdmin = req.user?.role === 'SYSTEM_ADMIN' || req.user?.role === 'HRMO';
  const where: any = isSysAdmin ? {} : { requestedByUserId: req.user!.userId };
  if (typeof req.query.status === 'string' && ['PENDING', 'APPROVED', 'REJECTED'].includes(req.query.status)) where.status = req.query.status;
  const { limit } = getPaginationParams(req.query as Record<string, unknown>);

  const requests = await prisma.accountCreationRequest.findMany({
    where,
    ...(req.query.limit ? { take: limit } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      requestedByUser: {
        select: {
          id: true,
          email: true,
          role: { select: { name: true } },
          personnel: { select: { firstName: true, lastName: true } },
        },
      },
      createdUser: {
        select: {
          id: true,
          email: true,
          accountStatus: true,
        },
      },
    },
  });

  sendSuccess(res, requests.map(({ initialPassword: _password, pdsStoragePath: _storage, ...request }) => ({
    ...request,
    hasPdsFile: Boolean(_storage),
  })));
};

/**
 * POST /users/requests/:id/approve — System Administrator approves an account request
 */
export const approveAccountRequest = async (req: Request, res: Response): Promise<void> => {
  const requestId = parseInt(req.params.id, 10);
  if (isNaN(requestId)) {
    sendBadRequest(res, 'Invalid request ID.');
    return;
  }

  const accountRequest = await prisma.accountCreationRequest.findUnique({
    where: { id: requestId },
  });

  if (!accountRequest) {
    sendNotFound(res, 'Account creation request not found.');
    return;
  }

  if (!accountRequest.birthDate || !accountRequest.gender || !accountRequest.civilStatus) {
    sendBadRequest(res, 'This legacy request is missing required personnel identity data. Return it for correction before approval.', 'INCOMPLETE_ACCOUNT_REQUEST');
    return;
  }

  if (accountRequest.status !== 'PENDING') {
    sendBadRequest(res, `This request has already been ${accountRequest.status.toLowerCase()}.`);
    return;
  }

  // 1. Validate email duplicate check
  const existingUser = await prisma.user.findUnique({ where: { email: accountRequest.email } });
  if (existingUser) {
    sendBadRequest(res, `An account with email "${accountRequest.email}" already exists in the system.`, 'DUPLICATE_EMAIL');
    return;
  }

  const roleRecord = await prisma.role.findUnique({ where: { name: accountRequest.role } });
  if (!roleRecord) {
    sendBadRequest(res, `Role "${accountRequest.role}" not found in database.`);
    return;
  }

  // Older requests stored plaintext; new requests store only an Argon2 hash.
  const passwordHash = accountRequest.initialPassword.startsWith('$argon2')
    ? accountRequest.initialPassword : await hashPassword(accountRequest.initialPassword);

  // 2. Perform Account & Personnel creation inside an atomic Prisma Transaction
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(201, 1)`;
    const claimed = await tx.accountCreationRequest.updateMany({ where: { id: requestId, status: 'PENDING' }, data: { status: 'APPROVED' } });
    if (claimed.count !== 1) throw Object.assign(new Error('This request has already been processed.'), { statusCode: 409 });
    const employeeId = await generateEmployeeNumber(tx);

    // Check if designation carries an assigned Plantilla Item Number
    let matchedPlantilla: any = null;
    const itemMatch = accountRequest.designation.match(/\[Item #([^\]]+)\]/);
    if (itemMatch && itemMatch[1]) {
      const itemNum = itemMatch[1].trim();
      matchedPlantilla = await tx.plantillaItem.findFirst({
        where: { itemNumber: itemNum, occupiedByPersonnel: null },
      });
      if (!matchedPlantilla) throw Object.assign(new Error('The requested plantilla item is no longer available. Return the request for correction.'), { statusCode: 409 });
      const promoLock = await getPlantillaActivePromotionCycle(matchedPlantilla, tx);
      if (promoLock.isLocked) {
        throw Object.assign(new Error(promoLock.reason || `Plantilla item '${matchedPlantilla.itemNumber}' is currently open for grab in an active promotion cycle. Return the request for correction.`), { statusCode: 409 });
      }
    }

    const cleanDesignation = matchedPlantilla
      ? matchedPlantilla.positionTitle
      : accountRequest.designation.replace(/\s*\[Item #[^\]]+\]/, '').trim();

    const newUser = await tx.user.create({
      data: {
        email: accountRequest.email,
        passwordHash,
        roleId: roleRecord.id,
        accountStatus: 'PENDING',
        // An approved account request carries an administrator-issued password too.
        mustChangePassword: true,
      },
    });

    const newPersonnel = await tx.personnel.create({
      data: {
        userId: newUser.id,
        employeeId,
        firstName: accountRequest.firstName,
        lastName: accountRequest.lastName,
        middleName: accountRequest.middleName,
        suffix: accountRequest.suffix,
        designation: cleanDesignation,
        birthDate: accountRequest.birthDate!,
        gender: accountRequest.gender!,
        civilStatus: accountRequest.civilStatus!,
        contactNumber: accountRequest.contactNumber,
        address: accountRequest.address,
        school: matchedPlantilla?.department || accountRequest.school,
        district: accountRequest.district || matchedPlantilla?.division || null,
        status: 'ACTIVE',
        dateHired: accountRequest.dateHired,
        plantillaItemId: matchedPlantilla ? matchedPlantilla.id : undefined,
        profileComplete: false,
      },
    });

    await initializePersonnelDocuments(newPersonnel.id, roleRecord.name, tx);

    if (accountRequest.pdsStoragePath) {
      await tx.personnelFile.updateMany({
        where: {
          personnelId: newPersonnel.id,
          documentTypeId: 'PDS',
          status: PersonnelDocumentStatus.NOT_SUBMITTED,
          deletedAt: null,
        },
        data: {
          originalFileName: accountRequest.pdsOriginalFileName,
          storedFileName: accountRequest.pdsStoragePath.split('/').pop() || accountRequest.pdsOriginalFileName,
          storagePath: accountRequest.pdsStoragePath,
          mimeType: accountRequest.pdsMimeType,
          fileSize: accountRequest.pdsFileSize,
          status: PersonnelDocumentStatus.SUBMITTED,
          remarks: 'Uploaded by AO during account request creation.',
          ocrStatus: 'PENDING',
        },
      });
    }

    // Creating the personnel record above bound the item; log the audit entry.
    if (matchedPlantilla) {
      await tx.validationLog.create({
        data: {
          entityType: 'PlantillaItem',
          entityId: matchedPlantilla.id,
          action: 'PLANTILLA_ITEM_ASSIGNED',
          detailsJson: {
            itemNumber: matchedPlantilla.itemNumber,
            positionTitle: matchedPlantilla.positionTitle,
            assignedPersonnelId: newPersonnel.id,
            personnelName: `${accountRequest.firstName} ${accountRequest.lastName}`,
            source: 'ACCOUNT_REQUEST_APPROVAL',
          },
          userId: req.user!.userId,
          ipAddress: req.ip,
          status: 'SUCCESS',
        },
      });
    }

    await tx.accountCreationRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        createdUserId: newUser.id,
      },
    });

    await tx.notification.create({
      data: {
        userId: accountRequest.requestedByUserId,
        message: `Account Creation Request Approved! Credentials created for ${accountRequest.firstName} ${accountRequest.lastName} (Employee ID: ${employeeId}). Email: ${accountRequest.email}. Ready for distribution.`,
        type: 'SUCCESS',
        relatedEntityId: newUser.id,
        relatedEntityType: 'User',
      },
    });

    return { newUser, newPersonnel, employeeId };
  });

  notifyUserNotifications(accountRequest.requestedByUserId);

  await queueTransactionalEmail(`account-request:${accountRequest.id}:approved`, {
    recipientEmail: accountRequest.email,
    recipientName: `${accountRequest.firstName} ${accountRequest.lastName}`,
    subject: 'Your Digital 201 account has been created',
    heading: 'Account created, pending distribution',
    message: `Your Digital 201 personnel account has been created with employee ID ${result.employeeId}. Your authorized AO or System Administrator will distribute access when the account is ready.`,
    reference: `Employee ID ${result.employeeId}`,
  });
  void processWorkflowOutbox();

  const { passwordHash: _hash, ...safeUser } = result.newUser;
  sendSuccess(res, { user: safeUser, personnel: result.newPersonnel, employeeId: result.employeeId }, 'Account request approved and user credentials created successfully.');
};

/**
 * POST /users/requests/:id/reject — System Admin rejects request
 */
export const rejectAccountRequest = async (req: Request, res: Response): Promise<void> => {
  const requestId = parseInt(req.params.id, 10);
  if (isNaN(requestId)) {
    sendBadRequest(res, 'Invalid account request ID.');
    return;
  }

  const { reason } = req.body;

  const accountRequest = await prisma.accountCreationRequest.findUnique({
    where: { id: requestId },
  });

  if (!accountRequest) {
    sendNotFound(res, 'Account creation request not found.');
    return;
  }

  await prisma.accountCreationRequest.update({
    where: { id: requestId },
    data: {
      status: 'REJECTED',
      rejectionReason: reason || 'Request rejected by System Administrator.',
    },
  });

  // Notify Requesting AO II
  await prisma.notification.create({
    data: {
      userId: accountRequest.requestedByUserId,
      message: `Account Creation Request Rejected for ${accountRequest.firstName} ${accountRequest.lastName}. Reason: ${reason || 'Not specified'}.`,
      type: 'WARNING',
      relatedEntityId: requestId,
      relatedEntityType: 'AccountCreationRequest',
    },
  });
  notifyUserNotifications(accountRequest.requestedByUserId);

  sendSuccess(res, null, 'Account creation request rejected.');
};
