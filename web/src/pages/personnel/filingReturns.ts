import { DocumentLifecycleStatus, PersonnelDocumentRecord, resolveDocumentLifecycle } from '../../models/documentStatus';

/**
 * Files a reviewer returned inside a filing (a promotion application or an
 * appointment). 201 files are never approved on their own: a check happens only
 * on the copy attached to a filing, so returns live there and are fixed there.
 */
export interface FilingReturn {
  key: string;
  /** Where the file was returned, e.g. "Appointment TRX-12". */
  where: string;
  file: string;
  reason: string | null;
  to: string;
  cta: string;
}

interface TxLike {
  id: number; status?: string; remarks?: string | null;
  transactionType?: { name?: string; requirementTemplates?: Array<{ id: number; name: string }> } | null;
  uploadedDocuments?: Array<{ id: number; status?: string; requirementTemplateId: number; fileName?: string }>;
}
interface AppLike {
  id: number; canResubmit?: boolean; transactionId?: number | null;
  cycle?: { id: number; name?: string; targetPosition?: string | null } | null;
  requirementsCheck?: { remarks?: string | null } | null;
  items?: Array<{ code: string; title?: string; verificationStatus?: string | null; verificationRemarks?: string | null }>;
}

export function filingReturns(transactions: TxLike[], applications: AppLike[]): FilingReturn[] {
  const out: FilingReturn[] = [];
  for (const t of transactions) {
    if ((t.status || '').toUpperCase() !== 'DEFICIENCY') continue;
    const where = `${t.transactionType?.name || 'Appointment'} TRX-${t.id}`;
    const to = `/personnel/checklist?txId=${t.id}`;
    const names = new Map((t.transactionType?.requirementTemplates || []).map(r => [r.id, r.name]));
    const returned = (t.uploadedDocuments || []).filter(d => (d.status || '').toUpperCase() === 'REJECTED');
    if (!returned.length) out.push({ key: `tx-${t.id}`, where, file: 'Returned documents', reason: t.remarks || null, to, cta: 'Open checklist' });
    for (const d of returned) {
      out.push({ key: `tx-${t.id}-${d.id}`, where, file: names.get(d.requirementTemplateId) || d.fileName || 'Returned document', reason: t.remarks || null, to, cta: 'Replace in checklist' });
    }
  }
  for (const a of applications) {
    if (!a.canResubmit || !a.cycle) continue;
    const where = `Promotion application: ${a.cycle.targetPosition || a.cycle.name || 'Promotion'}`;
    const to = `/personnel/vacancies?cycle=${a.cycle.id}`;
    const flagged = (a.items || []).filter(i => (i.verificationStatus || '').toUpperCase() === 'INCOMPLETE');
    if (!flagged.length) out.push({ key: `app-${a.id}`, where, file: 'Returned requirements', reason: a.requirementsCheck?.remarks || null, to, cta: 'Fix and resubmit' });
    for (const i of flagged) {
      out.push({ key: `app-${a.id}-${i.code}`, where, file: i.title || i.code, reason: i.verificationRemarks || a.requirementsCheck?.remarks || null, to, cta: 'Fix and resubmit' });
    }
  }
  return out;
}

/** 201 records that need the person, in the order the 201 Files page lists them. */
export const ATTENTION_ORDER = ['RETURNED', 'REPLACEMENT_REQUIRED', 'EXPIRED', 'MISSING', 'EXPIRING_SOON'] as const;
export function filesNeedingAttention<T extends PersonnelDocumentRecord>(documents: T[]): Array<{ doc: T; lc: DocumentLifecycleStatus }> {
  return documents
    .map(doc => ({ doc, lc: resolveDocumentLifecycle(doc) }))
    .filter(({ doc, lc }) => lc === 'RETURNED' || lc === 'REPLACEMENT_REQUIRED' || lc === 'EXPIRED' || lc === 'EXPIRING_SOON' || (doc.isRequired && lc === 'MISSING'))
    .sort((a, b) => ATTENTION_ORDER.indexOf(a.lc as any) - ATTENTION_ORDER.indexOf(b.lc as any));
}
