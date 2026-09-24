export type RequirementItem = {
  requirementId: number;
  name: string;
  description: string;
  isMandatory: boolean;
  status: string;
  version: string;
  documentId: number | null;
  rejectionNotes?: string;
  needsExtractionReview: boolean;
};

/** Match configured requirement IDs only. Filenames and array order are not evidence. */
export function checklistFromTransaction(transaction: any): RequirementItem[] {
  const templates = transaction.transactionType?.requirementTemplates;
  if (!Array.isArray(templates)) throw new Error('The assigned requirement checklist is unavailable.');
  return templates.map((template: any) => {
    const document = (transaction.uploadedDocuments || []).find((entry: any) => entry.requirementTemplateId === template.id);
    const rejected = document?.status === 'REJECTED';
    return {
      requirementId: template.id, name: template.name, description: template.description || '',
      isMandatory: template.isMandatory === true,
      status: !document || document.status === 'PENDING_UPLOAD' ? 'PENDING_UPLOAD' : rejected ? 'DEFICIENT' : document.status === 'VALIDATED' ? 'VALIDATED' : 'UPLOADED',
      documentId: document?.id ?? null,
      version: document ? 'On file' : 'Not uploaded',
      rejectionNotes: rejected ? document.validationNotes || 'Replace this rejected document.' : undefined,
      needsExtractionReview: Boolean(document?.ocrExtractedDataJson && !document?.correctedOcrDataJson?.confirmation && document?.status !== 'VALIDATED'),
    };
  });
}

export function checklistReadiness(items: RequirementItem[]) {
  const complete = (item: RequirementItem) => ['UPLOADED', 'VALIDATED'].includes(item.status) && !item.needsExtractionReview;
  const required = items.filter(item => item.isMandatory);
  return {
    missing: required.filter(item => !complete(item)),
    complete: items.length > 0 && required.every(complete) && items.some(complete) && !items.some(item => item.needsExtractionReview),
  };
}

/** An Annex C item as one of the clients submitted it. */
export type SubmittedAnnexCItem = {
  code: string;
  title?: string;
  description?: string;
  isMandatory?: boolean;
  submitted: boolean;
  documentName?: string;
  personnelDocumentId?: number;
  uploadedFileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  remarks?: string;
  verificationStatus?: string;
  status?: string;
};

/**
 * Reads one stored Annex C item whichever client wrote it.
 *
 * The web checklist sends `submitted` / `documentName` /
 * `personnelDocumentId`; the Flutter app sends `isSubmitted` / `fileName` /
 * `existingDocumentId`. The backend persists the object as received, so both
 * spellings exist in promotion_applications.score_details_json and anything
 * reading one spelling silently reports the other as "not attached".
 *
 * Accepting both here means existing records read correctly; it does not
 * excuse the clients disagreeing, which is worth settling at the write side.
 */
export function normaliseAnnexCItem(raw: any): SubmittedAnnexCItem | null {
  if (!raw || typeof raw !== 'object') return null;
  // JSON round trips (notably from the Flutter app) can store the id as a
  // numeric string; dropping it removed the only way to preview the file.
  const rawId = raw.personnelDocumentId ?? raw.existingDocumentId;
  const parsedId = typeof rawId === 'string' && /^\d+$/.test(rawId.trim()) ? Number(rawId) : rawId;
  const documentId = typeof parsedId === 'number' && Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : undefined;
  return {
    code: String(raw.code ?? ''),
    title: raw.title,
    description: raw.description,
    isMandatory: raw.isMandatory,
    // An explicit id or filename is evidence of an attachment even when
    // neither flag survived the round trip.
    submitted: Boolean(raw.submitted ?? raw.isSubmitted ?? documentId ?? raw.fileName),
    documentName: raw.documentName ?? raw.fileName,
    personnelDocumentId: documentId,
    uploadedFileUrl: raw.uploadedFileUrl,
    fileSize: raw.fileSize,
    mimeType: raw.mimeType,
    remarks: raw.verificationRemarks ?? raw.remarks ?? '',
    verificationStatus: raw.verificationStatus,
    status: raw.status,
  };
}
