/**
 * What one vacancy means for this person, from the fields the cycles endpoint returns.
 *
 * The server's eligibility check covers the position step only (DepEd Order No. 7,
 * s. 2023 jump limit). It is skipped when the person's current position is not on
 * record, and the server then still sends isEligible: true — so that case is shown
 * as "not checked", never as eligible. Eligibility never implies selection.
 */
import { applicationStage } from '../../constants/workflowStages';

export interface VacancyInput {
  id: number;
  name: string;
  endDate: string;
  targetPosition?: string;
  currentPosition?: string;
  isCurrentPosition?: boolean;
  isEligible?: boolean;
  ineligibilityReason?: string | null;
  applicationsOpen?: boolean;
  applicationsState?: 'OPEN' | 'NOT_YET_OPEN' | 'CLOSED';
  applicationsOpenOn?: string;
  applicationsCloseOn?: string;
  hasApplied?: boolean;
  myApplication?: { status?: string; stageStatus?: string; applicantNumber?: string } | null;
  rulesConfigurationJson?: Record<string, any>;
}

export type VacancyState = 'applied' | 'can-apply' | 'not-checked' | 'not-eligible' | 'not-open-yet' | 'closed';

export interface VacancyView {
  state: VacancyState;
  position: string;
  /** One line: where the person stands on this vacancy. */
  status: string;
  /** Why, when not eligible or not checked. */
  reason: string | null;
  deadline: string;
  action: { kind: 'apply' | 'view' | 'fix'; label: string } | null;
  note: string | null;
}

const fmt = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });

export function vacancyView(c: VacancyInput, now = new Date()): VacancyView {
  const position = c.targetPosition || c.rulesConfigurationJson?.targetPosition || c.name;
  const state = c.applicationsState || (c.applicationsOpen ? 'OPEN' : 'CLOSED');
  const closes = c.applicationsCloseOn || fmt(c.endDate);
  const daysLeft = Math.ceil((new Date(c.endDate).getTime() - now.getTime()) / 86_400_000);
  const deadline = state === 'NOT_YET_OPEN'
    ? `Applications open ${c.applicationsOpenOn || ''} and close ${closes}`.replace('  ', ' ')
    : state === 'CLOSED' ? `Applications closed ${closes}`
    : `Apply by ${closes}${daysLeft >= 0 && daysLeft <= 7 ? ` · ${daysLeft <= 1 ? 'last day' : `${daysLeft} days left`}` : ''}`;
  const base = { position, deadline };

  if (c.hasApplied && c.myApplication) {
    const a = c.myApplication;
    const returned = a.stageStatus === 'REQUIREMENTS_DEFICIENT' && a.status === 'UNDER_REVIEW';
    const stage = applicationStage({ status: a.status, stageStatus: a.stageStatus, canResubmit: returned });
    return { ...base, state: 'applied', status: `You applied${a.applicantNumber ? ` (${a.applicantNumber})` : ''} · ${stage.label}`, reason: null,
      action: returned ? { kind: 'fix', label: 'Fix and resubmit' } : { kind: 'view', label: 'View your application' }, note: stage.next || null };
  }
  if (c.isEligible === false) {
    return { ...base, state: 'not-eligible', status: 'Not eligible to apply',
      reason: c.ineligibilityReason || 'The system did not record a reason. Ask your HRMO.', action: null, note: null };
  }
  if (!c.currentPosition) {
    return { ...base, state: 'not-checked', status: 'Eligibility not checked',
      reason: 'Your current position is not on record, so the system could not check the position step. Ask your HRMO to update your record.',
      action: state === 'OPEN' && c.applicationsOpen ? { kind: 'apply', label: 'Apply' } : null, note: null };
  }
  if (state === 'NOT_YET_OPEN') return { ...base, state: 'not-open-yet', status: 'Not open yet', reason: null, action: null, note: 'You meet the position-step rule for this vacancy.' };
  if (state === 'CLOSED' || !c.applicationsOpen) return { ...base, state: 'closed', status: 'Applications closed', reason: null, action: null, note: null };
  return { ...base, state: 'can-apply', status: 'You can apply', reason: null, action: { kind: 'apply', label: 'Apply' },
    note: 'You meet the position-step rule. AO II checks your documents and HRMO rates and selects; applying does not guarantee selection.' };
}

const ORDER: VacancyState[] = ['applied', 'can-apply', 'not-checked', 'not-open-yet', 'not-eligible', 'closed'];
/** Things the person can act on first; within a state, nearest deadline first. */
export function sortVacancies<T extends VacancyInput>(rows: T[], now = new Date()): Array<{ cycle: T; view: VacancyView }> {
  return rows.map(cycle => ({ cycle, view: vacancyView(cycle, now) }))
    .sort((a, b) => ORDER.indexOf(a.view.state) - ORDER.indexOf(b.view.state) || new Date(a.cycle.endDate).getTime() - new Date(b.cycle.endDate).getTime());
}
