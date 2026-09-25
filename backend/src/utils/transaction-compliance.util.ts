import { isConfirmedPdsData } from './pds-profile.util';

type Requirement = { id: number; isMandatory: boolean; name?: string };
type Document = { requirementTemplateId: number; status: string; ocrExtractedDataJson?: unknown; correctedOcrDataJson?: unknown };

export function transactionCompliance(requirements: Requirement[], documents: Document[]) {
  const acceptable = documents.filter(d => !['REJECTED', 'PENDING_UPLOAD'].includes(d.status));
  const uploaded = new Set(acceptable.map(d => d.requirementTemplateId));
  const mandatory = requirements.filter(r => r.isMandatory);
  const missing = mandatory.filter(r => !uploaded.has(r.id));
  const unconfirmedPds = acceptable.some(d => {
    const requirement = requirements.find(r => r.id === d.requirementTemplateId);
    return /personal data sheet|\bpds\b/i.test(requirement?.name || '') &&
      Boolean(d.ocrExtractedDataJson) && !isConfirmedPdsData(d.correctedOcrDataJson);
  });
  const complianceScore = mandatory.length
    ? Math.round(((mandatory.length - missing.length) / mandatory.length) * 100)
    : acceptable.length ? 100 : 0;
  // Confirming the PDS fields read by OCR is optional: a transaction with every
  // mandatory document uploaded (100% compliance) may be submitted. AO II checks
  // the documents themselves. unconfirmedPds is still reported for display.
  return { complianceScore, missing, unconfirmedPds, isComplete: acceptable.length > 0 && missing.length === 0 };
}
