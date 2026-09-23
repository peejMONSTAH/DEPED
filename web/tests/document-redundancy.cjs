const test = require('node:test');
const assert = require('node:assert/strict');

// Frontend resolveRequirementIdentity matching MyDocuments.tsx
function resolveRequirementIdentity(documentTypeId, documentTypeName) {
  const normalizedType = (documentTypeId || '').toUpperCase().trim();
  const trimmedCustom = (documentTypeName || '').trim();

  const annexMatch = trimmedCustom.match(/^Annex\s+C\s*[\(\[-]?\s*([a-k])\b/i);
  if (annexMatch) {
    const code = annexMatch[1].toLowerCase();
    return {
      key: `ANNEX_C_${code}`,
      isSingleInstance: true,
      annexCode: code,
    };
  }

  const multiInstanceTypes = ['TRAINING_CERT', 'COE'];
  if (multiInstanceTypes.includes(normalizedType)) {
    return {
      key: `DOC_TYPE:${normalizedType}`,
      isSingleInstance: false,
    };
  }

  if (normalizedType === 'OTHER') {
    return {
      key: trimmedCustom ? `OTHER:${trimmedCustom.toLowerCase()}` : 'OTHER',
      isSingleInstance: false,
    };
  }

  return {
    key: `DOC_TYPE:${normalizedType}`,
    isSingleInstance: true,
  };
}

test('frontend resolveRequirementIdentity correctly classifies single vs multi-instance requirements', () => {
  const pds = resolveRequirementIdentity('PDS', 'Personal Data Sheet');
  assert.equal(pds.key, 'DOC_TYPE:PDS');
  assert.equal(pds.isSingleInstance, true);

  const loi = resolveRequirementIdentity('LETTER_OF_INTENT', 'Letter of Intent');
  assert.equal(loi.key, 'DOC_TYPE:LETTER_OF_INTENT');
  assert.equal(loi.isSingleInstance, true);

  const training = resolveRequirementIdentity('TRAINING_CERT', 'Leadership Training');
  assert.equal(training.key, 'DOC_TYPE:TRAINING_CERT');
  assert.equal(training.isSingleInstance, false);

  const coe = resolveRequirementIdentity('COE', 'Certificate of Employment');
  assert.equal(coe.key, 'DOC_TYPE:COE');
  assert.equal(coe.isSingleInstance, false);
});

test('frontend resolveRequirementIdentity parses Annex C items under OTHER without collision', () => {
  const annexA = resolveRequirementIdentity('OTHER', 'Annex C (a) Letter of Intent');
  const annexB = resolveRequirementIdentity('OTHER', 'Annex C b: Personal Data Sheet');
  const annexK = resolveRequirementIdentity('OTHER', 'Annex C k: Other Documents');

  assert.equal(annexA.key, 'ANNEX_C_a');
  assert.equal(annexA.isSingleInstance, true);

  assert.equal(annexB.key, 'ANNEX_C_b');
  assert.equal(annexB.isSingleInstance, true);

  assert.equal(annexK.key, 'ANNEX_C_k');
  assert.equal(annexK.isSingleInstance, true);

  assert.notEqual(annexA.key, annexB.key);
});

test('activeDocByReqKey indexing identifies active documents and ignores empty placeholders', () => {
  const docs = [
    {
      id: 1,
      documentTypeId: 'LETTER_OF_INTENT',
      documentTypeName: 'Letter of Intent',
      originalFileName: 'intent.pdf',
      status: 'SUBMITTED',
      hasFile: true,
      fileSize: 102400,
    },
    {
      id: 2,
      documentTypeId: 'PDS',
      documentTypeName: 'Personal Data Sheet',
      originalFileName: '',
      status: 'NOT_SUBMITTED',
      hasFile: false,
      fileSize: 0,
    },
    {
      id: 3,
      documentTypeId: 'TRAINING_CERT',
      documentTypeName: 'Training 1',
      originalFileName: 'training_1.pdf',
      status: 'APPROVED',
      hasFile: true,
      fileSize: 50000,
    },
    {
      id: 4,
      documentTypeId: 'TRAINING_CERT',
      documentTypeName: 'Training 2',
      originalFileName: 'training_2.pdf',
      status: 'APPROVED',
      hasFile: true,
      fileSize: 60000,
    },
  ];

  const map = new Map();
  for (const doc of docs) {
    if (!doc.hasFile || doc.status === 'NOT_SUBMITTED') continue;
    const req = resolveRequirementIdentity(doc.documentTypeId, doc.documentTypeName);
    if (req.isSingleInstance && !map.has(req.key)) {
      map.set(req.key, doc);
    }
  }

  // Active LETTER_OF_INTENT is indexed
  assert.ok(map.has('DOC_TYPE:LETTER_OF_INTENT'));
  assert.equal(map.get('DOC_TYPE:LETTER_OF_INTENT').id, 1);

  // Placeholder PDS is NOT indexed (can be fulfilled)
  assert.ok(!map.has('DOC_TYPE:PDS'));

  // Multi-instance TRAINING_CERT is NOT indexed in single-instance map
  assert.ok(!map.has('DOC_TYPE:TRAINING_CERT'));
});

test('switch to replace workflow preserves selected and scanned files', () => {
  // Simulating state when user has picked or scanned a file
  const modalState = {
    mode: 'upload', // 'upload' or 'replace'
    targetDoc: null,
    uploadFile: { name: 'new_intent.pdf', size: 102400 },
    scannedPdfFile: null,
    issueDate: '2026-01-15',
    expirationDate: '',
    remarks: 'Updated version',
  };

  const activeExistingDoc = {
    id: 10,
    documentTypeId: 'LETTER_OF_INTENT',
    documentTypeName: 'Letter of Intent',
    originalFileName: 'old_intent.pdf',
  };

  // User triggers handleSwitchToReplace(activeExistingDoc)
  function handleSwitchToReplace(docToReplace, state) {
    return {
      ...state,
      targetDoc: docToReplace,
      issueDate: state.issueDate || docToReplace.issueDate || '',
      expirationDate: state.expirationDate || docToReplace.expirationDate || '',
      remarks: state.remarks || docToReplace.remarks || '',
      // Notice: uploadFile and scannedPdfFile are NOT cleared!
    };
  }

  const updatedState = handleSwitchToReplace(activeExistingDoc, modalState);
  assert.equal(updatedState.targetDoc.id, 10);
  assert.equal(updatedState.uploadFile.name, 'new_intent.pdf');
  assert.equal(updatedState.issueDate, '2026-01-15');
  assert.equal(updatedState.remarks, 'Updated version');
});

test('HTTP 409 conflict payload handling sets conflictDoc banner', () => {
  const axiosError409 = {
    response: {
      status: 409,
      data: {
        code: 'DOCUMENT_ALREADY_EXISTS',
        message: 'A document is already on file for this requirement. Use Replace to update it.',
        conflict: {
          existingDocumentId: 105,
          existingDocumentName: 'pds_active.pdf',
          documentTypeId: 'PDS',
          documentTypeName: 'Personal Data Sheet',
          status: 'SUBMITTED',
        },
      },
    },
  };

  function processUploadError(err, existingDocs) {
    if (err?.response?.status === 409) {
      const conflictPayload = err.response.data?.conflict;
      let matchedDoc = null;
      if (conflictPayload?.existingDocumentId) {
        matchedDoc = existingDocs.find(d => d.id === conflictPayload.existingDocumentId);
      }
      return {
        isConflict: true,
        errorMessage: err.response.data.message,
        conflictDoc: matchedDoc || conflictPayload,
      };
    }
    return { isConflict: false, errorMessage: err.message };
  }

  const existingDocs = [
    { id: 105, documentTypeId: 'PDS', documentTypeName: 'Personal Data Sheet', originalFileName: 'pds_active.pdf', hasFile: true },
  ];

  const result = processUploadError(axiosError409, existingDocs);
  assert.equal(result.isConflict, true);
  assert.equal(result.conflictDoc.id, 105);
  assert.equal(result.conflictDoc.originalFileName, 'pds_active.pdf');
});
