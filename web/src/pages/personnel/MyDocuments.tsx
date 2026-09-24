import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppIcon } from '../../components/common/AppIcon';
import { ModalPortal } from '../../components/common/ModalPortal';
import { ModalOverlay } from '../../components/common/ModalOverlay';
import { SmartEmptyState } from '../../components/common/SmartEmptyState';
import { DocumentViewerModal } from '../../components/common/DocumentViewerModal';
import { DocumentScannerModal } from '../../components/common/DocumentScannerModal';
import { useToast } from '../../contexts/ToastContext';
import apiClient from '../../api/client';
import './my-documents.css';

type PersonnelDocument = {
  id: number;
  personnelId: number;
  documentTypeId: string;
  documentTypeName: string;
  originalFileName: string | null;
  storedFileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  fileUrl: string | null;
  storagePath: string | null;
  issueDate: string | null;
  expirationDate: string | null;
  remarks: string | null;
  status: string;
  rejectionReason: string | null;
  uploadedAt: string;
  updatedAt: string;
  isRequired: boolean;
  hasFile: boolean;
  ocrStatus?: string | null;
};

type ExtractionField = {
  field: string;
  label: string;
  currentValue: string | null;
  extractedValue: string;
  changed: boolean;
  isLocked: boolean;
};
type EmploymentEntry = { dateFrom: string; dateTo: string | null; positionTitle: string; department: string; status: string | null };
type ExtractionReview = { documentId: number; confidenceScore: number; fields: ExtractionField[]; employmentEntries?: EmploymentEntry[] };

type DocumentTypeConfig = {
  id: string;
  name: string;
  supportsExpiration: boolean;
  description: string;
  category: string;
};

export type TabFilter = 'ALL' | 'REQUIRED' | 'ACTION_NEEDED' | 'EXPIRING_SOON';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED = '.pdf,.png,.jpg,.jpeg';

export const formatSize = (bytes?: number | null): string => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatDate = (value?: string | null): string => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export const isExpired = (doc: { expirationDate?: string | null }): boolean => {
  if (!doc.expirationDate) return false;
  const due = new Date(doc.expirationDate);
  if (Number.isNaN(due.getTime())) return false;
  return due < new Date(new Date().toDateString());
};

export const isExpiringSoon = (doc: { expirationDate?: string | null }): boolean => {
  if (!doc.expirationDate || isExpired(doc)) return false;
  const due = new Date(doc.expirationDate).getTime();
  if (Number.isNaN(due)) return false;
  const now = Date.now();
  return due > now && due - now < 60 * 24 * 60 * 60 * 1000;
};

/**
 * Personnel-facing status determination.
 * Administrative workflow states ('Submitted', 'Under Review', 'Approved') are deliberately omitted.
 * Only actionable user-facing states are shown.
 */
export const getPersonnelStatusMeta = (doc: PersonnelDocument): { bg: string; fg: string; label: string; isActionNeeded: boolean } => {
  if (!doc.hasFile) {
    return { bg: 'rgba(100, 116, 139, 0.12)', fg: '#475569', label: 'No file uploaded', isActionNeeded: doc.isRequired };
  }
  if (isExpired(doc)) {
    return { bg: 'rgba(239, 68, 68, 0.12)', fg: '#dc2626', label: 'Expired', isActionNeeded: true };
  }
  if (doc.status === 'REJECTED') {
    return { bg: 'rgba(239, 68, 68, 0.12)', fg: '#dc2626', label: 'Rejected', isActionNeeded: true };
  }
  if (doc.status === 'REPLACEMENT_REQUIRED') {
    return { bg: 'rgba(239, 68, 68, 0.12)', fg: '#dc2626', label: 'Replacement required', isActionNeeded: true };
  }
  if (isExpiringSoon(doc)) {
    return { bg: 'rgba(245, 158, 11, 0.14)', fg: '#d97706', label: 'Expiring soon', isActionNeeded: false };
  }
  return { bg: 'rgba(16, 185, 129, 0.12)', fg: '#059669', label: 'Uploaded', isActionNeeded: false };
};

export interface RequirementIdentity {
  key: string;
  isSingleInstance: boolean;
  annexCCode?: string;
  customName?: string;
}

export function resolveRequirementIdentity(
  documentTypeId: string,
  documentTypeName?: string | null
): RequirementIdentity {
  const normName = (documentTypeName || '').trim();

  // 1. Annex C requirement item check (a through k)
  const annexMatch = normName.match(/^Annex\s+C\s*[\(\[-]?\s*([a-k])\b/i);
  if (annexMatch) {
    const code = annexMatch[1].toLowerCase();
    return {
      key: `ANNEX_C_${code}`,
      isSingleInstance: true,
      annexCCode: code,
      customName: normName,
    };
  }

  // 2. Types allowing multiples:
  if (documentTypeId === 'TRAINING_CERT' || documentTypeId === 'COE') {
    return {
      key: `DOC_TYPE:${documentTypeId}`,
      isSingleInstance: false,
    };
  }

  // 3. General OTHER documents:
  if (documentTypeId === 'OTHER') {
    return {
      key: normName ? `OTHER:${normName.toLowerCase()}` : 'OTHER:GENERAL',
      isSingleInstance: false,
      customName: normName,
    };
  }

  // 4. All other standard defined document types are single-instance
  return {
    key: `DOC_TYPE:${documentTypeId}`,
    isSingleInstance: true,
  };
}

export const MyDocuments: React.FC = () => {
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [documents, setDocuments] = useState<PersonnelDocument[]>([]);
  const [types, setTypes] = useState<DocumentTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState<TabFilter>('ALL');

  // Modals state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [targetDoc, setTargetDoc] = useState<PersonnelDocument | null>(null);
  const [previewDoc, setPreviewDoc] = useState<PersonnelDocument | null>(null);
  const [reviewDoc, setReviewDoc] = useState<PersonnelDocument | null>(null);
  const [reviewData, setReviewData] = useState<ExtractionReview | null>(null);
  const [reviewSelection, setReviewSelection] = useState<string[]>([]);
  const [reviewEntrySelection, setReviewEntrySelection] = useState<number[]>([]);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<PersonnelDocument | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PersonnelDocument | null>(null);

  // Auto-open camera scanner if URL contains ?action=scan or ?scan=1
  useEffect(() => {
    if (searchParams.get('action') === 'scan' || searchParams.get('scan') === '1') {
      setScannerTarget(null);
      setScannerOpen(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('action');
      nextParams.delete('scan');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Form & Upload state
  const [file, setFile] = useState<File | null>(null);
  const [typeId, setTypeId] = useState('');
  const [customName, setCustomName] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [formError, setFormError] = useState('');
  const [conflictDoc, setConflictDoc] = useState<PersonnelDocument | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSubmittingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [docsRes, typesRes] = await Promise.all([
        apiClient.get('/personnel/documents'),
        apiClient.get('/personnel/documents/document-types'),
      ]);
      setDocuments(docsRes.data?.data || []);
      setTypes(typesRes.data?.data || []);
    } catch (error: any) {
      setLoadError(error?.response?.data?.message || 'Your 201 file could not be loaded. Please check your connection.');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedType = useMemo(() => types.find(t => t.id === typeId), [types, typeId]);

  const openExtractionReview = async (doc: PersonnelDocument) => {
    setReviewDoc(doc);
    setReviewData(null);
    setReviewSelection([]);
    setReviewEntrySelection([]);
    setReviewError('');
    setReviewBusy(true);
    try {
      if (doc.ocrStatus !== 'NEEDS_REVIEW') {
        await apiClient.post(`/personnel/documents/${doc.id}/extract`);
      }
      const response = await apiClient.get(`/personnel/documents/${doc.id}/extraction-review`);
      const review = response.data?.data as ExtractionReview;
      setReviewData(review);
      setReviewSelection(review.fields.filter(field => field.changed).map(field => field.field));
      setReviewEntrySelection((review.employmentEntries || []).map((_, index) => index));
    } catch (error: any) {
      setReviewError(error?.response?.data?.message || 'Could not read fields from this document. The file remains saved.');
    } finally {
      setReviewBusy(false);
    }
  };

  const applyExtractionReview = async () => {
    if (!reviewDoc || reviewBusy || (reviewSelection.length === 0 && reviewEntrySelection.length === 0)) return;
    setReviewBusy(true);
    setReviewError('');
    try {
      await apiClient.post(`/personnel/documents/${reviewDoc.id}/apply-extraction`, { approvedFields: reviewSelection, approvedEntryIndexes: reviewEntrySelection });
      addToast('Selected fields were updated in your Digital 201 record.', 'SUCCESS');
      setReviewDoc(null);
      setReviewData(null);
      await load();
    } catch (error: any) {
      setReviewError(error?.response?.data?.message || 'Could not update your Digital 201 record.');
    } finally {
      setReviewBusy(false);
    }
  };

  // Active documents currently on file in 201 library
  const activeDocs = useMemo(() => {
    return documents.filter(doc => doc.hasFile);
  }, [documents]);

  // Map of requirement key -> existing active document
  const activeDocByReqKey = useMemo(() => {
    const map = new Map<string, PersonnelDocument>();
    for (const doc of activeDocs) {
      const req = resolveRequirementIdentity(doc.documentTypeId, doc.documentTypeName);
      map.set(req.key, doc);
    }
    return map;
  }, [activeDocs]);

  // Canonical identity of the selected type/custom name in the modal
  const currentReqIdentity = useMemo(() => {
    if (!typeId) return null;
    const docTypeName = typeId === 'OTHER' ? (customName.trim() || 'Other document') : (selectedType?.name || '');
    return resolveRequirementIdentity(typeId, docTypeName);
  }, [typeId, customName, selectedType]);

  // Existing active document that conflicts with an ordinary upload for this requirement
  const existingActiveDocForSelected = useMemo(() => {
    if (!currentReqIdentity || !currentReqIdentity.isSingleInstance) return null;
    // If the modal was opened to replace a specific document (targetDoc has file and matching ID), do not treat as conflict
    if (targetDoc && targetDoc.hasFile && targetDoc.id) {
      return null;
    }
    return activeDocByReqKey.get(currentReqIdentity.key) || null;
  }, [currentReqIdentity, targetDoc, activeDocByReqKey]);

  const handleSwitchToReplace = (docToReplace: PersonnelDocument) => {
    setTargetDoc(docToReplace);
    setTypeId(docToReplace.documentTypeId);
    if (docToReplace.documentTypeId === 'OTHER') {
      setCustomName(docToReplace.documentTypeName || '');
    }
    if (docToReplace.issueDate) setIssueDate(docToReplace.issueDate);
    if (docToReplace.expirationDate) setExpirationDate(docToReplace.expirationDate);
    setConflictDoc(null);
    setFormError('');
  };

  const modalTitle = useMemo(() => {
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
  }, [targetDoc, selectedType]);

  const resetForm = () => {
    setFile(null);
    setTypeId('');
    setCustomName('');
    setIssueDate('');
    setExpirationDate('');
    setRemarks('');
    setFormError('');
    setConflictDoc(null);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openUploadModal = (target?: PersonnelDocument | null, initialFile?: File) => {
    resetForm();
    const isValidTarget = Boolean(target && (target.id || target.documentTypeId));
    const cleanTarget = isValidTarget ? target! : null;
    setTargetDoc(cleanTarget);
    if (cleanTarget) {
      if (cleanTarget.documentTypeId) setTypeId(cleanTarget.documentTypeId);
      setCustomName(cleanTarget.documentTypeId === 'OTHER' ? cleanTarget.documentTypeName || '' : '');
      setIssueDate(cleanTarget.issueDate || '');
      setExpirationDate(cleanTarget.expirationDate || '');
      setRemarks(cleanTarget.remarks || '');
    }
    if (initialFile) {
      setFile(initialFile);
    }
    setUploadOpen(true);
  };

  const closeUploadModal = (force = false) => {
    if (busy && !force) return;
    setUploadOpen(false);
    setTargetDoc(null);
    resetForm();
  };

  const handlePickFile = (pickedFile: File | null) => {
    setFormError('');
    if (!pickedFile) return;
    if (pickedFile.size > MAX_UPLOAD_BYTES) {
      setFormError(`File size (${formatSize(pickedFile.size)}) exceeds the 10 MB limit.`);
      setFile(null);
      return;
    }
    setFile(pickedFile);
  };

  const handleScanFinished = (scannedFile: File) => {
    setScannerOpen(false);
    const target = scannerTarget && (scannerTarget.id || scannerTarget.documentTypeId) ? scannerTarget : null;
    openUploadModal(target, scannedFile);
    setScannerTarget(null);
  };

  const submitUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || isSubmittingRef.current) return;
    setFormError('');

    if (!typeId) {
      setFormError('Please select a document type.');
      return;
    }
    const isValidType = types.some(t => t.id === typeId);
    if (!isValidType) {
      setFormError('The selected document type is invalid or no longer supported.');
      return;
    }
    if (!file) {
      setFormError('Please select or scan a document file.');
      return;
    }
    if (typeId === 'OTHER' && !customName.trim()) {
      setFormError('Please enter a specific name for this other document.');
      return;
    }

    const form = new FormData();
    form.append('file', file);
    form.append('documentTypeId', typeId);
    if (customName.trim()) form.append('customDocumentName', customName.trim());
    if (issueDate) form.append('issueDate', issueDate);
    if (expirationDate) form.append('expirationDate', expirationDate);
    if (remarks.trim()) form.append('remarks', remarks.trim());

    if (targetDoc) {
      form.append('replacesDocumentId', String(targetDoc.id));
    }

    isSubmittingRef.current = true;
    setBusy(true);
    setUploadProgress(0);

    try {
      const uploadResponse = await apiClient.post('/personnel/documents', form, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percent);
          }
        },
      });

      addToast(
        targetDoc && targetDoc.hasFile
          ? `Replacement submitted for "${targetDoc.documentTypeName}".`
          : `Document "${selectedType?.name || 'Document'}" submitted successfully.`,
        'SUCCESS'
      );
      closeUploadModal(true);
      await load();
      if (['PDS', 'WES', 'APPOINTMENT', 'COE'].includes(typeId) && uploadResponse.data?.data?.id) {
        void openExtractionReview(uploadResponse.data.data as PersonnelDocument);
      }
    } catch (error: any) {
      const responseData = error?.response?.data;
      const conflictData = responseData?.data;
      if (error?.response?.status === 409 && conflictData?.existingDocumentId) {
        setConflictDoc({
          id: conflictData.existingDocumentId,
          personnelId: 0,
          documentTypeId: conflictData.documentTypeId,
          documentTypeName: conflictData.documentTypeName,
          originalFileName: conflictData.originalFileName,
          storedFileName: null,
          mimeType: null,
          fileSize: conflictData.fileSize,
          fileUrl: `/personnel/documents/${conflictData.existingDocumentId}/file`,
          storagePath: null,
          issueDate: null,
          expirationDate: null,
          remarks: null,
          status: 'APPROVED',
          rejectionReason: null,
          uploadedAt: conflictData.uploadedAt || new Date().toISOString(),
          updatedAt: conflictData.uploadedAt || new Date().toISOString(),
          isRequired: false,
          hasFile: true,
        });
        setFormError(
          responseData?.message ||
          'A document is already on file for this requirement. Click Replace to update it.'
        );
      } else {
        setFormError(responseData?.message || error?.message || 'Upload failed. Please check your document and try again.');
      }
    } finally {
      setBusy(false);
      setUploadProgress(null);
      isSubmittingRef.current = false;
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete || busy) return;
    setBusy(true);
    try {
      await apiClient.delete(`/personnel/documents/${confirmDelete.id}`);
      addToast(
        confirmDelete.isRequired
          ? `Reset "${confirmDelete.documentTypeName}" to unsubmitted placeholder.`
          : `Removed "${confirmDelete.documentTypeName}".`,
        'SUCCESS'
      );
      setConfirmDelete(null);
      await load();
    } catch (error: any) {
      addToast(error?.response?.data?.message || 'Could not remove document.', 'ERROR');
    } finally {
      setBusy(false);
    }
  };

  // Filtered documents for active tab
  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      if (activeTab === 'REQUIRED') return doc.isRequired;
      if (activeTab === 'ACTION_NEEDED') {
        return getPersonnelStatusMeta(doc).isActionNeeded;
      }
      if (activeTab === 'EXPIRING_SOON') {
        return isExpiringSoon(doc);
      }
      return true;
    });
  }, [documents, activeTab]);

  const counts = useMemo(() => {
    let required = 0;
    let actionNeeded = 0;
    let expiringSoon = 0;

    for (const d of documents) {
      if (d.isRequired) required++;
      const meta = getPersonnelStatusMeta(d);
      if (meta.isActionNeeded) actionNeeded++;
      if (isExpiringSoon(d)) expiringSoon++;
    }

    return { all: documents.length, required, actionNeeded, expiringSoon };
  }, [documents]);

  const typeCategoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of types) {
      map.set(t.id, t.category || 'General');
    }
    return map;
  }, [types]);

  return (
    <div className="page-container personnel-content-container">
      {/* Top bar */}
      <div className="topbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title" style={{ margin: 0 }}>My Documents</h1>
        </div>

        <div className="my-documents-topbar-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setScannerTarget(null);
              setScannerOpen(true);
            }}
            style={{ minHeight: 44 }}
          >
            <AppIcon name="view" size={16} /> Scan with Camera
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => openUploadModal()}
            style={{ minHeight: 44 }}
          >
            <AppIcon name="upload" size={16} /> Upload Document
          </button>
        </div>
      </div>

      {/* Expiration Notice Banner */}
      {counts.expiringSoon > 0 && (
        <div className="dashboard-error" role="status" style={{ margin: '0 0 16px', background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
            <AppIcon name="clock" size={16} />
            {counts.expiringSoon} document{counts.expiringSoon === 1 ? '' : 's'} in your 201 file expire within 60 days. Please arrange renewals ahead of time.
          </span>
        </div>
      )}

      {/* Tabs Filter Bar */}
      <div className="my-documents-tabs-wrapper">
        <div className="my-documents-tabs" role="tablist" aria-label="Document filters">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ALL'}
            className={`my-documents-tab ${activeTab === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveTab('ALL')}
          >
            <span>All Documents</span>
            <span className="my-documents-tab-count">{counts.all}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'REQUIRED'}
            className={`my-documents-tab ${activeTab === 'REQUIRED' ? 'active' : ''}`}
            onClick={() => setActiveTab('REQUIRED')}
          >
            <span>Required Checklist</span>
            <span className="my-documents-tab-count">{counts.required}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ACTION_NEEDED'}
            className={`my-documents-tab ${activeTab === 'ACTION_NEEDED' ? 'active' : ''}`}
            onClick={() => setActiveTab('ACTION_NEEDED')}
          >
            <span>Action Needed</span>
            {counts.actionNeeded > 0 && (
              <span className="my-documents-tab-count" style={{ background: '#ef4444', color: '#fff' }}>
                {counts.actionNeeded}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'EXPIRING_SOON'}
            className={`my-documents-tab ${activeTab === 'EXPIRING_SOON' ? 'active' : ''}`}
            onClick={() => setActiveTab('EXPIRING_SOON')}
          >
            <span>Expiring Soon</span>
            {counts.expiringSoon > 0 && (
              <span className="my-documents-tab-count" style={{ background: '#f59e0b', color: '#fff' }}>
                {counts.expiringSoon}
              </span>
            )}
          </button>
        </div>
        <div className="my-documents-tabs-fade-right" aria-hidden="true" />
      </div>

      {/* Document Content */}
      {loading ? (
        <div className="table-card-large" style={{ textAlign: 'center', padding: 50 }}>
          <p className="text-muted" style={{ margin: 0, fontWeight: 600 }}>Loading your Digital 201 file…</p>
        </div>
      ) : loadError ? (
        <SmartEmptyState
          icon="error"
          title="Unable to load documents"
          description={loadError}
          primaryAction={{ label: 'Try again', onClick: () => void load(), icon: 'sync' }}
        />
      ) : filteredDocuments.length === 0 ? (
        <SmartEmptyState
          icon="folder"
          title="No documents matching this filter"
          description={
            activeTab === 'ACTION_NEEDED'
              ? 'Great news! You have no missing, rejected, or expired documents requiring attention.'
              : activeTab === 'EXPIRING_SOON'
              ? 'No documents in your 201 file are expiring in the next 60 days.'
              : 'No documents match the selected filter category.'
          }
          primaryAction={{ label: 'View All Documents', onClick: () => setActiveTab('ALL'), icon: 'document' }}
        />
      ) : (
        <>
          {/* ── Desktop View (Compact Table) ────────────────── */}
          <div className="my-documents-desktop-view">
            <div className="my-documents-table-wrapper">
              <table className="my-documents-table" aria-label="Digital 201 documents table">
                <thead>
                  <tr>
                    <th scope="col" style={{ minWidth: 220 }}>Document Name</th>
                    <th scope="col" style={{ width: 140 }}>Category</th>
                    <th scope="col" style={{ minWidth: 200 }}>File</th>
                    <th scope="col" style={{ width: 120 }}>Date</th>
                    <th scope="col" style={{ width: 170 }}>Status</th>
                    <th scope="col" style={{ width: 220, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocuments.map(doc => {
                    const statusMeta = getPersonnelStatusMeta(doc);
                    const category = typeCategoryMap.get(doc.documentTypeId) || 'General';
                    const hasActionBanner = Boolean(doc.rejectionReason || doc.status === 'REPLACEMENT_REQUIRED' || isExpired(doc));

                    return (
                      <tr
                        key={doc.id}
                        className={statusMeta.isActionNeeded ? 'my-documents-table-row-deficient' : ''}
                      >
                        {/* Name & Required Badge */}
                        <td>
                          <div className="my-documents-docname-cell">
                            <div className="my-documents-docname-title">{doc.documentTypeName}</div>
                            <div className="my-documents-docname-tags">
                              {doc.isRequired && (
                                <span className="my-document-required-badge">REQUIRED</span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td>
                          <span className="my-documents-category-tag">{category}</span>
                        </td>

                        {/* Stored File */}
                        <td>
                          {doc.hasFile && doc.originalFileName ? (
                            <div>
                              <div
                                className="my-documents-filename-cell"
                                title={doc.originalFileName}
                              >
                                {doc.originalFileName}
                              </div>
                              <div className="my-documents-filesize-text">{formatSize(doc.fileSize)}</div>
                            </div>
                          ) : (
                            <span className="text-muted" style={{ fontSize: '0.8125rem' }}>No file attached</span>
                          )}
                        </td>

                        {/* Date */}
                        <td>
                          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                            {formatDate(doc.updatedAt || doc.uploadedAt)}
                          </span>
                        </td>

                        {/* Action Status Badge & Banner */}
                        <td>
                          <div>
                            <span
                              className="my-document-badge"
                              style={{ background: statusMeta.bg, color: statusMeta.fg }}
                            >
                              {statusMeta.label}
                            </span>
                            {hasActionBanner && (
                              <div className="my-documents-action-warning-text">
                                {doc.rejectionReason
                                  ? doc.rejectionReason
                                  : isExpired(doc)
                                  ? 'Expired — renewal needed'
                                  : 'Replacement required'}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td>
                          <div className="my-documents-table-actions">
                            {doc.hasFile ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => setPreviewDoc(doc)}
                                  title="View document preview"
                                >
                                  <AppIcon name="view" size={14} /> Preview
                                </button>
                                {['PDS', 'WES', 'APPOINTMENT', 'COE'].includes(doc.documentTypeId) && doc.ocrStatus !== 'APPLIED' && (
                                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openExtractionReview(doc)}>
                                    Review 201 data
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => openUploadModal(doc)}
                                  title="Replace document"
                                >
                                  <AppIcon name="sync" size={14} /> Replace
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => {
                                    setScannerTarget(doc);
                                    setScannerOpen(true);
                                  }}
                                  title="Scan replacement with camera"
                                >
                                  <AppIcon name="view" size={14} /> Scan
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm my-document-delete"
                                  onClick={() => setConfirmDelete(doc)}
                                  title={doc.isRequired ? 'Reset to empty placeholder' : 'Remove document'}
                                >
                                  <AppIcon name="delete" size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => openUploadModal(doc)}
                                >
                                  <AppIcon name="upload" size={14} /> Upload
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => {
                                    setScannerTarget(doc);
                                    setScannerOpen(true);
                                  }}
                                  title="Scan with camera"
                                >
                                  <AppIcon name="view" size={14} /> Scan
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Mobile View (Responsive Cards with >=44px Touch Targets) ────── */}
          <div className="my-documents-mobile-view">
            <div className="my-documents-grid">
              {filteredDocuments.map(doc => {
                const statusMeta = getPersonnelStatusMeta(doc);
                const isDeficient = statusMeta.isActionNeeded;
                const hasActionBanner = Boolean(doc.rejectionReason || doc.status === 'REPLACEMENT_REQUIRED' || isExpired(doc));

                return (
                  <article
                    key={doc.id}
                    className={`my-document-card ${doc.isRequired ? 'is-required' : ''} ${isDeficient ? 'is-deficient' : ''}`}
                  >
                    {/* Header row */}
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}>
                      <div
                        className={`my-document-icon ${!doc.hasFile ? 'missing' : ''} ${isDeficient ? 'deficient' : ''}`}
                        aria-hidden="true"
                      >
                        <AppIcon name="document" size={20} />
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="my-document-badge-row" style={{ marginBottom: 4 }}>
                          {doc.isRequired && (
                            <span className="my-document-required-badge">REQUIRED</span>
                          )}
                          <span
                            className="my-document-badge"
                            style={{ background: statusMeta.bg, color: statusMeta.fg }}
                          >
                            {statusMeta.label}
                          </span>
                        </div>
                        <h2 className="my-document-title">{doc.documentTypeName}</h2>
                        <p className="my-document-filename">
                          {doc.hasFile && doc.originalFileName ? doc.originalFileName : 'No file attached'}
                        </p>
                      </div>
                    </div>

                    {/* Action Required Banner */}
                    {hasActionBanner && (
                      <div className="my-document-rejection">
                        <strong>Action Required: </strong>
                        {doc.rejectionReason
                          ? doc.rejectionReason
                          : isExpired(doc)
                          ? 'This document has expired and requires an updated replacement copy.'
                          : 'A new replacement document is required.'}
                      </div>
                    )}

                    {/* Metadata Row */}
                    <dl className="my-document-meta">
                      <div>
                        <dt>Status Date</dt>
                        <dd>{formatDate(doc.updatedAt || doc.uploadedAt)}</dd>
                      </div>
                      {doc.hasFile && (
                        <div>
                          <dt>File Size</dt>
                          <dd>{formatSize(doc.fileSize)}</dd>
                        </div>
                      )}
                      {doc.expirationDate && (
                        <div>
                          <dt>{isExpired(doc) ? 'Expired On' : 'Valid Until'}</dt>
                          <dd style={isExpired(doc) ? { color: '#dc2626', fontWeight: 700 } : undefined}>
                            {formatDate(doc.expirationDate)}
                          </dd>
                        </div>
                      )}
                    </dl>

                    {/* Action Buttons with touch target >= 44x44px */}
                    <div className="my-document-actions">
                      {doc.hasFile ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setPreviewDoc(doc)}
                            title="View document preview"
                            style={{ minHeight: 44 }}
                          >
                            <AppIcon name="view" size={16} /> Preview
                          </button>
                          {['PDS', 'WES', 'APPOINTMENT', 'COE'].includes(doc.documentTypeId) && doc.ocrStatus !== 'APPLIED' && (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openExtractionReview(doc)} style={{ minHeight: 44 }}>
                              Review 201 data
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openUploadModal(doc)}
                            title="Replace this document"
                            style={{ minHeight: 44 }}
                          >
                            <AppIcon name="sync" size={16} /> Replace
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setScannerTarget(doc);
                              setScannerOpen(true);
                            }}
                            title="Scan replacement with camera"
                            style={{ minHeight: 44 }}
                          >
                            <AppIcon name="view" size={16} /> Scan
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm my-document-delete"
                            onClick={() => setConfirmDelete(doc)}
                            title="Delete or reset document"
                            style={{ minHeight: 44 }}
                          >
                            <AppIcon name="delete" size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => openUploadModal(doc)}
                            style={{ minHeight: 44 }}
                          >
                            <AppIcon name="upload" size={16} /> Upload File
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setScannerTarget(doc);
                              setScannerOpen(true);
                            }}
                            style={{ minHeight: 44 }}
                          >
                            <AppIcon name="view" size={16} /> Scan with Camera
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Upload & Replacement Modal */}
      {uploadOpen && (
        <ModalPortal>
          <ModalOverlay onDismiss={() => closeUploadModal(false)}>
            <div className="modal upload-document-modal" role="dialog" aria-modal="true" aria-labelledby="upload-modal-title">
              <form onSubmit={submitUpload} className="upload-modal-form">
                <div className="modal-header upload-modal-header">
                  <h2 id="upload-modal-title" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                    {modalTitle}
                  </h2>
                  <button
                    type="button"
                    className="upload-modal-close-btn"
                    onClick={() => closeUploadModal(false)}
                    aria-label="Close dialog"
                    disabled={busy}
                  >
                    <AppIcon name="close" size={18} />
                  </button>
                </div>

                <div className="modal-body upload-modal-body">
                  {/* Document Type Selector */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="doc-type-select">Document Type *</label>
                    <select
                      id="doc-type-select"
                      className="form-select"
                      value={typeId}
                      disabled={busy || Boolean(targetDoc && targetDoc.id)}
                      onChange={e => {
                        setTypeId(e.target.value);
                        setFormError('');
                        setConflictDoc(null);
                      }}
                    >
                      <option value="">Choose document type…</option>
                      {types.map(t => {
                        const req = resolveRequirementIdentity(t.id, t.name);
                        const hasActive = req.isSingleInstance && activeDocByReqKey.has(req.key);
                        return (
                          <option key={t.id} value={t.id}>
                            {hasActive ? `${t.name} (On file — Replace only)` : t.name}
                          </option>
                        );
                      })}
                    </select>
                    {selectedType?.description && (
                      <p className="text-muted" style={{ fontSize: '0.75rem', margin: '4px 0 0' }}>
                        {selectedType.description}
                      </p>
                    )}
                  </div>

                  {typeId === 'OTHER' && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="custom-doc-name">Custom Document Name *</label>
                      <input
                        id="custom-doc-name"
                        type="text"
                        className="form-control"
                        placeholder="e.g., Certificate of Commendation"
                        value={customName}
                        onChange={e => {
                          setCustomName(e.target.value);
                          setConflictDoc(null);
                        }}
                        disabled={busy}
                      />
                    </div>
                  )}

                  {/* If an active document already exists for this requirement, guide user to Preview or Replace */}
                  {existingActiveDocForSelected ? (
                    <div className="my-documents-active-conflict-panel" role="region" aria-label="Existing document notice">
                      <div className="my-documents-active-conflict-badge">
                        <AppIcon name="clock" size={14} color="#b45309" />
                        <span>Document Already on File</span>
                      </div>

                      <p className="my-documents-active-conflict-text">
                        A document is already on file for this requirement. Preview it or replace it.
                      </p>

                      <div className="my-documents-active-doc-preview-card">
                        <div className="my-documents-active-doc-meta">
                          <div className="my-documents-active-doc-title">
                            {existingActiveDocForSelected.documentTypeName}
                          </div>
                          <div className="my-documents-active-doc-filename" title={existingActiveDocForSelected.originalFileName || ''}>
                            {existingActiveDocForSelected.originalFileName}
                          </div>
                          <div className="my-documents-active-doc-subtext">
                            Uploaded {formatDate(existingActiveDocForSelected.updatedAt || existingActiveDocForSelected.uploadedAt)}
                            {existingActiveDocForSelected.fileSize ? ` · ${formatSize(existingActiveDocForSelected.fileSize)}` : ''}
                          </div>
                        </div>

                        <div className="my-documents-active-doc-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setPreviewDoc(existingActiveDocForSelected)}
                          >
                            <AppIcon name="view" size={14} /> Preview
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleSwitchToReplace(existingActiveDocForSelected)}
                          >
                            <AppIcon name="sync" size={14} /> Replace
                          </button>
                        </div>
                      </div>

                      {file && (
                        <div className="my-documents-pending-scan-notice">
                          <AppIcon name="check" size={16} color="#059669" />
                          <span>
                            <strong>{file.name}</strong> ({formatSize(file.size)}) is ready to replace this file. Click <strong>Replace</strong> above to proceed.
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Dropzone & File Selector */}
                      <div className="form-group">
                        <label className="form-label">Document File * (PDF, PNG, JPG up to 10 MB)</label>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept={ACCEPTED}
                          style={{ display: 'none' }}
                          onChange={e => handlePickFile(e.target.files?.[0] || null)}
                        />

                        <div
                          className={`my-document-dropzone ${dragActive ? 'drag-active' : ''}`}
                          onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                          onDragLeave={() => setDragActive(false)}
                          onDrop={e => {
                            e.preventDefault();
                            setDragActive(false);
                            handlePickFile(e.dataTransfer.files?.[0] || null);
                          }}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {file ? (
                            <>
                              <AppIcon name="check" size={28} color="#059669" />
                              <div style={{ fontWeight: 700, color: '#059669' }}>{file.name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                {formatSize(file.size)} · Click or drop another file to replace
                              </div>
                            </>
                          ) : (
                            <>
                              <AppIcon name="upload" size={28} color="var(--color-primary)" />
                              <div style={{ fontWeight: 700 }}>Choose a file or drag and drop here</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                PDF, JPEG, or PNG up to 10 MB
                              </div>
                            </>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setScannerTarget(
                                targetDoc
                                  ? targetDoc
                                  : selectedType
                                  ? ({ documentTypeId: selectedType.id, documentTypeName: selectedType.name } as PersonnelDocument)
                                  : null
                              );
                              setScannerOpen(true);
                            }}
                            disabled={busy}
                            style={{ minHeight: 38 }}
                          >
                            <AppIcon name="view" size={14} /> Scan page with camera instead
                          </button>
                        </div>
                      </div>

                      {/* Dates */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        <div className="form-group">
                          <label className="form-label" htmlFor="doc-issue-date">Issue Date</label>
                          <input
                            id="doc-issue-date"
                            type="date"
                            className="form-control"
                            value={issueDate}
                            onChange={e => setIssueDate(e.target.value)}
                            disabled={busy}
                          />
                        </div>

                        {selectedType?.supportsExpiration && (
                          <div className="form-group">
                            <label className="form-label" htmlFor="doc-exp-date">Expiration Date</label>
                            <input
                              id="doc-exp-date"
                              type="date"
                              className="form-control"
                              value={expirationDate}
                              onChange={e => setExpirationDate(e.target.value)}
                              disabled={busy}
                            />
                          </div>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="doc-remarks">Remarks (Optional)</label>
                        <textarea
                          id="doc-remarks"
                          className="form-control"
                          rows={2}
                          placeholder="Add any notes or context about this document…"
                          value={remarks}
                          onChange={e => setRemarks(e.target.value)}
                          disabled={busy}
                        />
                      </div>
                    </>
                  )}

                  {/* Backend Conflict Banner (if server returned 409 on submit) */}
                  {conflictDoc && (
                    <div className="my-documents-conflict-banner" role="alert">
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        A document is already on file for this requirement:
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <strong>{conflictDoc.originalFileName}</strong> ({formatSize(conflictDoc.fileSize)})
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setPreviewDoc(conflictDoc)}
                        >
                          <AppIcon name="view" size={14} /> Preview
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleSwitchToReplace(conflictDoc)}
                        >
                          <AppIcon name="sync" size={14} /> Replace with this file
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Upload Progress */}
                  {uploadProgress !== null && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600 }}>
                        <span>Uploading…</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="my-document-progress-container">
                        <div className="my-document-progress-fill" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Form Error */}
                  {formError && (
                    <div className="form-error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AppIcon name="error" size={14} />
                      <span>{formError}</span>
                    </div>
                  )}
                </div>

                <div className="modal-footer upload-modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => closeUploadModal(false)}
                    disabled={busy}
                    style={{ minHeight: 44 }}
                  >
                    Cancel
                  </button>
                  {!existingActiveDocForSelected && (
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={busy || !file || !typeId}
                      style={{ minHeight: 44 }}
                    >
                      {busy ? 'Submitting…' : targetDoc && targetDoc.hasFile ? 'Replace Document' : 'Submit Document'}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </ModalOverlay>
        </ModalPortal>
      )}

      {reviewDoc && (
        <ModalPortal>
          <ModalOverlay onDismiss={() => { if (!reviewBusy) setReviewDoc(null); }} className="modal-overlay">
            <section className="modal my-documents-extraction-review" role="dialog" aria-modal="true" aria-label="Review extracted 201 data">
              <div className="modal-header">
                <h2>Review 201 data from {reviewDoc.documentTypeName}</h2>
                <button type="button" className="modal-close" aria-label="Close review" onClick={() => setReviewDoc(null)} disabled={reviewBusy}>×</button>
              </div>
              <div className="my-documents-extraction-body">
                <p>Compare the stored 201 record with what was read from {reviewDoc.originalFileName}. Select only values or employment entries you want to record.</p>
                {reviewBusy && !reviewData && <p role="status">Reading document fields…</p>}
                {reviewError && <p className="form-error" role="alert">{reviewError}</p>}
                {reviewData && (
                  <>
                    <p>Extraction confidence: {Math.round(reviewData.confidenceScore * 100)}%</p>
                    {reviewData.fields.length === 0 && !reviewData.employmentEntries?.length ? <p>No supported fields were found in this document.</p> : (
                      <div className="my-documents-extraction-fields">
                        {reviewData.fields.map(field => (
                          <label key={field.field} className="my-documents-extraction-field">
                            <input type="checkbox" checked={reviewSelection.includes(field.field)} disabled={!field.changed || reviewBusy}
                              onChange={event => setReviewSelection(previous => event.target.checked
                                ? [...previous, field.field] : previous.filter(value => value !== field.field))} />
                            <span><strong>{field.label}{field.isLocked ? ' (locked field)' : ''}</strong><br />
                              Current: {field.currentValue || 'Not recorded'}<br />
                              Document: {field.extractedValue}
                            </span>
                          </label>
                        ))}
                        {(reviewData.employmentEntries || []).map((entry, index) => (
                          <label key={`employment-${index}`} className="my-documents-extraction-field">
                            <input type="checkbox" checked={reviewEntrySelection.includes(index)} disabled={reviewBusy}
                              onChange={event => setReviewEntrySelection(previous => event.target.checked
                                ? [...previous, index] : previous.filter(value => value !== index))} />
                            <span><strong>Historical employment {index + 1}</strong><br />
                              {entry.positionTitle} — {entry.department}<br />
                              {entry.dateFrom} to {entry.dateTo || 'Present'}{entry.status ? ` · ${entry.status}` : ''}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setReviewDoc(null)} disabled={reviewBusy}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={() => void applyExtractionReview()}
                  disabled={reviewBusy || !reviewData || (reviewSelection.length === 0 && reviewEntrySelection.length === 0) || reviewData.confidenceScore < 0.8}>
                  {reviewBusy ? 'Updating…' : reviewEntrySelection.length ? 'Record selected employment' : 'Update selected fields'}
                </button>
              </div>
            </section>
          </ModalOverlay>
        </ModalPortal>
      )}

      {/* In-App Document Viewer Modal */}
      {previewDoc && (
        <DocumentViewerModal
          isOpen={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
          title={previewDoc.documentTypeName}
          fileName={previewDoc.originalFileName || undefined}
          fileSize={previewDoc.fileSize || undefined}
          mimeType={previewDoc.mimeType || undefined}
          fileUrl={previewDoc.fileUrl || `/personnel/documents/${previewDoc.id}/file`}
        />
      )}

      {/* In-App Document Scanner Modal */}
      {scannerOpen && (
        <DocumentScannerModal
          isOpen={scannerOpen}
          onClose={() => {
            setScannerOpen(false);
            setScannerTarget(null);
          }}
          onScanComplete={handleScanFinished}
          documentTypeName={scannerTarget?.documentTypeName || (selectedType?.name ? selectedType.name : 'Document')}
        />
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <ModalPortal>
          <ModalOverlay onDismiss={busy ? undefined : () => setConfirmDelete(null)}>
            <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="del-doc-title" style={{ maxWidth: 460, width: '100%' }}>
              <div className="modal-header">
                <h2 id="del-doc-title" style={{ margin: 0, fontSize: '1.05rem' }}>
                  {confirmDelete.isRequired ? 'Reset Required Document?' : 'Remove Document?'}
                </h2>
                <button
                  type="button"
                  className="upload-modal-close-btn"
                  onClick={() => setConfirmDelete(null)}
                  aria-label="Close dialog"
                  disabled={busy}
                >
                  <AppIcon name="close" size={18} />
                </button>
              </div>
              <div className="modal-body">
                <p style={{ margin: 0 }}>
                  Are you sure you want to remove the file for <strong>{confirmDelete.documentTypeName}</strong>?
                </p>
                {confirmDelete.isRequired ? (
                  <p className="text-muted" style={{ fontSize: '0.8125rem', margin: '8px 0 0' }}>
                    Because this is a mandatory checklist item, removing this upload will reset it to an unsubmitted placeholder so you can submit a new file later.
                  </p>
                ) : (
                  <p className="text-muted" style={{ fontSize: '0.8125rem', margin: '8px 0 0' }}>
                    This document will be archived from your 201 file. Any versions previously submitted with promotion applications will be preserved.
                  </p>
                )}
              </div>
              <div className="modal-footer" style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setConfirmDelete(null)}
                  disabled={busy}
                  style={{ flex: 1, minHeight: 44 }}
                >
                  Keep Document
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDelete}
                  disabled={busy}
                  style={{ flex: 1, minHeight: 44 }}
                >
                  {busy ? 'Processing…' : confirmDelete.isRequired ? 'Reset Slot' : 'Remove'}
                </button>
              </div>
            </div>
          </ModalOverlay>
        </ModalPortal>
      )}
    </div>
  );
};

export default MyDocuments;
