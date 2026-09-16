import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { sendSuccess, sendError, sendBadRequest, getPaginationParams, buildPaginationMeta } from '../utils/response.util';
import { getAOSchoolScope } from '../utils/scope.util';
import { deriveAuditCategory } from '../utils/audit.util';

export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawLimit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
    const { page, skip } = getPaginationParams(req.query as Record<string, unknown>);
    const limit = Math.min(500, Math.max(1, isNaN(rawLimit) ? 100 : rawLimit));
    const { userId, actionType, resourceType, startDate, endDate } = req.query;

    const where: Record<string, any> = {};
    if (userId) {
      const parsedUserId = parseInt(String(userId), 10);
      if (isNaN(parsedUserId)) {
        sendBadRequest(res, 'Invalid userId filter parameter.');
        return;
      }
      where.userId = parsedUserId;
    }
    if (actionType) where.action = { contains: String(actionType), mode: 'insensitive' };
    if (resourceType) where.entityType = String(resourceType);
    if (startDate || endDate) {
      where.timestamp = {
        ...(startDate && { gte: new Date(String(startDate)) }),
        ...(endDate && { lte: new Date(String(endDate)) }),
      };
    }

    const scope = await getAOSchoolScope(req.user);
    if (scope.isAo) {
      where.user = {
        OR: [
          { id: req.user!.userId },
          ...(scope.schoolName ? [{
            personnel: {
              OR: [
                { address: { contains: scope.schoolName, mode: 'insensitive' } },
                { designation: { contains: scope.schoolName, mode: 'insensitive' } },
              ],
            },
          }] : []),
        ],
      };
    }

    const [data, total] = await Promise.all([
      prisma.validationLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: { user: { select: { email: true, role: { select: { name: true } } } } },
      }),
      prisma.validationLog.count({ where }),
    ]);

    sendSuccess(res, data.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      userId: log.userId,
      userEmail: log.user?.email || 'System / Automated',
      userRole: log.user?.role?.name || 'SYSTEM',
      category: deriveAuditCategory(log.action, log.entityType),
      action: log.action,
      resourceType: log.entityType,
      resourceId: log.entityId,
      details: log.detailsJson,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      status: log.status,
    })), undefined, 200, buildPaginationMeta(page, limit, total));
  } catch (error: any) {
    console.error('Failed to retrieve audit logs:', error);
    sendError(res, 'Failed to retrieve audit logs.', 500);
  }
};

export const getComplianceReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = await getAOSchoolScope(req.user);
    const txWhere: any = {};
    if (scope.isAo) {
      if (scope.schoolName) {
        txWhere.personnel = {
          OR: [
            { address: { contains: scope.schoolName, mode: 'insensitive' } },
            { designation: { contains: scope.schoolName, mode: 'insensitive' } },
            ...(scope.aoPersonnelId ? [{ id: scope.aoPersonnelId }] : []),
          ],
        };
      } else if (scope.aoPersonnelId) {
        txWhere.personnelId = scope.aoPersonnelId;
      }
    }

    const [total, approved, rejected, pending] = await Promise.all([
      prisma.transaction.count({ where: txWhere }),
      prisma.transaction.count({ where: { ...txWhere, status: 'APPROVED' } }),
      prisma.transaction.count({ where: { ...txWhere, status: 'REJECTED' } }),
      prisma.transaction.count({ where: { ...txWhere, status: { in: ['PENDING_VALIDATION', 'FOR_APPROVAL'] } } }),
    ]);

    sendSuccess(res, {
      period: scope.isAo ? `School Scope: ${scope.schoolName || 'Assigned School'}` : 'Division Master',
      totalTransactions: total,
      approvedTransactions: approved,
      rejectedTransactions: rejected,
      pendingTransactions: pending,
      complianceRate: total > 0 ? `${Math.round((approved / total) * 100)}%` : '0%',
    });
  } catch (error: any) {
    console.error('Failed to generate compliance report:', error);
    sendError(res, 'Failed to generate compliance report.', 500);
  }
};

export const getDemographicsReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = await getAOSchoolScope(req.user);
    const pWhere: any = {};
    if (scope.isAo) {
      if (scope.schoolName) {
        pWhere.OR = [
          { id: scope.aoPersonnelId },
          { address: { contains: scope.schoolName, mode: 'insensitive' } },
          { designation: { contains: scope.schoolName, mode: 'insensitive' } },
        ];
      } else if (scope.aoPersonnelId) {
        pWhere.id = scope.aoPersonnelId;
      }
    }

    const [total, byStatus] = await Promise.all([
      prisma.personnel.count({ where: pWhere }),
      prisma.personnel.groupBy({
        by: ['status'],
        where: pWhere,
        _count: { status: true },
      }),
    ]);

    sendSuccess(res, {
      scope: scope.isAo ? `School Scope: ${scope.schoolName || 'Assigned School'}` : 'Division Master',
      totalPersonnel: total,
      breakdownByStatus: Object.fromEntries(byStatus.map(g => [g.status, g._count.status])),
    });
  } catch (error: any) {
    console.error('Failed to generate demographics report:', error);
    sendError(res, 'Failed to generate demographics report.', 500);
  }
};
