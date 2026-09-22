const test = require('node:test');
const assert = require('node:assert/strict');

// Pure logic replica of computeUploadModalTitle from MyDocuments.tsx
function computeUploadModalTitle(targetDoc, selectedType) {
  if (targetDoc && targetDoc.hasFile && targetDoc.documentTypeName && targetDoc.documentTypeName !== 'undefined') {
    return `Replace: ${targetDoc.documentTypeName}`;
  }
  const typeName =
    selectedType?.name ||
    (targetDoc?.documentTypeName && targetDoc.documentTypeName !== 'undefined'
      ? targetDoc.documentTypeName
      : null);
  if (typeName && typeName !== 'undefined' && typeName !== 'null') {
    return `Upload: ${typeName}`;
  }
  return 'Upload document';
}

// Pure logic replica of upload type validation from MyDocuments.tsx
function validateUploadType(typeId, availableTypes) {
  if (!typeId || typeof typeId !== 'string' || !typeId.trim()) {
    return { valid: false, error: 'Please select a document type.' };
  }
  const exists = availableTypes.some(t => t.id === typeId.trim());
  if (!exists) {
    return { valid: false, error: 'The selected document type is invalid or no longer supported.' };
  }
  return { valid: true };
}

test('upload modal title never displays "Upload: undefined" when targetDoc is an empty object or has undefined name', () => {
  const emptyTarget = {};
  assert.equal(computeUploadModalTitle(emptyTarget, null), 'Upload document');

  const undefinedNameTarget = { documentTypeName: undefined };
  assert.equal(computeUploadModalTitle(undefinedNameTarget, null), 'Upload document');

  const literalUndefinedTarget = { documentTypeName: 'undefined' };
  assert.equal(computeUploadModalTitle(literalUndefinedTarget, null), 'Upload document');
});

test('upload modal title displays "Upload: {Document Type}" when valid type was preselected or selected from dropdown', () => {
  const validTarget = { id: 101, documentTypeId: 'APPOINTMENT', documentTypeName: 'Appointment Paper' };
  assert.equal(computeUploadModalTitle(validTarget, { id: 'APPOINTMENT', name: 'Appointment Paper' }), 'Upload: Appointment Paper');

  // When opening fresh without targetDoc but user selects a type from the dropdown
  assert.equal(computeUploadModalTitle(null, { id: 'SALN', name: 'Statement of Assets, Liabilities and Net Worth' }), 'Upload: Statement of Assets, Liabilities and Net Worth');
});

test('upload modal title displays "Replace: {Document Type}" when replacing an existing file', () => {
  const existingDoc = { id: 202, hasFile: true, documentTypeName: 'Service Record' };
  assert.equal(computeUploadModalTitle(existingDoc, null), 'Replace: Service Record');
});

test('upload modal title displays "Upload document" when no document type is selected', () => {
  assert.equal(computeUploadModalTitle(null, null), 'Upload document');
  assert.equal(computeUploadModalTitle(undefined, undefined), 'Upload document');
});

test('doctype submission validation blocks empty, invalid, or stale document types', () => {
  const availableTypes = [
    { id: 'PDS', name: 'Personal Data Sheet' },
    { id: 'SALN', name: 'SALN' },
    { id: 'APPOINTMENT', name: 'Appointment Paper' },
  ];

  // Empty or whitespace
  assert.equal(validateUploadType('', availableTypes).valid, false);
  assert.equal(validateUploadType('   ', availableTypes).valid, false);
  assert.equal(validateUploadType(null, availableTypes).valid, false);

  // Stale or unrecognized ID
  const staleRes = validateUploadType('OBSOLETE_FORM', availableTypes);
  assert.equal(staleRes.valid, false);
  assert.match(staleRes.error, /invalid or no longer supported/);

  // Valid ID
  assert.equal(validateUploadType('PDS', availableTypes).valid, true);
  assert.equal(validateUploadType('APPOINTMENT', availableTypes).valid, true);
});
