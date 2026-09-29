/**
 * The personnel home task list, derived only from records the server returned.
 * "Needs you" and "Waiting for a reviewer" are kept apart; nothing here infers
 * that files are verified from the absence of work.
 */
export interface HomeTask {
  key: string;
  kind: 'returned' | 'draft' | 'application' | 'files' | 'profile' | 'deadline';
  title: string;
  detail: string;
  action: string;
  to?: string;
  cycleId?: number;
}
import { applicationStage, transactionStage } from '../../../constants/workflowStages';

export interface WaitingItem { key: string; title: string; who: 'AO II' | 'HRMO'; since: string | null; to: string; detail?: string }

const fmt = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

export function homeTasks(input: {
  transactions: Array<{ id: number; status?: string; escalatedAt?: string | null; escalationReviewedAt?: string | null; remarks?: string | null; transactionType?: { name?: string } | null; submissionDate?: string | null; createdAt?: string }>;
  applications: Array<{ id: number; canResubmit?: boolean; transactionId?: number | null; cycle?: { id: number; name?: string; targetPosition?: string | null; status?: string | null } | null; requirementsCheck?: { status?: string | null; remarks?: string | null } | null; status?: string; stageStatus?: string | null; applicationDate?: string }>;
  missingRequiredFiles: number;
  profileComplete: boolean | null;
  cycles: Array<{ id: number; name?: string; endDate?: string; applicationsOpen?: boolean; isEligible?: boolean; currentPosition?: string; myApplication?: unknown }>;
  now?: Date;
}): { tasks: HomeTask[]; waiting: WaitingItem[] } {
  const now = input.now ?? new Date();
  const tasks: HomeTask[] = [];
  const waiting: WaitingItem[] = [];
  const typeName = (t: { transactionType?: { name?: string } | null }) => t.transactionType?.name || 'Transaction';

  for (const t of input.transactions) {
    const s = (t.status || '').toUpperCase();
    if (s === 'DEFICIENCY') tasks.push({ key: `tx-${t.id}`, kind: 'returned', title: `Returned for correction: ${typeName(t)} (TRX-${t.id})`,
      detail: t.remarks ? `Reviewer note: ${t.remarks}` : 'Replace the returned document, then resubmit.', action: 'Fix the returned document', to: `/personnel/checklist?txId=${t.id}` });
    else if (s === 'DRAFT') tasks.push({ key: `tx-${t.id}`, kind: 'draft', title: `Not submitted yet: ${typeName(t)} (TRX-${t.id})`,
      detail: 'Upload the required documents and submit it to AO II.', action: 'Continue', to: `/personnel/checklist?txId=${t.id}` });
    else if (s === 'PENDING_VALIDATION') waiting.push({ key: `tx-${t.id}`, title: `${typeName(t)} (TRX-${t.id})`, who: 'AO II', since: t.submissionDate ?? null, to: `/personnel/checklist?txId=${t.id}`, detail: transactionStage(s).label });
    else if (s === 'FOR_APPROVAL') waiting.push({ key: `tx-${t.id}`, title: `${typeName(t)} (TRX-${t.id})`, who: 'HRMO', since: t.submissionDate ?? null, to: `/personnel/checklist?txId=${t.id}`, detail: transactionStage(s, { escalated: Boolean(t.escalatedAt && !t.escalationReviewedAt) }).label });
  }

  for (const a of input.applications) {
    // Once selected, the appointment transaction above carries the work; not counted twice.
    if (a.transactionId) continue;
    const name = a.cycle?.targetPosition || a.cycle?.name || 'Promotion';
    const st = applicationStage(a);
    if (st.needsYou && a.cycle) tasks.push({ key: `app-${a.id}`, kind: 'application', title: `Application returned: ${name}`,
      detail: a.requirementsCheck?.remarks ? `AO II note: ${a.requirementsCheck.remarks}` : st.next, action: 'Fix and resubmit', cycleId: a.cycle.id, to: `/personnel/vacancies?cycle=${a.cycle.id}` });
    else if (!st.done && (st.who === 'AO II' || st.who === 'HRMO')) waiting.push({ key: `app-${a.id}`, title: `Promotion application: ${name}`, who: st.who, since: a.applicationDate ?? null, to: '/personnel/transactions', detail: st.label });
  }

  if (input.missingRequiredFiles > 0) tasks.push({ key: 'files', kind: 'files', title: `${input.missingRequiredFiles} required 201 file${input.missingRequiredFiles === 1 ? '' : 's'} not uploaded`,
    detail: 'They are needed when you apply for a promotion.', action: 'Upload files', to: '/personnel/documents' });
  if (input.profileComplete === false) tasks.push({ key: 'profile', kind: 'profile', title: 'Your profile is missing required details',
    detail: 'Complete it so your records and applications are accurate.', action: 'Complete profile', to: '/personnel/profile' });

  const week = 7 * 86_400_000;
  for (const c of input.cycles) {
    if (!c.applicationsOpen || c.myApplication || c.isEligible === false || !c.endDate) continue;
    const left = new Date(c.endDate).getTime() - now.getTime();
    if (left > 0 && left <= week) tasks.push({ key: `cycle-${c.id}`, kind: 'deadline', title: `Applications close ${fmt(c.endDate)}: ${c.name || 'Promotion'}`,
      detail: c.currentPosition ? 'You meet the position-step rule and have not applied yet.' : 'You have not applied yet. Your eligibility could not be checked because your current position is not on record.', action: 'Apply', cycleId: c.id, to: `/personnel/vacancies?cycle=${c.id}` });
  }

  const order: HomeTask['kind'][] = ['returned', 'application', 'draft', 'deadline', 'files', 'profile'];
  tasks.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind));
  return { tasks, waiting };
}
