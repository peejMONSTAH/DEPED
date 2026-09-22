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
