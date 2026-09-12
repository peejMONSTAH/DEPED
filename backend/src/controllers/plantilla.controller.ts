import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { sendSuccess, sendCreated, sendNotFound, sendBadRequest, sendForbidden } from '../utils/response.util';
import { getAOSchoolScope } from '../utils/scope.util';

/**
 * GET /api/v1/plantilla
 * Lists all plantilla items with active promotion cycle associations and occupant details.
 */
export const getPlantillaItems = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.role === 'SYSTEM_ADMIN') {
      res.status(403).json({
        status: 'error',
        message: 'Access denied: System Administrator cannot access the Plantilla Registry. Plantilla items are managed exclusively by HRMO.',
        code: 'FORBIDDEN',
      });
      return;
    }

    const { search, status, track, district, school } = req.query;

    const where: Record<string, any> = {};

    if (status === 'VACANT') {
      where.isOccupied = false;
    } else if (status === 'OCCUPIED') {
      where.isOccupied = true;
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

    if (school && school !== 'ALL' && school !== 'All Schools in District') {
      where.department = { contains: String(school), mode: 'insensitive' };
    } else if (district && district !== 'ALL' && district !== 'All Districts / Division-Wide') {
      where.division = { contains: String(district), mode: 'insensitive' };
    }

    // AO II scope: filter to their station if applicable
    const scope = await getAOSchoolScope(req.user);
    if (scope.isAo && scope.schoolName) {
      where.department = { contains: scope.schoolName, mode: 'insensitive' };
    }

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
        { isOccupied: 'asc' }, // Vacant items first for priority ranking awareness
        { salaryGrade: 'desc' },
        { itemNumber: 'asc' },
      ],
    });

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
        isOpenForRanking: !item.isOccupied && Boolean(matchingCycle),
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
    const totalCount = items.length;
    const vacantCount = items.filter((i) => !i.isOccupied).length;
    const occupiedCount = items.filter((i) => i.isOccupied).length;
    const openForRankingCount = enriched.filter((i) => i.isOpenForRanking).length;

    sendSuccess(res, enriched, undefined, 200, {
      totalItems: totalCount,
      vacantItems: vacantCount,
      occupiedItems: occupiedCount,
      openForRanking: openForRankingCount,
      availabilityRate: totalCount > 0 ? Math.round((vacantCount / totalCount) * 100) : 0,
    } as any);
  } catch (error: any) {
    console.error('Failed to get plantilla items:', error);
    res.status(500).json({ status: 'error', message: error?.message || 'Failed to fetch plantilla items.' });
  }
};

/**
 * GET /api/v1/plantilla/available
 * Public/Applicant view: List vacant Plantilla items open for ranking and applications.
 */
export const getAvailablePlantillaItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const items = await prisma.plantillaItem.findMany({
      where: { isOccupied: false },
      orderBy: [
        { salaryGrade: 'desc' },
        { positionTitle: 'asc' },
      ],
    });

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
        _count: { select: { promotionApplications: true } },
      },
    });

    let appliedCycleIds: number[] = [];
    if (req.user?.personnelId) {
      const myApps = await prisma.promotionApplication.findMany({
        where: { personnelId: req.user.personnelId },
        select: { promotionCycleId: true },
      });
      appliedCycleIds = myApps.map((a) => a.promotionCycleId);
    }

    const available = items.map((item) => {
      const matchingCycle = activeCycles.find((cycle) => {
        const rules = (cycle.rulesConfigurationJson as Record<string, any>) || {};
        const posMatch = rules.targetPosition?.toLowerCase() === item.positionTitle.toLowerCase();
        const itemNumberMatch = rules.plantillaItemNumber === item.itemNumber;
        const schoolMatch = !rules.school || rules.school === 'All Schools in District' || item.department.toLowerCase().includes(rules.school.toLowerCase());
        return itemNumberMatch || (posMatch && schoolMatch);
      });

      return {
        id: item.id,
        itemNumber: item.itemNumber,
        positionTitle: item.positionTitle,
        salaryGrade: item.salaryGrade,
        department: item.department,
        division: item.division,
        isOccupied: item.isOccupied,
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
              hasApplied: appliedCycleIds.includes(matchingCycle.id),
            }
          : null,
      };
    });

    sendSuccess(res, available);
  } catch (error: any) {
    console.error('Failed to get available plantilla items:', error);
    res.status(500).json({ status: 'error', message: error?.message || 'Failed to fetch available plantilla items.' });
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

    if (!itemNumber || !positionTitle || !salaryGrade || !department) {
      sendBadRequest(res, 'itemNumber, positionTitle, salaryGrade, and department are required.');
      return;
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
        salaryGrade: Number(salaryGrade),
        department: String(department).trim(),
        division: division ? String(division).trim() : 'SDO Koronadal City',
        isOccupied: Boolean(isOccupied),
      },
    });

    if (assignedPersonnel) {
      // If personnel already had another plantilla, unbind from it
      await prisma.personnel.update({
        where: { id: assignedPersonnel.id },
        data: { plantillaItemId: newItem.id },
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
        }).catch((err: any) => console.error('Failed to log PLANTILLA_ITEM_ASSIGNED:', err));
      }
    }

    if (req.user?.userId) {
      await prisma.validationLog.create({
        data: {
          entityType: 'PlantillaItem',
          entityId: newItem.id,
          action: 'PLANTILLA_ITEM_CREATED',
          detailsJson: { itemNumber: newItem.itemNumber, positionTitle: newItem.positionTitle, isOccupied: newItem.isOccupied },
          userId: req.user.userId,
          status: 'SUCCESS',
        },
      }).catch((err: any) => console.error('Failed to log PLANTILLA_ITEM_CREATED:', err));
    }

    sendCreated(res, newItem, `Plantilla Item '${newItem.itemNumber}' created successfully.`);
  } catch (error: any) {
    console.error('Failed to create plantilla item:', error);
    res.status(500).json({ status: 'error', message: error?.message || 'Failed to create plantilla item.' });
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
    if (salaryGrade !== undefined) updateData.salaryGrade = Number(salaryGrade);
    if (department !== undefined) updateData.department = String(department).trim();
    if (division !== undefined) updateData.division = String(division).trim();

    if (isOccupied !== undefined) {
      const willBeOccupied = Boolean(isOccupied);
      updateData.isOccupied = willBeOccupied;

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
            }).catch((err: any) => console.error('Failed to log PLANTILLA_ITEM_VACATED:', err));
          }
        }
      } else if (willBeOccupied && personnelId) {
        // Assign new personnel
        const pId = parseInt(String(personnelId), 10);
        if (!isNaN(pId)) {
          const targetPersonnel = await prisma.personnel.findUnique({ where: { id: pId } });
          if (targetPersonnel) {
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
              }).catch((err: any) => console.error('Failed to log PLANTILLA_ITEM_ASSIGNED on update:', err));
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
      }).catch((err: any) => console.error('Failed to log PLANTILLA_ITEM_UPDATED:', err));
    }

    sendSuccess(res, updated, 'Plantilla item updated successfully.');
  } catch (error: any) {
    console.error('Failed to update plantilla item:', error);
    res.status(500).json({ status: 'error', message: error?.message || 'Failed to update plantilla item.' });
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
      }).catch((err: any) => console.error('Failed to log PLANTILLA_ITEM_DELETED:', err));
    }

    sendSuccess(res, null, `Plantilla Item '${existing.itemNumber}' deleted successfully.`);
  } catch (error: any) {
    console.error('Failed to delete plantilla item:', error);
    res.status(500).json({ status: 'error', message: error?.message || 'Failed to delete plantilla item.' });
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

      await prisma.plantillaItem.update({
        where: { id },
        data: { isOccupied: false },
      });

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
        }).catch((err: any) => console.error('Failed to log PLANTILLA_ITEM_VACATED on unassign:', err));
      }

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
      },
    });

    await prisma.plantillaItem.update({
      where: { id: plantilla.id },
      data: { isOccupied: true },
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
      }).catch((err: any) => console.error('Failed to log PLANTILLA_ITEM_ASSIGNED on reassign:', err));
    }

    sendSuccess(
      res,
      { plantillaId: id, personnelId: targetPersonnel.id },
      `Personnel ${targetPersonnel.firstName} ${targetPersonnel.lastName} successfully assigned to Plantilla Item '${plantilla.itemNumber}'.`
    );
  } catch (error: any) {
    console.error('Failed to assign personnel to plantilla:', error);
    res.status(500).json({ status: 'error', message: error?.message || 'Failed to assign personnel to plantilla.' });
  }
};

