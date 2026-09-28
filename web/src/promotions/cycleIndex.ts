/**
 * Pure helpers for the promotion cycle index: status groups, labels, the
 * client-side filters layered on the server's status/search results, and the
 * summary strip. No React here so the rules can be tested directly.
 */

export type CycleGroup = 'ONGOING' | 'UPCOMING' | 'FINISHED' | 'CANCELLED';

export interface CycleLike {
  id: number;
  name?: string | null;
  type?: string | null;
  status?: string | null;
  endDate?: string | null;
  startDate?: string | null;
  applicantCount?: number | null;
  rulesConfigurationJson?: Record<string, any> | null;
}

export interface CycleFilters {
  district: string; // '' = any
  school: string;
  type: string;
}

export const EMPTY_FILTERS: CycleFilters = { district: '', school: '', type: '' };

const ONGOING = ['ACTIVE', 'EVALUATION', 'COMPARATIVE_ASSESSMENT'];
const UPCOMING = ['PLANNING', 'CONFIGURED'];
const FINISHED = ['CLOSED', 'FINALIZED', 'RESULTS_READY', 'PUBLISHED', 'RESOLVED'];

export function cycleGroup(status?: string | null): CycleGroup {
  const s = String(status || '').toUpperCase();
  if (ONGOING.includes(s)) return 'ONGOING';
  if (UPCOMING.includes(s)) return 'UPCOMING';
  if (FINISHED.includes(s)) return 'FINISHED';
  if (s === 'CANCELLED') return 'CANCELLED';
  // Anything unrecognised stays visible with the work in progress.
  return 'UPCOMING';
}

export const GROUP_LABEL: Record<CycleGroup, string> = {
  ONGOING: 'Ongoing',
  UPCOMING: 'Upcoming',
  FINISHED: 'Finished',
  CANCELLED: 'Cancelled',
};

export const GROUP_ACTION: Record<CycleGroup, string> = {
  ONGOING: 'Open cycle',
  UPCOMING: 'Review setup',
  FINISHED: 'View results',
  CANCELLED: 'View record',
};

export const isArchived = (g: CycleGroup) => g === 'FINISHED' || g === 'CANCELLED';

/** "Ranking for Vacancy: Teacher VII (OSEC-…-2026)" → title + item number. */
export function splitCycleName(cycle: CycleLike): { title: string; item: string | null } {
  const raw = String(cycle.name || '').replace(/^Ranking for (Natural )?Vacancy:\s*/i, '').trim();
  const m = raw.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  const rules = cycle.rulesConfigurationJson || {};
  const configured = rules.plantillaItemNumber || (Array.isArray(rules.plantillaItemNumbers) ? rules.plantillaItemNumbers[0] : null) || rules.plantillaItemNo || null;
  if (m) return { title: m[1] || rules.targetPosition || raw, item: m[2] || configured };
  return { title: raw || rules.targetPosition || 'Untitled cycle', item: configured };
}

export function scopeLabel(cycle: CycleLike): string {
  const r = cycle.rulesConfigurationJson || {};
  if (r.openTo === 'DISTRICT' && r.district) return `${r.district} only`;
  return 'Division-wide';
}

export function stationLabel(cycle: CycleLike): string | null {
  const r = cycle.rulesConfigurationJson || {};
  const school = r.school || r.schoolStation;
  return school ? String(school) : null;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function formatClose(date?: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function filterOptions(cycles: CycleLike[]) {
  const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b));
  return {
    districts: uniq(cycles.map(c => c.rulesConfigurationJson?.district)),
    schools: uniq(cycles.map(c => stationLabel(c))),
    types: uniq(cycles.map(c => c.type)),
  };
}

export function applyFilters<T extends CycleLike>(cycles: T[], f: CycleFilters): T[] {
  return cycles.filter(c =>
    (!f.district || c.rulesConfigurationJson?.district === f.district) &&
    (!f.school || stationLabel(c) === f.school) &&
    (!f.type || c.type === f.type));
}

/** Active work first (ongoing, then upcoming, soonest closing first); archive newest first. */
export function groupCycles<T extends CycleLike>(cycles: T[]): { active: T[]; archive: T[] } {
  const time = (d?: string | null) => (d ? new Date(d).getTime() || 0 : 0);
  const active = cycles.filter(c => !isArchived(cycleGroup(c.status)))
    .sort((a, b) => (cycleGroup(a.status) === cycleGroup(b.status) ? 0 : cycleGroup(a.status) === 'ONGOING' ? -1 : 1)
      || time(a.endDate) - time(b.endDate));
  const archive = cycles.filter(c => isArchived(cycleGroup(c.status)))
    .sort((a, b) => time(b.endDate) - time(a.endDate));
  return { active, archive };
}

export function summarize(cycles: CycleLike[]) {
  const s = { ONGOING: 0, UPCOMING: 0, FINISHED: 0, CANCELLED: 0, applicants: 0 };
  for (const c of cycles) {
    s[cycleGroup(c.status)] += 1;
    s.applicants += Number(c.applicantCount || 0);
  }
  return s;
}
