/**
 * Home summaries derived only from records the server returned: where an open
 * promotion stands on the five-step path, and one honest line per link tile.
 */
import { applicationStage, transactionStage } from '../../../constants/workflowStages';
import { resolveDocumentLifecycle, PersonnelDocumentRecord } from '../../../models/documentStatus';
import { VacancyState } from '../vacancyView';

export const PROMOTION_STEPS = ['You apply', 'Requirements checked', 'HRMO rates and selects', 'Appointment documents', 'Final approval'] as const;

export interface PromotionProgress {
  /** Index into PROMOTION_STEPS of the current step. */
  step: number;
  title: string;
  label: string;
  needsYou: boolean;
}

type App = Parameters<typeof applicationStage>[0] & { id: number; cycle?: { targetPosition?: string | null; name?: string; status?: string | null } | null };
type Tx = { id: number; review?: { validator?: 'AO_II' | 'HRMO' | null; validatedBy?: { role?: string | null } | null; approver?: 'HRMO' | 'SYSTEM_ADMIN' | null } | null; status?: string; escalatedAt?: string | null; escalationReviewedAt?: string | null; transactionType?: { name?: string } | null };

/** The first promotion still in progress, or null. An appointment wins over its application. */
export function promotionProgress(applications: App[], transactions: Tx[]): PromotionProgress | null {
  const txById = new Map(transactions.map(t => [t.id, t]));
  for (const a of applications) {
    const title = `Promotion to ${a.cycle?.targetPosition || a.cycle?.name || 'a new position'}`;
    const tx = a.transactionId ? txById.get(a.transactionId) : undefined;
    if (tx) {
      const st = transactionStage(tx.status, { escalated: Boolean(tx.escalatedAt && !tx.escalationReviewedAt), review: tx.review });
      if (st.done) continue;
      return { step: (tx.status || '').toUpperCase() === 'FOR_APPROVAL' ? 4 : 3, title, label: st.label, needsYou: st.needsYou };
    }
    const st = applicationStage(a);
    if (st.done) continue;
    const step = st.who === 'HRMO' ? 2 : st.label.startsWith('Selected') ? 3 : 1;
    return { step, title, label: st.label, needsYou: st.needsYou };
  }
  return null;
}

/** The nearest future expiry among files on hand, or null. */
export function nextExpiry(documents: PersonnelDocumentRecord[], now = new Date()): { name: string; date: string } | null {
  const upcoming = documents
    .filter(d => d.expirationDate && resolveDocumentLifecycle(d) !== 'MISSING' && new Date(d.expirationDate).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.expirationDate!).getTime() - new Date(b.expirationDate!).getTime());
  return upcoming[0] ? { name: upcoming[0].documentTypeName, date: upcoming[0].expirationDate! } : null;
}

/** One line for the Vacancies tile that says what is there, not just "none". */
export function vacancyLine(states: VacancyState[]): string {
  const n = (s: VacancyState[]) => states.filter(x => s.includes(x)).length;
  const canApply = n(['can-apply', 'not-checked']);
  const applied = n(['applied']);
  const notEligible = n(['not-eligible']);
  const open = states.length - n(['closed']);
  if (canApply) return `${canApply} you can apply to`;
  if (applied) return `${applied} applied · no new ones for you`;
  if (notEligible) return `${open} open · not eligible yet · see why`;
  if (open) return `${open} opening soon`;
  return 'No open vacancies right now';
}
