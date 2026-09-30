/**
 * Where a personnel notification leads and whether it asks for action.
 *
 * The record the notice is about (relatedEntityType) decides the destination;
 * message keywords are only a fallback for notices with no linked record. Whether
 * action is still needed comes from the server (actionResolved), never from wording.
 */
export interface PersonnelNotification {
  id: number;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  relatedEntityId?: number | null;
  relatedEntityType?: string | null;
  promotionApplicationId?: number;
  promotionCycleId?: number;
  /** true once the requested action is done; null for information. */
  actionResolved?: boolean | null;
  /** Where the server says this notice should open for this account (reviewer work opens the review screen, not the personnel view). */
  actionTarget?: { path: string; label: string; badge: string; kind: 'own' | 'review' | 'fallback' | 'view' };
}

export type NoticeKind = 'appointment' | 'application' | 'vacancy' | 'file' | 'account' | 'service-record' | 'general';

export interface NoticeRoute {
  kind: NoticeKind;
  /** Short label shown on the notice, e.g. "Appointment". */
  label: string;
  /** Plain-language headline; the server message is shown under it. */
  title: string;
  /** Destination, or null when there is nowhere more specific than this list. */
  path: string | null;
  cta: string | null;
  /** The notice asks the person to do something that is still open. */
  needsAction: boolean;
}

const KIND_LABEL: Record<NoticeKind, string> = {
  appointment: 'Appointment', application: 'Promotion application', vacancy: 'Vacancy',
  file: '201 file', account: 'Account security', 'service-record': 'Service record', general: 'Update',
};

const route = (kind: NoticeKind, title: string, path: string | null, cta: string | null, needsAction = false): NoticeRoute =>
  ({ kind, label: KIND_LABEL[kind], title, path, cta, needsAction });

const SECURITY = /sign(ed)? (you )?out|signed out|session|trusted device|password|sign-in email|setup link|account is active|two-factor|verification code/i;

export function routeNotification(n: PersonnelNotification): NoticeRoute {
  const msg = (n.message || '').replace(/^[\p{Emoji}\s]+/u, '').trim();
  const lower = msg.toLowerCase();
  const entity = (n.relatedEntityType || '').toLowerCase();
  const id = n.relatedEntityId ?? null;
  // Open work the server still reports as open; warnings only, so an
  // information notice about a returned item is not shown as a request.
  const open = n.type === 'WARNING' && n.actionResolved === false;

  // Review work notified to an AO II or HRMO who is in their personnel view: open the review screen for that exact record.
  if (n.actionTarget && n.actionTarget.kind !== 'own') {
    return route('general', n.actionTarget.badge, n.actionTarget.path, n.actionTarget.label, n.actionResolved === false);
  }

  if (entity === 'transaction' && id) {
    // The server knows which requirement was returned; its link opens the checklist on that item.
    const to = n.actionTarget?.kind === 'own' ? n.actionTarget.path : `/personnel/checklist?txId=${id}`;
    if (/returned|deficien|reopened/.test(lower)) return route('appointment', open ? 'A document was returned for correction' : 'A document was returned (already handled)', to, open ? 'Fix the returned document' : 'Open appointment', open);
    if (/disqualified|rejected/.test(lower)) return route('appointment', 'Not approved', to, 'See the reason', open);
    if (/approved by|has been approved|appointment approved/.test(lower)) return route('appointment', 'Approved', to, 'Open appointment');
    if (/validated|verified by|verification complete/.test(lower)) return route('appointment', 'Validated · waiting for final approval', to, 'Open appointment');
    if (/selected for/.test(lower)) return route('appointment', 'Selected · appointment requirements needed', to, 'Open appointment', open);
    return route('appointment', 'Appointment update', to, 'Open appointment', open);
  }

  if (entity === 'promotionapplication' && id) {
    const cycle = n.promotionCycleId;
    if (/incomplete|deficien/.test(lower)) {
      return open && cycle
        ? route('application', 'Your application was returned for correction', `/personnel/vacancies?cycle=${cycle}`, 'Fix and resubmit', true)
        : route('application', 'Your application was returned (already handled)', '/personnel/transactions', 'View application');
    }
    if (/verified complete|verified/.test(lower)) return route('application', 'Requirements checked · waiting for HRMO rating', '/personnel/transactions', 'View application');
    return route('application', 'Application update', '/personnel/transactions', 'View application', open);
  }

  if (entity === 'promotioncycle' && id) {
    if (/opened|active for applications|accepting applications/.test(lower)) return route('vacancy', 'New vacancy open for applications', `/personnel/vacancies?cycle=${id}&view=details`, 'View vacancy');
    if (/cancel/.test(lower)) return route('vacancy', 'Promotion cycle cancelled', '/personnel/transactions', 'View application');
    if (/withdrawn/.test(lower)) return route('application', 'Selection withdrawn by HRMO', '/personnel/transactions', 'View application');
    if (/rating finalized|score/.test(lower)) return route('application', 'Your rating was finalized', '/personnel/transactions', 'View application');
    return route('vacancy', 'Promotion cycle update', '/personnel/transactions', 'View application');
  }

  if (entity === 'personneldocument') {
    const expired = /expired/.test(lower);
    return route('file', expired ? 'A 201 file has expired' : '201 file update', '/personnel/documents', expired ? 'Replace file' : 'Open 201 Files', expired && n.actionResolved !== true);
  }

  // No linked record: account and security notices first; they are never transactions.
  if (entity === 'user' || SECURITY.test(lower) || /\baccount\b|credential|profile/.test(lower)) {
    return route('account', SECURITY.test(lower) ? 'Account security notice' : 'Account update', '/personnel/profile', 'Review account');
  }
  if (/service record/.test(lower)) return route('service-record', 'Service record update', '/personnel/service-record', 'View service record');
  if (/document|201 file|expired|expir/.test(lower)) return route('file', '201 file update', '/personnel/documents', 'Open 201 Files');
  return route('general', 'Update', null, null);
}

/** Identical notices about the same record are shown once, newest first, with a count. */
export function collapseRepeats<T extends PersonnelNotification>(rows: T[]): Array<T & { repeats: number }> {
  const seen = new Map<string, T & { repeats: number }>();
  const out: Array<T & { repeats: number }> = [];
  const sorted = [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  for (const n of sorted) {
    const key = `${n.relatedEntityType || ''}:${n.relatedEntityId ?? ''}:${(n.message || '').trim()}`;
    const kept = seen.get(key);
    if (kept) { kept.repeats += 1; if (!n.isRead) kept.isRead = false; continue; }
    const row = { ...n, repeats: 1 };
    seen.set(key, row); out.push(row);
  }
  return out;
}

/** Open requests above information; each group newest first. */
export function groupNotifications<T extends PersonnelNotification>(rows: T[]) {
  const collapsed = collapseRepeats(rows);
  const withRoute = collapsed.map(n => ({ n, r: routeNotification(n) }));
  return {
    action: withRoute.filter(x => x.r.needsAction),
    updates: withRoute.filter(x => !x.r.needsAction),
  };
}
