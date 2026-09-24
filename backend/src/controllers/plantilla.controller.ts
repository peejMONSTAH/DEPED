import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { sendSuccess, sendCreated, sendNotFound, sendBadRequest, sendForbidden , sendError} from '../utils/response.util';
import { getStationScope, plantillaAssignmentScopeFilter, promotionApplicationScopeFilter, stationPlantillaFilter } from '../utils/scope.util';
import { getAutoSalaryGrade, getPlantillaActivePromotionCycle } from '../utils/deped.util';
import { logger } from '../utils/logger';
import { validPlantillaLocation } from '../utils/plantilla-location.util';

/**
 * GET /api/v1/plantilla
 * Lists all plantilla items with active promotion cycle associations and occupant details.
 */
export const getPlantillaItems = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'HRMO') {
      res.status(403).json({
        status: 'error',
        message: 'Access denied: Plantilla Registry is exclusive to HR (HRMO) only.',
        code: 'FORBIDDEN',
      });
      return;
    }

    const { search, status, track, district, school } = req.query;

    const where: Record<string, any> = {};

    if (status === 'VACANT') {
      where.occupiedByPersonnel = null;
    } else if (status === 'OCCUPIED') {
      where.occupiedByPersonnel = { isNot: null };
    }

    if (track === 'TEACHING') {
      where.positionTitle = {
        contains: 'Teacher',
        mode: 'insensitive',
      };
    } else if (track === 'NON_TEACHING') {
      where.NOT = {
        positionTitle: { contains: 'Teacher', mode: 'insensitive' },
      };
    }

    // Exact matches, and both may apply: a substring test let "District 1" also
    // match "District 10"–"District 19", and a school filter used to drop the
    // district filter entirely.
    const locationFilters: Record<string, any>[] = [];
    if (school && school !== 'ALL' && school !== 'All Schools in District') {
      locationFilters.push({ department: { equals: String(school).trim(), mode: 'insensitive' } });
    }
    if (district && district !== 'ALL' && district !== 'All Districts / Division-Wide') {
      const name = String(district).trim();
      locationFilters.push({ OR: [
        { division: { equals: name, mode: 'insensitive' } },
        { division: { endsWith: ` - ${name}`, mode: 'insensitive' } },
      ] });
    }
    if (locationFilters.length) where.AND = locationFilters;

    // AO II scope: an officer never sees plantilla items outside their own station
    const scope = await getStationScope(req.user);
    Object.assign(where, stationPlantillaFilter(scope));

    if (search) {
      const q = String(search).trim();
      where.OR = [
        { itemNumber: { contains: q, mode: 'insensitive' } },
        { positionTitle: { contains: q, mode: 'insensitive' } },
        { department: { contains: q, mode: 'insensitive' } },
        { division: { contains: q, mode: 'insensitive' } },
        {
          occupiedByPersonnel: {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { employeeId: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const items = await prisma.plantillaItem.findMany({
      where,
      include: {
        occupiedByPersonnel: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            designation: true,
            dateHired: true,
          },
        },
      },
      orderBy: [
        { salaryGrade: 'desc' },
        { itemNumber: 'asc' },
      ],
    });

    // Vacant items first, for priority ranking awareness. Occupancy is a
    // relation rather than a column, and Prisma cannot order by the presence
    // of one, so the stable sort is applied here over the already-materialised
    // list. The ordering above decides ties, exactly as before.
    items.sort((a, b) => Number(Boolean(a.occupiedByPersonnel)) - Number(Boolean(b.occupiedByPersonnel)));

    // Fetch active promotion cycles to determine if any vacant item is currently open for ranking
    const activeCycles = await prisma.promotionCycle.findMany({
      where: {
        status: { in: ['ACTIVE', 'PLANNING'] },
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        rulesConfigurationJson: true,
        startDate: true,
        endDate: true,
        _count: { select: { promotionApplications: true } },
      },
    });

    const enriched = items.map((item) => {
      // The occupant relation is the occupancy. This used to be compared
      // against a stored flag and repaired when the two disagreed, which they
      // regularly did; there is nothing left to disagree with.
      const actualIsOccupied = Boolean(item.occupiedByPersonnel);

      // Find matching cycle where targetPosition matches positionTitle and (school or district matches)
      const matchingCycle = activeCycles.find((cycle) => {
        const rules = (cycle.rulesConfigurationJson as Record<string, any>) || {};
        const posMatch = rules.targetPosition?.toLowerCase() === item.positionTitle.toLowerCase();
        const itemNumberMatch = rules.plantillaItemNumber === item.itemNumber;
        const schoolMatch = !rules.school || rules.school === 'All Schools in District' || item.department.toLowerCase().includes(rules.school.toLowerCase());
        return itemNumberMatch || (posMatch && schoolMatch);
      });

      return {
        ...item,
        isOccupied: actualIsOccupied,
        isOpenForRanking: !actualIsOccupied && Boolean(matchingCycle),
        activePromotionCycle: matchingCycle
          ? {
              id: matchingCycle.id,
              name: matchingCycle.name,
              type: matchingCycle.type,
              status: matchingCycle.status,
              applicantCount: matchingCycle._count.promotionApplications,
              endDate: matchingCycle.endDate,
            }
          : null,
      };
    });

    // Aggregate statistics
    const totalCount = enriched.length;
    const vacantCount = enriched.filter((i) => !i.isOccupied).length;
    const occupiedCount = enriched.filter((i) => i.isOccupied).length;
    const openForRankingCount = enriched.filter((i) => i.isOpenForRanking).length;

    sendSuccess(res, enriched, undefined, 200, {
      totalItems: totalCount,
      vacantItems: vacantCount,
      occupiedItems: occupiedCount,
      openForRanking: openForRankingCount,
      availabilityRate: totalCount > 0 ? Math.round((vacantCount / totalCount) * 100) : 0,
    } as any);
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to get plantilla items');
    sendError(res, 'Failed to fetch plantilla items.', 500);
  }
};

/**
 * GET /api/v1/plantilla/available
 * Public/Applicant view: List vacant Plantilla items open for ranking and applications.
 */
export const getAvailablePlantillaItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = await getStationScope(req.user);
    const forAssignment = req.query.forAssignment === 'true';
    const items = await prisma.plantillaItem.findMany({
      where: {
        AND: [
          { occupiedByPersonnel: null },
          ...(forAssignment ? [plantillaAssignmentScopeFilter(scope)] : []),
        ],
      },
      orderBy: [
        { salaryGrade: 'desc' },
        { positionTitle: 'asc' },
      ],
    });

    // As in the cycle list: an AO II's applicant count covers their own station only.
    const countedApplications = scope.role === 'AO_II'
      ? { where: promotionApplicationScopeFilter(scope, 'review') }
      : true;

    const activeCycles = await prisma.promotionCycle.findMany({
      where: {
        status: { in: ['ACTIVE', 'PLANNING'] },
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        startDate: true,
        endDate: true,
        rulesConfigurationJson: true,
        _count: { select: { promotionApplications: countedApplications } },
      },
    });

    const myAppsMap = new Map<number, any>();
    if (req.user?.personnelId) {
      const myApps = await prisma.promotionApplication.findMany({
        where: { personnelId: req.user.personnelId },
        select: {
          id: true,
          promotionCycleId: true,
          status: true,
          finalRank: true,
          applicationDate: true,
          scoreDetailsJson: true,
        },
      });
      myApps.forEach((a) => myAppsMap.set(a.promotionCycleId, a));
    }

    const available = items.map((item) => {
      const matchingCycle = activeCycles.find((cycle) => {
        const rules = (cycle.rulesConfigurationJson as Record<string, any>) || {};
        const posMatch = rules.targetPosition?.toLowerCase() === item.positionTitle.toLowerCase();
        const itemNumberMatch = rules.plantillaItemNumber === item.itemNumber;
        const schoolMatch = !rules.school || rules.school === 'All Schools in District' || item.department.toLowerCase().includes(rules.school.toLowerCase());
        return itemNumberMatch || (posMatch && schoolMatch);
      });

      const userApp = matchingCycle ? myAppsMap.get(matchingCycle.id) : null;
      const appDetails = (userApp?.scoreDetailsJson as Record<string, any>) || {};

      return {
        id: item.id,
        itemNumber: item.itemNumber,
        positionTitle: item.positionTitle,
        salaryGrade: item.salaryGrade,
        department: item.department,
        division: item.division,
        // This list is filtered to vacant items, so the answer is fixed.
        isOccupied: false,
        isOpenForRanking: Boolean(matchingCycle),
        promotionCycle: matchingCycle
          ? {
              id: matchingCycle.id,
              name: matchingCycle.name,
              type: matchingCycle.type,
              status: matchingCycle.status,
              startDate: matchingCycle.startDate,
              endDate: matchingCycle.endDate,
              applicantCount: matchingCycle._count.promotionApplications,
              hasApplied: Boolean(userApp),
              hasChecklist: Boolean(appDetails.annexCChecklist),
              myApplication: userApp ? {
                id: userApp.id,
                status: userApp.status,
                finalRank: userApp.finalRank,
                applicationDate: userApp.applicationDate,
                hasChecklist: Boolean(appDetails.annexCChecklist),
                annexCChecklist: appDetails.annexCChecklist || null,
                applicantNumber: appDetails.applicantNumber,
                stageStatus: appDetails.stageStatus,
                verificationStatus: appDetails.verificationStatus || appDetails.completenessStatus,
                verificationRemarks: appDetails.verificationRemarks || appDetails.initialRating?.aoRemarks,
                totalScore: appDetails.totalScore ?? appDetails.finalRating?.finalTotalScore ?? appDetails.initialTotalScore,
                disqualificationReason: appDetails.disqualificationReason,
                deliberationRemarks: appDetails.remarks || appDetails.finalRating?.hrmoRemarks,
                forAppointment: appDetails.forAppointment,
                cycleStatus: appDetails.cycleStatus || matchingCycle.status,
              } : null,
            }
          : null,
      };
    });

    const excludePromotions = req.query.excludePromotions === 'true' || forAssignment;
    const filtered = excludePromotions ? available.filter(item => !item.isOpenForRanking) : available;
    sendSuccess(res, filtered);
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to get available plantilla items');
    sendError(res, 'Failed to fetch available plantilla items.', 500);
  }
};

/**
 * POST /api/v1/plantilla
 * Register a new Plantilla Item (HRMO or System Admin only).
 */
export const createPlantillaItem = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'HRMO') {
      res.status(403).json({
        status: 'error',
        message: 'Access denied: Only HR (HRMO) can create plantilla items. System Administrator cannot access or manage the Plantilla Registry.',
        code: 'FORBIDDEN',
      });
      return;
    }

    const { itemNumber, positionTitle, salaryGrade, department, division, isOccupied, personnelId } = req.body;

    if (!itemNumber || !positionTitle || !department) {
      sendBadRequest(res, 'itemNumber, positionTitle, and department are required.');
      return;
    }
    if (!validPlantillaLocation(department, division)) {
      sendBadRequest(res, 'Select a school that belongs to the selected district.');
      return;
    }

    const effectiveSalaryGrade = salaryGrade !== undefined && Number(salaryGrade) > 0
      ? Number(salaryGrade)
      : getAutoSalaryGrade(String(positionTitle));
    if (!Number.isInteger(effectiveSalaryGrade) || effectiveSalaryGrade < 1 || effectiveSalaryGrade > 33) {
      sendBadRequest(res, 'Enter the authorized salary grade (1–33) for this position.'); return;
    }

    const existing = await prisma.plantillaItem.findUnique({
      where: { itemNumber: String(itemNumber).trim() },
    });

    if (existing) {
      sendBadRequest(res, `Plantilla Item Number '${itemNumber}' already exists.`);
      return;
    }

    let assignedPersonnel: any = null;
    if (Boolean(isOccupied) && personnelId) {
      const pId = parseInt(String(personnelId), 10);
      if (!isNaN(pId)) {
        assignedPersonnel = await prisma.personnel.findUnique({ where: { id: pId } });
        if (!assignedPersonnel) {
          sendBadRequest(res, 'Selected personnel to assign does not exist.');
          return;
        }
      }
    }

    const newItem = await prisma.plantillaItem.create({
      data: {
        itemNumber: String(itemNumber).trim(),
        positionTitle: String(positionTitle).trim(),
        salaryGrade: effectiveSalaryGrade,
        department: String(department).trim(),
        division: division ? String(division).trim() : 'SDO Koronadal City',
      },
    });

    if (assignedPersonnel) {
      // personnel.plantilla_item_id is unique, so rebinding the person below
      // vacates whichever item they held before. No separate statement, and
      // therefore no window in which the two records disagree.
      await prisma.personnel.update({
        where: { id: assignedPersonnel.id },
        data: { plantillaItemId: newItem.id, school: newItem.department, district: newItem.division },
      });

      if (req.user?.userId) {
        await prisma.validationLog.create({
          data: {
            entityType: 'PlantillaItem',
            entityId: newItem.id,
            action: 'PLANTILLA_ITEM_ASSIGNED',
            detailsJson: {
              itemNumber: newItem.itemNumber,
              assignedPersonnelId: assignedPersonnel.id,
              personnelName: `${assignedPersonnel.firstName} ${assignedPersonnel.lastName}`,
            },
            userId: req.user.userId,
            status: 'SUCCESS',
          },
        }).catch((err: any) => logger.error({ err }, 'Failed to log PLANTILLA_ITEM_ASSIGNED'));
      }
    }

    if (req.user?.userId) {
      await prisma.validationLog.create({
        data: {
          entityType: 'PlantillaItem',
          entityId: newItem.id,
          action: 'PLANTILLA_ITEM_CREATED',
          detailsJson: { itemNumber: newItem.itemNumber, positionTitle: newItem.positionTitle, isOccupied: Boolean(assignedPersonnel) },
          userId: req.user.userId,
          status: 'SUCCESS',
        },
      }).catch((err: any) => logger.error({ err }, 'Failed to log PLANTILLA_ITEM_CREATED'));
    }
    res.locals.auditLogged = true;

    sendCreated(res, newItem, `Plantilla Item '${newItem.itemNumber}' created successfully.`);
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to create plantilla item');
    sendError(res, 'Failed to create plantilla item.', 500);
  }
};

/**
 * PUT /api/v1/plantilla/:id
 * Updates an existing Plantilla Item.
 */
export const updatePlantillaItem = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'HRMO') {
      res.status(403).json({
        status: 'error',
        message: 'Access denied: Only HR (HRMO) can update plantilla items. System Administrator cannot access or manage the Plantilla Registry.',
        code: 'FORBIDDEN',
      });
      return;
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendBadRequest(res, 'Invalid plantilla item ID.');
      return;
    }

    const { itemNumber, positionTitle, salaryGrade, department, division, isOccupied, personnelId } = req.body;

    const existing = await prisma.plantillaItem.findUnique({
      where: { id },
      include: { occupiedByPersonnel: true },
    });
    if (!existing) {
      sendNotFound(res, 'Plantilla item not found.');
      return;
    }

    const updateData: Record<string, any> = {};
    if (itemNumber !== undefined) updateData.itemNumber = String(itemNumber).trim();
    if (positionTitle !== undefined) updateData.positionTitle = String(positionTitle).trim();
    if (salaryGrade !== undefined) {
      updateData.salaryGrade = Number(salaryGrade);
    } else if (positionTitle !== undefined) {
      updateData.salaryGrade = getAutoSalaryGrade(String(positionTitle));
    }
    if (department !== undefined) updateData.department = String(department).trim();
    if (updateData.salaryGrade !== undefined && (!Number.isInteger(updateData.salaryGrade) || updateData.salaryGrade < 1 || updateData.salaryGrade > 33)) {
      sendBadRequest(res, 'Enter the authorized salary grade (1–33) for this position.'); return;
    }
    if (division !== undefined) updateData.division = String(division).trim();
    if ((department !== undefined || division !== undefined) &&
        !validPlantillaLocation(updateData.department ?? existing.department, updateData.division ?? existing.division)) {
      sendBadRequest(res, 'Select a school that belongs to the selected district.');
      return;
    }

    if (isOccupied !== undefined) {
      const willBeOccupied = Boolean(isOccupied);

      if (!willBeOccupied) {
        // Vacate current occupant if any
        if (existing.occupiedByPersonnel) {
          await prisma.personnel.update({
            where: { id: existing.occupiedByPersonnel.id },
            data: { plantillaItemId: null },
          });

          if (req.user?.userId) {
            await prisma.validationLog.create({
              data: {
                entityType: 'PlantillaItem',
                entityId: id,
                action: 'PLANTILLA_ITEM_VACATED',
                detailsJson: {
                  itemNumber: existing.itemNumber,
                  previousOccupantId: existing.occupiedByPersonnel.id,
                },
                userId: req.user.userId,
                status: 'SUCCESS',
              },
            }).catch((err: any) => logger.error({ err }, 'Failed to log PLANTILLA_ITEM_VACATED'));
          }
        }
      } else if (willBeOccupied && personnelId) {
        const promoLock = await getPlantillaActivePromotionCycle(existing);
        if (promoLock.isLocked) {
          sendBadRequest(res, promoLock.reason || `Plantilla item '${existing.itemNumber}' is currently open for grab in an active promotion cycle.`);
          return;
        }

        // Assign new personnel
        const pId = parseInt(String(personnelId), 10);
        if (!isNaN(pId)) {
          const targetPersonnel = await prisma.personnel.findUnique({ where: { id: pId } });
          if (targetPersonnel) {
            // Any item this person already held is vacated by the rebind below.

            // Unbind previous occupant if different
            if (existing.occupiedByPersonnel && existing.occupiedByPersonnel.id !== pId) {
              await prisma.personnel.update({
                where: { id: existing.occupiedByPersonnel.id },
                data: { plantillaItemId: null },
              });
            }

            // Bind new occupant and sync position designation
            await prisma.personnel.update({
              where: { id: pId },
              data: {
                plantillaItemId: id,
                designation: positionTitle || existing.positionTitle,
                school: updateData.department ?? existing.department,
                district: updateData.division ?? existing.division,
              },
            });

            if (req.user?.userId) {
              await prisma.validationLog.create({
                data: {
                  entityType: 'PlantillaItem',
                  entityId: id,
                  action: 'PLANTILLA_ITEM_ASSIGNED',
                  detailsJson: {
                    itemNumber: existing.itemNumber,
                    assignedPersonnelId: targetPersonnel.id,
                    personnelName: `${targetPersonnel.firstName} ${targetPersonnel.lastName}`,
                  },
                  userId: req.user.userId,
                  status: 'SUCCESS',
                },
              }).catch((err: any) => logger.error({ err }, 'Failed to log PLANTILLA_ITEM_ASSIGNED on update'));
            }
          }
        }
      }
    }

    const updated = await prisma.plantillaItem.update({
      where: { id },
      data: updateData,
    });

    if (req.user?.userId) {
      await prisma.validationLog.create({
        data: {
          entityType: 'PlantillaItem',
          entityId: updated.id,
          action: 'PLANTILLA_ITEM_UPDATED',
          detailsJson: updateData,
          userId: req.user.userId,
          status: 'SUCCESS',
        },
      }).catch((err: any) => logger.error({ err }, 'Failed to log PLANTILLA_ITEM_UPDATED'));
    }
    res.locals.auditLogged = true;

    sendSuccess(res, updated, 'Plantilla item updated successfully.');
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to update plantilla item');
    sendError(res, 'Failed to update plantilla item.', 500);
  }
};

/**
 * DELETE /api/v1/plantilla/:id
 * Delete or archive a plantilla item.
 */
export const deletePlantillaItem = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'HRMO') {
      res.status(403).json({
        status: 'error',
        message: 'Access denied: Only HR (HRMO) can delete plantilla items. System Administrator cannot access or manage the Plantilla Registry.',
        code: 'FORBIDDEN',
      });
      return;
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendBadRequest(res, 'Invalid plantilla item ID.');
      return;
    }

    const existing = await prisma.plantillaItem.findUnique({
      where: { id },
      include: { occupiedByPersonnel: true },
    });

    if (!existing) {
      sendNotFound(res, 'Plantilla item not found.');
      return;
    }

    if (existing.occupiedByPersonnel) {
      sendBadRequest(res, `Cannot delete Plantilla Item '${existing.itemNumber}'. It is currently occupied by ${existing.occupiedByPersonnel.firstName} ${existing.occupiedByPersonnel.lastName}. Reassign or unbind the personnel first.`);
      return;
    }

    await prisma.plantillaItem.delete({ where: { id } });

    if (req.user?.userId) {
      await prisma.validationLog.create({
        data: {
          entityType: 'PlantillaItem',
          entityId: id,
          action: 'PLANTILLA_ITEM_DELETED',
          detailsJson: { itemNumber: existing.itemNumber },
          userId: req.user.userId,
          status: 'SUCCESS',
        },
      }).catch((err: any) => logger.error({ err }, 'Failed to log PLANTILLA_ITEM_DELETED'));
    }
    res.locals.auditLogged = true;

    sendSuccess(res, null, `Plantilla Item '${existing.itemNumber}' deleted successfully.`);
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to delete plantilla item');
    sendError(res, 'Failed to delete plantilla item.', 500);
  }
};

/**
 * POST /api/v1/plantilla/:id/assign
 * Assign or vacate personnel occupant for a Plantilla Item.
 */
export const assignPersonnelToPlantilla = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'HRMO') {
      res.status(403).json({
        status: 'error',
        message: 'Access denied: Only HR (HRMO) can assign personnel to plantilla items. System Administrator cannot access or manage the Plantilla Registry.',
        code: 'FORBIDDEN',
      });
      return;
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendBadRequest(res, 'Invalid plantilla item ID.');
      return;
    }

    const { personnelId } = req.body;

    const plantilla = await prisma.plantillaItem.findUnique({
      where: { id },
      include: { occupiedByPersonnel: true },
    });

    if (!plantilla) {
      sendNotFound(res, 'Plantilla item not found.');
      return;
    }

    if (personnelId === null || personnelId === undefined || personnelId === '') {
      // Vacate the item
      if (plantilla.occupiedByPersonnel) {
        await prisma.personnel.update({
          where: { id: plantilla.occupiedByPersonnel.id },
          data: { plantillaItemId: null },
        });
      }

      if (req.user?.userId) {
        await prisma.validationLog.create({
          data: {
            entityType: 'PlantillaItem',
            entityId: id,
            action: 'PLANTILLA_ITEM_VACATED',
            detailsJson: {
              itemNumber: plantilla.itemNumber,
              previousOccupantId: plantilla.occupiedByPersonnel?.id,
            },
            userId: req.user.userId,
            status: 'SUCCESS',
          },
        }).catch((err: any) => logger.error({ err }, 'Failed to log PLANTILLA_ITEM_VACATED on unassign'));
      }

      res.locals.auditLogged = true;

      sendSuccess(res, null, `Plantilla Item '${plantilla.itemNumber}' is now vacant.`);
      return;
    }

    const parsedPersonnelId = parseInt(String(personnelId), 10);
    if (isNaN(parsedPersonnelId)) {
      sendBadRequest(res, 'Invalid personnel ID.');
      return;
    }

    const targetPersonnel = await prisma.personnel.findUnique({
      where: { id: parsedPersonnelId },
      include: { plantillaItem: true },
    });

    if (!targetPersonnel) {
      sendNotFound(res, 'Personnel not found.');
      return;
    }

    const promoLock = await getPlantillaActivePromotionCycle(plantilla);
    if (promoLock.isLocked) {
      sendBadRequest(res, promoLock.reason || `Plantilla item '${plantilla.itemNumber}' is currently open for grab in an active promotion cycle and cannot be manually assigned.`);
      return;
    }

    // Any item this person already held is vacated by the rebind below.

    // If another personnel was previously assigned to this plantilla, unbind them
    if (plantilla.occupiedByPersonnel && plantilla.occupiedByPersonnel.id !== targetPersonnel.id) {
      await prisma.personnel.update({
        where: { id: plantilla.occupiedByPersonnel.id },
        data: { plantillaItemId: null },
      });
    }

    // Assign to new personnel and sync position designation
    await prisma.personnel.update({
      where: { id: targetPersonnel.id },
      data: {
        plantillaItemId: plantilla.id,
        designation: plantilla.positionTitle,
        school: plantilla.department,
        district: plantilla.division,
      },
    });

    if (req.user?.userId) {
      await prisma.validationLog.create({
        data: {
          entityType: 'PlantillaItem',
          entityId: id,
          action: 'PLANTILLA_ITEM_ASSIGNED',
          detailsJson: {
            itemNumber: plantilla.itemNumber,
            assignedPersonnelId: targetPersonnel.id,
            personnelName: `${targetPersonnel.firstName} ${targetPersonnel.lastName}`,
          },
          userId: req.user.userId,
          status: 'SUCCESS',
        },
      }).catch((err: any) => logger.error({ err }, 'Failed to log PLANTILLA_ITEM_ASSIGNED on reassign'));
    }
    res.locals.auditLogged = true;

    sendSuccess(
      res,
      { plantillaId: id, personnelId: targetPersonnel.id },
      `Personnel ${targetPersonnel.firstName} ${targetPersonnel.lastName} successfully assigned to Plantilla Item '${plantilla.itemNumber}'.`
    );
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to assign personnel to plantilla');
    sendError(res, 'Failed to assign personnel to plantilla.', 500);
  }
};
