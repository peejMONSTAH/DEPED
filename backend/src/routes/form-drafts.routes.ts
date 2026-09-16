import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../config/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { formTemplates, matchForm } from '../services/form-templates';

const router = Router();
router.use(authenticate);
const draftSchema = z.object({
  version: z.string().max(50),
  pages: z.array(z.number().int().min(0).max(3)).min(1).max(24),
  entries: z.array(z.object({
    id: z.string().min(1).max(80), page: z.number().int().min(0).max(23),
    x: z.number().min(0).max(1), y: z.number().min(0).max(1),
    size: z.number().min(6).max(24), text: z.string().max(3000),
  }).strict()).max(1000),
}).strict();

router.get('/templates', (_req, res) => {
  res.json({ data: formTemplates.map(({ pattern, ...template }) => template) });
});
router.get('/templates/:templateId/file', (req, res) => {
  const template = formTemplates.find(t => t.id === req.params.templateId);
  if (!template) { res.status(404).json({ message: 'Template not found.' }); return; }
  res.sendFile(path.resolve(__dirname, '../../assets/forms', `${template.id}.pdf`));
});

// Same protected storage boundary as document uploads; drafts never become validated documents.
router.all('/transactions/:txId/:templateId', async (req, res, next) => {
  try {
    const txId = Number(req.params.txId);
    const template = formTemplates.find(t => t.id === req.params.templateId);
    if (!Number.isSafeInteger(txId) || txId < 1 || !template) {
      res.status(400).json({ message: 'Invalid transaction or template.' }); return;
    }
    const tx = await prisma.transaction.findUnique({ where: { id: txId } });
    if (!tx || !req.user?.personnelId || tx.personnelId !== req.user.personnelId) {
      res.status(403).json({ message: 'Only the transaction owner can access this draft.' }); return;
    }
    const directory = path.resolve(__dirname, '../../uploads/form-drafts', String(txId));
    const target = path.join(directory, `${template.id}.json`);
    const current = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null;
    if (req.method === 'GET') {
      res.json({ data: current }); return;
    }
    if (req.method !== 'PUT') { res.sendStatus(405); return; }
    if (!['DRAFT', 'DEFICIENCY'].includes(tx.status)) {
      res.status(409).json({ message: 'This transaction is locked for editing.' }); return;
    }
    const approved = await prisma.uploadedDocument.findMany({
      where: { transactionId: txId, status: 'VALIDATED' }, include: { requirementTemplate: true },
    });
    if (approved.some(d => matchForm(d.requirementTemplate.name)?.id === template.id)) {
      res.status(409).json({ message: 'The validated document is locked.' }); return;
    }
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.pages.some(p => p >= template.pages) ||
      parsed.data.entries.some(e => e.page >= parsed.data.pages.length) ||
      new Set(parsed.data.entries.map(e => e.id)).size !== parsed.data.entries.length) {
      res.status(400).json({ message: 'Invalid draft data or page selection.' }); return;
    }
    // Re-read immediately before synchronous atomic replacement to detect a competing tab.
    const latest = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null;
    if (parsed.data.version !== (latest?.version || '0')) {
      res.status(409).json({ message: 'A newer draft exists. Reload before editing to avoid overwriting it.' }); return;
    }
    const saved = { ...parsed.data, version: crypto.randomUUID(), updatedAt: new Date().toISOString(), templateId: template.id };
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${target}.${saved.version}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(saved), { mode: 0o600 });
    fs.renameSync(temporary, target);
    res.json({ data: saved });
  } catch (error) { next(error); }
});
export default router;
