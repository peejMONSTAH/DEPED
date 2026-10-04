import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../config/prisma';
import { sendBadRequest, sendSuccess } from '../utils/response.util';
import { hashPassword } from '../utils/hash.util';
import { generateEmployeeNumber } from './users.controller';
import { initializePersonnelDocuments } from './personnel-documents.controller';
import {
  IMPORT_MAX_ROWS, ImportContext, PlantillaFact, RawRow, RowResult, parseCsv, readRows, templateCsv, validateImportRows,
} from '../utils/personnel-import.util';

/** GET /users/import/template */
export const getImportTemplate = (_req: Request, res: Response): void => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="personnel-import-template.csv"');
  res.send(`﻿${templateCsv()}`);
};

const readUpload = (req: Request, res: Response): RawRow[] | null => {
  if (!req.file?.buffer?.length) { sendBadRequest(res, 'Choose a CSV file to check.'); return null; }
  const { rows, missing } = readRows(parseCsv(req.file.buffer.toString('utf8')));
  if (missing.length) { sendBadRequest(res, `The file is missing these columns: ${missing.join(', ')}. Download the template to see the headings.`, 'IMPORT_COLUMNS_MISSING'); return null; }
  if (!rows.length) { sendBadRequest(res, 'The file has a header but no people. Add one row per person.'); return null; }
  if (rows.length > IMPORT_MAX_ROWS) { sendBadRequest(res, `The file has ${rows.length} rows. Import up to ${IMPORT_MAX_ROWS} at a time.`, 'IMPORT_TOO_LARGE'); return null; }
  return rows;
};

const loadContext = async (rows: RawRow[]): Promise<ImportContext> => {
  const emails = rows.map(r => (r.values.email || '').trim().toLowerCase()).filter(Boolean);
  const ids = rows.map(r => (r.values.employeeId || '').trim().toUpperCase()).filter(Boolean);
  const [users, people, items, schools] = await Promise.all([
    emails.length ? prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } }) : [],
    ids.length ? prisma.personnel.findMany({ where: { employeeId: { in: ids } }, select: { employeeId: true } }) : [],
    prisma.plantillaItem.findMany({ select: { id: true, itemNumber: true, department: true, division: true, positionTitle: true, occupiedByPersonnel: { select: { id: true } } } }),
    prisma.personnel.findMany({ where: { school: { not: null } }, distinct: ['school'], select: { school: true } }),
  ]);
  const plantilla = new Map<string, PlantillaFact>(items.map(i => [i.itemNumber.toUpperCase(), {
    id: i.id, department: i.department, division: i.division, positionTitle: i.positionTitle, occupied: Boolean(i.occupiedByPersonnel),
  }]));
  const knownStations = new Set<string>([
    ...items.map(i => (i.department || '').trim().toLowerCase()),
    ...schools.map(s => (s.school || '').trim().toLowerCase()),
  ].filter(Boolean));
  return {
    existingEmails: new Set(users.map(u => u.email.toLowerCase())),
    existingEmployeeIds: new Set(people.map(p => p.employeeId.toUpperCase())),
    knownStations, plantilla,
  };
};

const summarise = (results: RowResult[]) => ({
  total: results.length,
  ok: results.filter(r => r.status === 'OK').length,
  errors: results.filter(r => r.status === 'ERROR').length,
  warnings: results.filter(r => r.warnings.length).length,
});
const forClient = (results: RowResult[]) => results.map(({ record: _record, ...rest }) => rest);

/** POST /users/import/preview: check the file and report every problem; writes nothing. */
export const previewPersonnelImport = async (req: Request, res: Response): Promise<void> => {
  const rows = readUpload(req, res);
  if (!rows) return;
  const results = validateImportRows(rows, await loadContext(rows));
  sendSuccess(res, { summary: summarise(results), rows: forClient(results) });
};

/** POST /users/import: create every row that passes the same checks. Accounts are PENDING and no email is sent. */
export const runPersonnelImport = async (req: Request, res: Response): Promise<void> => {
  const rows = readUpload(req, res);
  if (!rows) return;
  const results = validateImportRows(rows, await loadContext(rows));
  const roles = await prisma.role.findMany({ where: { name: { in: ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'] } } });
  const roleId = new Map(roles.map(r => [r.name as string, r.id]));
  // Nobody knows this password: it only fills the column. A person gets in through the normal credentials step.
  const passwordHash = await hashPassword(`${crypto.randomBytes(24).toString('base64url')}aA1!`);
  const actorId = req.user!.userId;

  const created: Array<{ line: number; employeeId: string; email: string }> = [];
  const failed: Array<{ line: number; error: string }> = [];
  for (const result of results) {
    const rec = result.record;
    if (!rec) continue;
    try {
      const employeeId = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(201, 1)`;
        const id = rec.employeeId || await generateEmployeeNumber(tx);
        if (rec.plantillaItemId) {
          const item = await tx.plantillaItem.findUnique({ where: { id: rec.plantillaItemId }, include: { occupiedByPersonnel: { select: { id: true } } } });
          if (!item || item.occupiedByPersonnel) throw new Error(`Plantilla item ${rec.plantillaItemNumber} is no longer free.`);
        }
        const user = await tx.user.create({
          data: { email: rec.email, passwordHash, roleId: roleId.get(rec.role)!, accountStatus: 'PENDING', mustChangePassword: true },
        });
        const address = rec.address || `${rec.school}${rec.district ? `, ${rec.district}` : ''}`;
        const person = await tx.personnel.create({
          data: {
            userId: user.id, employeeId: id, firstName: rec.firstName, lastName: rec.lastName, middleName: rec.middleName, suffix: rec.suffix,
            designation: rec.designation, birthDate: new Date(rec.birthDate), gender: rec.gender ?? undefined, civilStatus: rec.civilStatus ?? undefined,
            contactNumber: rec.contactNumber, address, school: rec.school, district: rec.district, status: 'ACTIVE',
            dateHired: rec.dateHired ? new Date(rec.dateHired) : null, appointmentStatus: (rec.appointmentStatus as any) ?? undefined,
            plantillaItemId: rec.plantillaItemId ?? undefined,
            profileComplete: Boolean(rec.gender && rec.civilStatus && rec.contactNumber && rec.address && rec.dateHired),
          },
        });
        await initializePersonnelDocuments(person.id, rec.role, tx);
        await tx.validationLog.create({
          data: { entityType: 'User', entityId: user.id, action: 'USER_CREATED', detailsJson: { email: rec.email, role: rec.role, employeeId: id, source: 'BULK_IMPORT' }, userId: actorId, ipAddress: req.ip, status: 'SUCCESS' },
        });
        return id;
      }, { timeout: 30_000 });
      created.push({ line: result.line, employeeId, email: rec.email });
    } catch (error: any) {
      failed.push({ line: result.line, error: String(error?.message || 'Could not be imported.').slice(0, 200) });
    }
  }

  await prisma.validationLog.create({
    data: { entityType: 'User', entityId: actorId, action: 'PERSONNEL_IMPORTED', detailsJson: { created: created.length, skipped: results.filter(r => r.status === 'ERROR').length, failed: failed.length }, userId: actorId, ipAddress: req.ip, status: 'SUCCESS' },
  });
  res.locals.auditLogged = true;
  sendSuccess(res, {
    summary: { ...summarise(results), created: created.length, failed: failed.length },
    created, failed, skipped: forClient(results).filter(r => r.status === 'ERROR'),
  }, `${created.length} people imported. Their accounts are pending; no emails were sent.`);
};
