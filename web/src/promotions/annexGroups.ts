/**
 * Groups documentary requirements under their Annex and gives each a stable
 * letter label. Labels come from the official requirement code ("a" → "A."),
 * never from a position in a filtered list, so hiding or reordering rows can
 * never relabel a requirement. Order within a group is the order received.
 */

export interface AnnexRequirement {
  code: string;
  annex?: string;
  isMandatory: boolean;
  submitted: boolean;
  documentName?: string;
  personnelDocumentId?: number;
  status: 'VERIFIED' | 'INCOMPLETE' | 'NOT_APPLICABLE';
}

export interface AnnexGroup<T> {
  annex: string;
  heading: string;
  entries: Array<{ item: T; index: number; label: string }>;
}

const DEFAULT_ANNEX = 'C';

const letterFor = (code: string, positionInGroup: number): string =>
  /^[a-z]$/i.test(code) ? code.toUpperCase() : String.fromCharCode(65 + positionInGroup);

/** `index` is the item's position in the full list, for updating it in place. */
export const groupByAnnex = <T extends AnnexRequirement>(items: T[]): AnnexGroup<T>[] => {
  const groups = new Map<string, AnnexGroup<T>>();
  items.forEach((item, index) => {
    const annex = (item.annex || DEFAULT_ANNEX).trim().toUpperCase();
    let group = groups.get(annex);
    if (!group) {
      group = { annex, heading: `ANNEX ${annex}`, entries: [] };
      groups.set(annex, group);
    }
    group.entries.push({ item, index, label: `${letterFor(item.code, group.entries.length)}.` });
  });
  return [...groups.values()];
};

export type RequirementState = 'verified' | 'deficient' | 'missing' | 'optional' | 'pending';

export const REQUIREMENT_STATE_LABEL: Record<RequirementState, string> = {
  verified: 'Verified',
  deficient: 'Deficient',
  missing: 'Missing',
  optional: 'Optional — not submitted',
  pending: 'Pending review',
};

const hasDocument = (item: AnnexRequirement) => Boolean(item.submitted || item.documentName || item.personnelDocumentId);

/** One visible state per row, spelled out in text so color is never the only signal. */
export const requirementState = (item: AnnexRequirement): RequirementState => {
  if (item.status === 'INCOMPLETE') return 'deficient';
  if (item.status === 'VERIFIED') return 'verified';
  if (!hasDocument(item)) return item.isMandatory ? 'missing' : 'optional';
  return 'pending';
};
