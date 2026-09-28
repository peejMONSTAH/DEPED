/**
 * Reviewer pre-check: reads a document's OCR text and says whether it looks
 * like the right document, for the right person, still valid, and what key
 * facts it states. Hints only. The AO II still decides, and a "could not read"
 * result never blocks anything.
 */

export type CheckState = 'ok' | 'warn' | 'unknown';
export interface PrecheckItem { key: 'type' | 'name' | 'validity'; state: CheckState; label: string }
export interface PrecheckResult {
  checks: PrecheckItem[];
  facts: string[];
  readable: boolean;
}

type Kind = { id: string; label: string; match: RegExp; keywords: RegExp[] };

/** Known document kinds: `match` recognises the requirement's name, `keywords` the page. */
const KINDS: Kind[] = [
  { id: 'PRC', label: 'PRC license', match: /\bprc\b|professional regulation|license|licence/i, keywords: [/professional regulation commission/i, /\bprc\b/i, /registration no/i] },
  { id: 'CSC', label: 'CSC eligibility', match: /\bcsc\b|civil service|eligibility/i, keywords: [/civil service commission/i, /certificate of eligibility/i, /career service/i] },
  { id: 'TOR', label: 'Transcript of Records', match: /transcript|\btor\b/i, keywords: [/transcript of records?/i, /official transcript/i] },
  { id: 'DIPLOMA', label: 'Diploma', match: /diploma/i, keywords: [/\bdiploma\b/i, /conferred/i, /degree of/i] },
  { id: 'OATH', label: 'Oath of Office', match: /oath/i, keywords: [/oath of office/i, /solemnly swear/i] },
  { id: 'APPOINTMENT', label: 'Appointment', match: /appointment/i, keywords: [/you are hereby appointed/i, /appointment/i, /cs form no\.? 33/i] },
  { id: 'ASSUMPTION', label: 'Assumption to Duty', match: /assumption/i, keywords: [/assumption (to|of) duty/i, /assumed the duties/i] },
  { id: 'PDS', label: 'Personal Data Sheet', match: /personal data sheet|\bpds\b/i, keywords: [/personal data sheet/i, /cs form no\.? 212/i] },
  { id: 'WES', label: 'Work Experience Sheet', match: /work experience/i, keywords: [/work experience sheet/i] },
  { id: 'SERVICE_RECORD', label: 'Service Record', match: /service record/i, keywords: [/service record/i] },
  { id: 'IPCRF', label: 'IPCRF', match: /ipcrf|performance|rating/i, keywords: [/individual performance commitment/i, /\bipcrf\b/i, /performance rating/i] },
  { id: 'TRAINING', label: 'Training certificate', match: /training|seminar|certificate of (participation|completion|attendance)/i, keywords: [/certificate of (participation|completion|attendance|appreciation)/i, /training|seminar|workshop/i] },
  { id: 'BIRTH', label: 'PSA Birth Certificate', match: /birth/i, keywords: [/certificate of live birth/i, /philippine statistics authority/i] },
  { id: 'MARRIAGE', label: 'Marriage Certificate', match: /marriage/i, keywords: [/certificate of marriage/i] },
  { id: 'SALN', label: 'SALN', match: /saln|assets.*liabilities/i, keywords: [/statement of assets/i, /\bsaln\b/i] },
];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export const kindFor = (requirementName: string): Kind | null => KINDS.find(k => k.match.test(requirementName)) ?? null;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Edit distance, capped: OCR drops or swaps a letter now and then. */
const close = (a: string, b: string) => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

const hasWord = (words: string[], target: string) => words.some(w => close(w, target));

/** Parses "March 5, 2027", "05/03/2027", "2027-03-05", "5 Mar 2027". */
export const parseLooseDate = (raw: string): Date | null => {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) return new Date(+m[3], +m[1] - 1, +m[2]); // Philippine forms write MM/DD/YYYY
  m = /^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/i.exec(s);
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) return new Date(+m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), +m[2]);
  m = /^(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})/i.exec(s);
  if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) return new Date(+m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), +m[1]);
  return null;
};

const DATE = String.raw`(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+\d{4})`;
const fmt = (d: Date) => d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

export function precheckDocument(
  text: string,
  requirementName: string,
  person: { firstName?: string | null; lastName?: string | null },
  today = new Date(),
): PrecheckResult {
  const flat = text.replace(/\s+/g, ' ');
  const words = fold(text).split(' ');
  const readable = words.filter(w => w.length > 2).length >= 15;
  const checks: PrecheckItem[] = [];
  const facts: string[] = [];

  if (!readable) {
    return { readable: false, facts, checks: [{ key: 'type', state: 'unknown', label: 'The text could not be read. Check this one by eye.' }] };
  }

  // 1. Right document?
  const kind = kindFor(requirementName);
  if (kind) {
    const looksRight = kind.keywords.some(k => k.test(flat));
    const other = !looksRight ? KINDS.find(k => k.id !== kind.id && k.keywords[0].test(flat)) : null;
    checks.push(looksRight
      ? { key: 'type', state: 'ok', label: `Looks like a ${kind.label}` }
      : other
        ? { key: 'type', state: 'warn', label: `Looks like a ${other.label}, not a ${kind.label}` }
        : { key: 'type', state: 'unknown', label: `Could not confirm this is a ${kind.label}` });
  }

  // 2. Right person?
  const last = fold(person.lastName || '').split(' ').filter(Boolean);
  const first = fold(person.firstName || '').split(' ').filter(w => w.length > 1);
  if (last.length) {
    const lastOk = last.every(w => hasWord(words, w));
    const firstOk = first.length === 0 || first.some(w => hasWord(words, w));
    const name = `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim();
    checks.push(lastOk && firstOk
      ? { key: 'name', state: 'ok', label: `Name matches (${name})` }
      : lastOk || firstOk
        ? { key: 'name', state: 'unknown', label: `Only part of the name was found. Check it is ${name}` }
        : { key: 'name', state: 'warn', label: `${name} was not found on the document` });
  }

  // 3. Still valid? (licenses and IDs print a validity or expiry date)
  const expiry = new RegExp(String.raw`(valid until|validity|expir(?:y|ation|es)(?: date)?|valid thru)\W{0,3}` + DATE, 'i').exec(flat);
  if (expiry) {
    const d = parseLooseDate(expiry[2]);
    if (d && !Number.isNaN(d.getTime())) {
      const days = Math.floor((d.getTime() - today.getTime()) / 86_400_000);
      checks.push(days < 0
        ? { key: 'validity', state: 'warn', label: `Expired on ${fmt(d)}` }
        : { key: 'validity', state: days <= 90 ? 'unknown' : 'ok', label: `Valid until ${fmt(d)}${days <= 90 ? ' (expires soon)' : ''}` });
    }
  } else if (kind?.id === 'PRC') {
    checks.push({ key: 'validity', state: 'unknown', label: 'No expiry date found. Check the validity date' });
  }

  // Key facts for the qualification standard
  const rating = /(final|overall|numerical)\s+rating\W{0,12}([1-5]\.\d{1,3})/i.exec(flat);
  if (rating) {
    const adjectival = /\b(outstanding|very satisfactory|satisfactory|unsatisfactory|poor)\b/i.exec(flat.slice(rating.index, rating.index + 160));
    facts.push(`Rating ${rating[2]}${adjectival ? ` (${adjectival[1].replace(/\b\w/g, c => c.toUpperCase())})` : ''}`);
  }
  const hours = /(\d{1,3})\s*(?:\(\d+\)\s*)?(?:training\s+)?(?:hours|hrs)\b/i.exec(flat);
  if (hours && +hours[1] > 0) facts.push(`${hours[1]} training hours`);
  const degree = /\b(bachelor|master|doctor)\s+of\s+([a-z][a-z ]{2,60}?)(?=\s*(?:major|in\b|,|\.|\(|$|\d))/i.exec(flat);
  if (degree) facts.push(`${degree[1][0].toUpperCase()}${degree[1].slice(1).toLowerCase()} of ${degree[2].trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`);
  const license = /(registration|license|licence)\s*(?:no\.?|number)\W{0,3}(\d{5,8})/i.exec(flat);
  if (license) facts.push(`License no. ${license[2]}`);

  return { readable, checks, facts: facts.slice(0, 4) };
}
