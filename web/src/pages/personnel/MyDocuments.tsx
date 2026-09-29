import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppIcon } from '../../components/common/AppIcon';
import { PageHeader } from '../../components/common/PageHeader';
import { AsyncState } from '../../components/common/AsyncState';
import { ActionMenu, ActionMenuItem } from '../../components/common/ActionMenu';
import { ModalPortal } from '../../components/common/ModalPortal';
import { ModalOverlay } from '../../components/common/ModalOverlay';
import { DocumentViewerModal } from '../../components/common/DocumentViewerModal';
import { DocumentScannerModal } from '../../components/common/DocumentScannerModal';
import { useToast } from '../../contexts/ToastContext';
import apiClient from '../../api/client';
import {
  PersonnelDocumentRecord,
  DepEdDocumentCategory,
  DEPED_DOCUMENT_CATEGORIES,
  categorizeDocument,
  resolveDocumentLifecycle,
  computeReadiness,
  detectDuplicateHashes,
  LIFECYCLE_CONFIG,
  isDocExpired,
  isDocExpiringSoon,
} from '../../models/documentStatus';
import './my-documents.css';

export type PersonnelDocument = PersonnelDocumentRecord;

export type DocumentTypeConfig = {
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

export const isExpired = (doc: { expirationDate?: string | null }): boolean => isDocExpired(doc);

export const isExpiringSoon = (doc: { expirationDate?: string | null }): boolean => isDocExpiringSoon(doc);

/**
 * Backward-compatible helper for existing UI callers.
 */
export const getPersonnelStatusMeta = (doc: PersonnelDocument): { bg: string; fg: string; label: string; isActionNeeded: boolean } => {
  if (!doc.hasFile) {
    return { bg: 'rgba(100, 116, 139, 0.12)', fg: '#475569', label: 'No file uploaded', isActionNeeded: Boolean(doc.isRequired) };
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
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Modals state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [targetDoc, setTargetDoc] = useState<PersonnelDocument | null>(null);
  const [previewDoc, setPreviewDoc] = useState<PersonnelDocument | null>(null);
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

  // Unified File Readiness computation
  const readiness = useMemo(() => computeReadiness(documents), [documents]);

  // Duplicate Hash Detection
  const duplicateHashMap = useMemo(() => detectDuplicateHashes(documents), [documents]);

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
      await apiClient.post('/personnel/documents', form, {
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

  /**
   * Safe deletion: Only unverified, unsubmitted draft placeholders may be deleted.
   * Directly prohibits deletion of submitted, under-review, or verified documents.
   */
  const handleDelete = async () => {
    if (!confirmDelete || busy) return;

    const lifecycle = resolveDocumentLifecycle(confirmDelete);
    if (lifecycle === 'VERIFIED' || lifecycle === 'UNDER_REVIEW') {
      addToast('DepEd Policy: Official records that are verified or under active review cannot be deleted.', 'ERROR');
      setConfirmDelete(null);
      return;
    }

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

  // Filtered documents by Tab
  const filteredByTab = useMemo(() => {
    return documents.filter(doc => {
      const lifecycle = resolveDocumentLifecycle(doc);
      if (activeTab === 'REQUIRED') return doc.isRequired && lifecycle === 'MISSING';
      if (activeTab === 'ACTION_NEEDED') {
        return (
          lifecycle === 'RETURNED' ||
          lifecycle === 'REPLACEMENT_REQUIRED' ||
          lifecycle === 'EXPIRED' ||
          (doc.isRequired && lifecycle === 'MISSING')
        );
      }
      if (activeTab === 'EXPIRING_SOON') {
        return lifecycle === 'EXPIRING_SOON';
      }
      return true;
    });
  }, [documents, activeTab]);

  // Further filter by Category
  const finalFilteredDocuments = useMemo(() => {
    if (selectedCategory === 'ALL') return filteredByTab;
    return filteredByTab.filter(doc => categorizeDocument(doc) === selectedCategory);
  }, [filteredByTab, selectedCategory]);

  // Group by DepEd Category
  const groupedDocuments = useMemo(() => {
    const groups = new Map<DepEdDocumentCategory, PersonnelDocument[]>();
    const order: DepEdDocumentCategory[] = [
      'PERSONAL_INFO',
      'APPOINTMENT',
      'ACADEMIC',
      'ELIGIBILITY',
      'PERFORMANCE',
      'TRAINING',
      'OTHER',
    ];

    for (const cat of order) {
      groups.set(cat, []);
    }

    for (const doc of finalFilteredDocuments) {
      const cat = categorizeDocument(doc);
      const list = groups.get(cat) || [];
      list.push(doc);
      groups.set(cat, list);
    }

    return groups;
  }, [finalFilteredDocuments]);

  // Summary counts for tabs
  const tabCounts = useMemo(() => {
    let required = 0;
    let actionNeeded = 0;
    let expiringSoon = 0;

    for (const d of documents) {
      const lc = resolveDocumentLifecycle(d);
      if (d.isRequired && lc === 'MISSING') required++;
      if (lc === 'RETURNED' || lc === 'REPLACEMENT_REQUIRED' || lc === 'EXPIRED' || (d.isRequired && lc === 'MISSING')) {
        actionNeeded++;
      }
      if (lc === 'EXPIRING_SOON') expiringSoon++;
    }

    return { all: documents.length, required, actionNeeded, expiringSoon };
  }, [documents]);

  return (
    <div className="page-container personnel-content-container">
      <PageHeader
        title="My 201 Files & Repository"
        subtitle="Keep your required files on hand. Reviewers check them when you submit a filing."
        breadcrumbs={[
          { label: 'Portal Home', to: '/personnel/home' },
          { label: 'My 201 Files' },
        ]}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setScannerTarget(null);
                setScannerOpen(true);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
            >
              <AppIcon name="camera" size={14} /> Scan with Camera
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => openUploadModal(null)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
            >
              <AppIcon name="upload" size={14} /> Upload Document
            </button>
          </div>
        }
      />

      {/* 201 File Readiness Summary Banner (Single Source of Truth) */}
      <div
        className="card mb-4"
        style={{
          borderRadius: 16,
          padding: 20,
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Your 201 files
            </div>
            <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: 2 }}>
              {readiness.verified} of {readiness.total} required files uploaded
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              Uploaded files are on hand, not automatically approved. AO II and HRMO review them as part of a filing.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 9999,
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#059669',
                border: '1px solid rgba(16, 185, 129, 0.25)',
              }}
            >
              {readiness.verified} Uploaded
            </span>
            {readiness.underReview > 0 && (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 9999,
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: '#d97706',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                }}
              >
                {readiness.underReview} Under Review
              </span>
            )}
            {readiness.missing > 0 && (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 9999,
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#dc2626',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                }}
              >
                {readiness.missing} Missing
              </span>
            )}
            {readiness.returned > 0 && (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 9999,
                  background: 'rgba(239, 68, 68, 0.18)',
                  color: '#dc2626',
                  border: '1px solid #ef4444',
                }}
              >
                {readiness.returned} Returned for Correction
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ height: 8, background: 'var(--color-bg-secondary)', borderRadius: 9999, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${readiness.percent}%`,
              background:
                readiness.statusLevel === 'complete'
                  ? '#10b981'
                  : readiness.statusLevel === 'good'
                  ? 'var(--color-primary)'
                  : readiness.statusLevel === 'attention'
                  ? '#f59e0b'
                  : '#ef4444',
              borderRadius: 9999,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* Duplicate File Hash Warning Banner */}
      {duplicateHashMap.size > 0 && (
        <div
          className="card mb-4"
          style={{
            background: 'rgba(245, 158, 11, 0.06)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: 12,
            padding: 14,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <AppIcon name="warning" size={20} color="#d97706" />
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
            <strong style={{ color: '#b45309' }}>Duplicate Attachment Notice:</strong> The exact same file hash was detected across multiple distinct requirements:
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              {Array.from(duplicateHashMap.entries()).map(([hash, docs], hIdx) => (
                <li key={hIdx} style={{ color: 'var(--color-text-secondary)' }}>
                  Same file used for: <strong style={{ color: 'var(--color-text-primary)' }}>{docs.join(', ')}</strong>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              DepEd qualification rules require each checklist requirement to be substantiated with its specific authentic certificate or document.
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs & Category Selector */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`btn btn-sm ${activeTab === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontWeight: 700 }}
          >
            All Files ({tabCounts.all})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('REQUIRED')}
            className={`btn btn-sm ${activeTab === 'REQUIRED' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontWeight: 700 }}
          >
            Missing ({tabCounts.required})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ACTION_NEEDED')}
            className={`btn btn-sm ${activeTab === 'ACTION_NEEDED' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              fontWeight: 700,
              background: activeTab === 'ACTION_NEEDED' ? '#dc2626' : undefined,
              borderColor: activeTab === 'ACTION_NEEDED' ? '#dc2626' : undefined,
            }}
          >
            Action Needed ({tabCounts.actionNeeded})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('EXPIRING_SOON')}
            className={`btn btn-sm ${activeTab === 'EXPIRING_SOON' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontWeight: 700 }}
          >
            Expiring Soon ({tabCounts.expiringSoon})
          </button>
        </div>

        {/* Category Filter Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="category-filter" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Category:
          </label>
          <select
            id="category-filter"
            className="form-control"
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            style={{ padding: '6px 12px', fontSize: '0.8125rem', borderRadius: 8 }}
          >
            <option value="ALL">All Categories</option>
            {Object.values(DEPED_DOCUMENT_CATEGORIES).map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content with AsyncState */}
      <AsyncState
        loading={loading}
        error={loadError}
        onRetry={load}
        isEmpty={finalFilteredDocuments.length === 0}
        emptyTitle="No Documents Found"
        emptyMessage="There are no documents matching the selected filter in your 201 library."
        emptyAction={{
          label: 'Upload New Document',
          onClick: () => openUploadModal(null),
        }}
        loadingText="Loading 201 records repository..."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {Array.from(groupedDocuments.entries()).sort((a, b) => {
            const needsAction = (docs: PersonnelDocument[]) => docs.some(doc => {
              const state = resolveDocumentLifecycle(doc);
              return state === 'RETURNED' || state === 'REPLACEMENT_REQUIRED' || state === 'EXPIRED' || (doc.isRequired && state === 'MISSING');
            });
            return Number(needsAction(b[1])) - Number(needsAction(a[1]));
          }).map(([catKey, catDocs]) => {
            if (catDocs.length === 0) return null;
            const catMeta = DEPED_DOCUMENT_CATEGORIES[catKey];

            return (
              <div
                key={catKey}
                className="card"
                style={{
                  borderRadius: 16,
                  padding: 20,
                  border: '1px solid var(--color-border)',
                }}
              >
                {/* Category Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: 'var(--color-bg-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-primary)',
                      }}
                    >
                      <AppIcon name={catMeta.icon as any} size={18} />
                    </div>
                    <div>
                      <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
                        {catMeta.name}
                      </h2>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {catMeta.description}
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 9999,
                      background: 'var(--color-bg-secondary)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {catDocs.length} Record{catDocs.length === 1 ? '' : 's'}
                  </span>
                </div>

                {/* Documents Table / Card List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[...catDocs].sort((a, b) => {
                    const priority = (doc: PersonnelDocument) => {
                      const state = resolveDocumentLifecycle(doc);
                      return state === 'RETURNED' || state === 'REPLACEMENT_REQUIRED' || state === 'EXPIRED' ? 0
                        : doc.isRequired && state === 'MISSING' ? 1 : state === 'EXPIRING_SOON' ? 2 : 3;
                    };
                    return priority(a) - priority(b);
                  }).map(doc => {
                    const lifecycle = resolveDocumentLifecycle(doc);
                    const badgeConfig = LIFECYCLE_CONFIG[lifecycle];
                    const isMissing = lifecycle === 'MISSING';
                    const isReturned = lifecycle === 'RETURNED' || lifecycle === 'REPLACEMENT_REQUIRED';
                    const isUnderReview = lifecycle === 'UNDER_REVIEW';
                    const isVerified = lifecycle === 'VERIFIED';
                    const isExpSoon = lifecycle === 'EXPIRING_SOON';

                    // Contextual primary action click handler
                    const handlePrimaryAction = () => {
                      if (isMissing || isReturned || isExpSoon || lifecycle === 'EXPIRED') {
                        openUploadModal(doc);
                      } else if (doc.hasFile) {
                        setPreviewDoc(doc);
                      }
                    };

                    // Secondary action items for 3-dot ActionMenu
                    const actionMenuItems: ActionMenuItem[] = [];

                    if (doc.hasFile) {
                      actionMenuItems.push({
                        id: 'preview',
                        label: 'View Preview',
                        icon: 'eye',
                        onSelect: () => setPreviewDoc(doc),
                      });
                    }

                    actionMenuItems.push({
                      id: 'replace',
                      label: doc.hasFile ? 'Replace Document' : 'Upload File',
                      icon: 'upload',
                      onSelect: () => openUploadModal(doc),
                    });

                    actionMenuItems.push({
                      id: 'scan',
                      label: 'Scan with Camera',
                      icon: 'camera',
                      onSelect: () => {
                        setScannerTarget(doc);
                        setScannerOpen(true);
                      },
                    });

                    // Prohibit deletion of verified, under-review, or submitted documents
                    const canDelete = badgeConfig.canDelete && !isVerified && !isUnderReview;
                    if (doc.hasFile && canDelete) {
                      actionMenuItems.push({
                        id: 'delete',
                        label: 'Reset / Remove File',
                        icon: 'trash',
                        tone: 'danger',
                        onSelect: () => setConfirmDelete(doc),
                      });
                    }

                    return (
                      <div
                        key={doc.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          borderRadius: 12,
                          background: isReturned
                            ? 'rgba(239, 68, 68, 0.03)'
                            : 'var(--color-bg-secondary)',
                          border: isReturned
                            ? '1px solid rgba(239, 68, 68, 0.35)'
                            : '1px solid var(--color-border)',
                          flexWrap: 'wrap',
                          gap: 12,
                        }}
                      >
                        {/* Doc Details */}
                        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                            <strong style={{ fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>
                              {doc.documentTypeName || 'Official Record'}
                            </strong>
                            {doc.isRequired && (
                              <span
                                style={{
                                  fontSize: '0.6875rem',
                                  fontWeight: 800,
                                  color: '#dc2626',
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                }}
                              >
                                MANDATORY
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {doc.originalFileName ? (
                              <span>File: <strong style={{ color: 'var(--color-text-secondary)' }}>{doc.originalFileName}</strong> ({formatSize(doc.fileSize)})</span>
                            ) : (
                              <span style={{ fontStyle: 'italic', color: '#dc2626' }}>No file attached</span>
                            )}
                            {doc.uploadedAt && <span>· Uploaded: {formatDate(doc.uploadedAt)}</span>}
                            {doc.expirationDate && (
                              <span>
                                · Valid until: <strong style={{ color: isExpired(doc) ? '#dc2626' : undefined }}>{formatDate(doc.expirationDate)}</strong>
                              </span>
                            )}
                          </div>

                          {/* Rejection / Deficiency remarks */}
                          {doc.rejectionReason && (
                            <div
                              style={{
                                marginTop: 6,
                                padding: '4px 8px',
                                borderRadius: 6,
                                background: 'rgba(239, 68, 68, 0.08)',
                                color: '#dc2626',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                              }}
                            >
                              AO II Remarks: {doc.rejectionReason}
                            </div>
                          )}
                        </div>

                        {/* Lifecycle Badge & Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          {/* 9-state Explicit Lifecycle Badge */}
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '4px 10px',
                              borderRadius: 9999,
                              background: badgeConfig.bg,
                              color: badgeConfig.fg,
                              border: `1px solid ${badgeConfig.border}`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <AppIcon name={badgeConfig.icon as any} size={12} color={badgeConfig.fg} />
                            {badgeConfig.label}
                          </span>

                          {/* Single Primary Contextual Action Button */}
                          <button
                            type="button"
                            className={`btn btn-sm ${isReturned || isMissing ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={handlePrimaryAction}
                            style={{
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              padding: '6px 12px',
                              background: isReturned ? '#dc2626' : undefined,
                              borderColor: isReturned ? '#dc2626' : undefined,
                            }}
                          >
                            {badgeConfig.primaryActionLabel}
                          </button>

                          {/* Secondary Actions 3-dot Menu */}
                          <ActionMenu
                            label={`Actions for ${doc.documentTypeName}`}
                            items={actionMenuItems}
                            size="sm"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </AsyncState>

      {/* Upload & Replacement Modal */}
      {uploadOpen && (
        <ModalPortal>
          <ModalOverlay onDismiss={() => closeUploadModal()}>
            <div
              className="card upload-modal-card"
              style={{
                width: '100%',
                maxWidth: 520,
                padding: 24,
                borderRadius: 16,
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                maxHeight: '90vh',
                overflowY: 'auto',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800 }}>
                  {modalTitle}
                </h3>
                <button
                  type="button"
                  onClick={() => closeUploadModal()}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                  aria-label="Close dialog"
                >
                  <AppIcon name="close" size={18} />
                </button>
              </div>

              {formError && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#dc2626',
                    fontSize: '0.8125rem',
                    marginBottom: 16,
                  }}
                >
                  {formError}
                </div>
              )}

              {conflictDoc && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    marginBottom: 16,
                    fontSize: '0.8125rem',
                  }}
                >
                  <strong style={{ color: '#b45309' }}>Conflict Detected:</strong> A verified version of this document already exists on file.
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleSwitchToReplace(conflictDoc)}
                      style={{ fontWeight: 700 }}
                    >
                      Replace Existing File
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={submitUpload}>
                {/* Document Type Selector (Disabled if pre-targeted) */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: 4 }}>
                    Document Type
                  </label>
                  <select
                    className="form-control"
                    value={typeId}
                    onChange={e => {
                      setTypeId(e.target.value);
                      setFormError('');
                    }}
                    disabled={Boolean(targetDoc?.documentTypeId)}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.875rem' }}
                  >
                    <option value="">Select standard document type...</option>
                    {types.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {typeId === 'OTHER' && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: 4 }}>
                      Document Description / Title
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={customName}
                      onChange={e => setCustomName(e.target.value)}
                      placeholder="e.g. Special Order No. 12 or Service Recognition Award"
                      required
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.875rem' }}
                    />
                  </div>
                )}

                {/* Expiration date if applicable */}
                {(selectedType?.supportsExpiration || typeId.includes('PRC') || typeId.includes('NBI')) && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: 4 }}>
                      Validity / Expiration Date
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={expirationDate}
                      onChange={e => setExpirationDate(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.875rem' }}
                    />
                  </div>
                )}

                {/* File Dropzone */}
                <div
                  style={{
                    border: `2px dashed ${dragActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    borderRadius: 12,
                    padding: 24,
                    textAlign: 'center',
                    background: dragActive ? 'rgba(2, 132, 199, 0.04)' : 'var(--color-bg-secondary)',
                    marginBottom: 16,
                    cursor: 'pointer',
                  }}
                  onDragOver={e => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragActive(false);
                    if (e.dataTransfer.files?.[0]) handlePickFile(e.dataTransfer.files[0]);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED}
                    style={{ display: 'none' }}
                    onChange={e => {
                      if (e.target.files?.[0]) handlePickFile(e.target.files[0]);
                    }}
                  />
                  <AppIcon name="upload" size={28} color="var(--color-primary)" />
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', marginTop: 8 }}>
                    {file ? file.name : 'Click to browse or drag file here'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                    Supported formats: PDF, PNG, JPG (Maximum 10 MB)
                  </div>
                </div>

                {uploadProgress !== null && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4 }}>
                      <span>Uploading...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--color-bg-secondary)', borderRadius: 9999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'var(--color-primary)' }} />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => closeUploadModal()}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={busy || !file}
                    style={{ fontWeight: 700 }}
                  >
                    {busy ? 'Uploading...' : targetDoc?.hasFile ? 'Replace Document' : 'Submit Document'}
                  </button>
                </div>
              </form>
            </div>
          </ModalOverlay>
        </ModalPortal>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <ModalPortal>
          <ModalOverlay onDismiss={() => setConfirmDelete(null)}>
            <div
              className="card"
              style={{
                width: '100%',
                maxWidth: 420,
                padding: 24,
                borderRadius: 16,
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 12px 0', fontSize: '1.125rem', fontWeight: 800, color: '#dc2626' }}>
                Confirm Document Deletion
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 20 }}>
                Are you sure you want to remove <strong>{confirmDelete.documentTypeName}</strong> from your 201 records?
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setConfirmDelete(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDelete}
                  disabled={busy}
                  style={{ background: '#dc2626', borderColor: '#dc2626', color: '#fff', fontWeight: 700 }}
                >
                  {busy ? 'Removing...' : 'Yes, Remove File'}
                </button>
              </div>
            </div>
          </ModalOverlay>
        </ModalPortal>
      )}

      {/* Mobile Camera Scanner Modal */}
      {scannerOpen && (
        <DocumentScannerModal
          isOpen={scannerOpen}
          documentTypeName={scannerTarget?.documentTypeName || selectedType?.name || '201 Document'}
          onClose={() => {
            setScannerOpen(false);
            setScannerTarget(null);
          }}
          onScanComplete={handleScanFinished}
        />
      )}

      {/* Authenticated Document Viewer Modal */}
      {previewDoc && (
        <DocumentViewerModal
          isOpen={Boolean(previewDoc)}
          fileUrl={previewDoc.fileUrl || `/personnel/documents/${previewDoc.id}/file`}
          title={previewDoc.documentTypeName || '201 Document Preview'}
          mimeType={previewDoc.mimeType || 'application/pdf'}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
};
