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
};

type DocumentTypeConfig = {
  id: string;
  name: string;
  supportsExpiration: boolean;
  description: string;
  category: string;
};

type TabFilter = 'ALL' | 'REQUIRED' | 'ACTION_NEEDED' | 'UNDER_REVIEW' | 'APPROVED';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED = '.pdf,.png,.jpg,.jpeg';

const formatSize = (bytes?: number | null): string => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (value?: string | null): string => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const isExpired = (doc: PersonnelDocument): boolean => {
  if (!doc.expirationDate) return false;
  const due = new Date(doc.expirationDate);
  if (Number.isNaN(due.getTime())) return false;
  return due < new Date(new Date().toDateString());
};

const getStatusMeta = (status: string, expired: boolean): { bg: string; fg: string; label: string } => {
  if (expired) {
    return { bg: 'rgba(239, 68, 68, 0.12)', fg: '#dc2626', label: 'Expired' };
  }
  switch (status) {
    case 'NOT_SUBMITTED':
      return { bg: 'rgba(100, 116, 139, 0.12)', fg: '#475569', label: 'Not Submitted' };
    case 'APPROVED':
      return { bg: 'rgba(16, 185, 129, 0.12)', fg: '#059669', label: 'Approved' };
    case 'REJECTED':
      return { bg: 'rgba(239, 68, 68, 0.12)', fg: '#dc2626', label: 'Rejected' };
    case 'REPLACEMENT_REQUIRED':
      return { bg: 'rgba(239, 68, 68, 0.12)', fg: '#dc2626', label: 'Replacement Required' };
    case 'UNDER_REVIEW':
      return { bg: 'rgba(139, 92, 246, 0.12)', fg: '#7c3aed', label: 'Under Review' };
    case 'SUBMITTED':
    default:
      return { bg: 'rgba(37, 99, 235, 0.12)', fg: '#2563eb', label: 'Submitted' };
  }
};

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
  const [scannerDoc, setScannerDoc] = useState<PersonnelDocument | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PersonnelDocument | null>(null);

  // Auto-open camera scanner if URL contains ?action=scan or ?scan=1
  useEffect(() => {
    if (searchParams.get('action') === 'scan' || searchParams.get('scan') === '1') {
      setScannerDoc({} as any);
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
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const resetForm = () => {
    setFile(null);
    setTypeId('');
    setCustomName('');
    setIssueDate('');
    setExpirationDate('');
    setRemarks('');
    setFormError('');
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openUploadModal = (target?: PersonnelDocument | null, initialFile?: File) => {
    resetForm();
    setTargetDoc(target || null);
    if (target) {
      setTypeId(target.documentTypeId);
      setCustomName(target.documentTypeId === 'OTHER' ? target.documentTypeName : '');
      setIssueDate(target.issueDate || '');
      setExpirationDate(target.expirationDate || '');
      setRemarks(target.remarks || '');
    }
    if (initialFile) {
      setFile(initialFile);
    }
    setUploadOpen(true);
  };

  const closeUploadModal = () => {
    if (busy) return;
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
    if (scannerDoc) {
      openUploadModal(scannerDoc, scannedFile);
    } else {
      openUploadModal(null, scannedFile);
    }
    setScannerDoc(null);
  };

  const submitUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!typeId) {
      setFormError('Please select a document type.');
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

    // If targeting an existing document (placeholder or replacement)
    if (targetDoc) {
      form.append('replacesDocumentId', String(targetDoc.id));
    }

    setBusy(true);
    setUploadProgress(0);

    try {
      await apiClient.post('/personnel/documents', form, {
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
      closeUploadModal();
      await load();
    } catch (error: any) {
      setFormError(error?.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
      setUploadProgress(null);
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

  // Filtered documents
  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      const expired = isExpired(doc);
      if (activeTab === 'REQUIRED') return doc.isRequired;
      if (activeTab === 'ACTION_NEEDED') {
        return doc.status === 'NOT_SUBMITTED' || doc.status === 'REPLACEMENT_REQUIRED' || doc.status === 'REJECTED' || expired;
      }
      if (activeTab === 'UNDER_REVIEW') {
        return doc.status === 'SUBMITTED' || doc.status === 'UNDER_REVIEW';
      }
      if (activeTab === 'APPROVED') {
        return doc.status === 'APPROVED' && !expired;
      }
      return true;
    });
  }, [documents, activeTab]);

  const counts = useMemo(() => {
    let required = 0;
    let actionNeeded = 0;
    let underReview = 0;
    let approved = 0;

    for (const d of documents) {
      if (d.isRequired) required++;
      const expired = isExpired(d);
      if (d.status === 'NOT_SUBMITTED' || d.status === 'REPLACEMENT_REQUIRED' || d.status === 'REJECTED' || expired) {
        actionNeeded++;
      }
      if (d.status === 'SUBMITTED' || d.status === 'UNDER_REVIEW') {
        underReview++;
      }
      if (d.status === 'APPROVED' && !expired) {
        approved++;
      }
    }

    return { all: documents.length, required, actionNeeded, underReview, approved };
  }, [documents]);

  const expiringSoonCount = useMemo(() => {
    return documents.filter(d => {
      if (!d.expirationDate || isExpired(d)) return false;
      const due = new Date(d.expirationDate).getTime();
      return due - Date.now() < 60 * 24 * 60 * 60 * 1000;
    }).length;
  }, [documents]);

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
            onClick={() => setScannerDoc({} as any)}
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
      {expiringSoonCount > 0 && (
        <div className="dashboard-error" role="status" style={{ margin: '0 0 16px', background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
            <AppIcon name="clock" size={16} />
            {expiringSoonCount} document{expiringSoonCount === 1 ? '' : 's'} in your 201 file expire within 60 days. Please arrange renewals ahead of time.
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
            aria-selected={activeTab === 'UNDER_REVIEW'}
            className={`my-documents-tab ${activeTab === 'UNDER_REVIEW' ? 'active' : ''}`}
            onClick={() => setActiveTab('UNDER_REVIEW')}
          >
            <span>Under Review</span>
            <span className="my-documents-tab-count">{counts.underReview}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'APPROVED'}
            className={`my-documents-tab ${activeTab === 'APPROVED' ? 'active' : ''}`}
            onClick={() => setActiveTab('APPROVED')}
          >
            <span>Approved</span>
            <span className="my-documents-tab-count">{counts.approved}</span>
          </button>
        </div>
        <div className="my-documents-tabs-fade-right" aria-hidden="true" />
      </div>

      {/* Document Grid */}
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
              : 'No documents match the selected filter category.'
          }
          primaryAction={{ label: 'View All Documents', onClick: () => setActiveTab('ALL'), icon: 'document' }}
        />
      ) : (
        <div className="my-documents-grid">
          {filteredDocuments.map(doc => {
            const expired = isExpired(doc);
            const statusMeta = getStatusMeta(doc.status, expired);
            const isDeficient = doc.status === 'REJECTED' || doc.status === 'REPLACEMENT_REQUIRED' || expired;

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

                {/* Rejection / Replacement Banner */}
                {(doc.rejectionReason || doc.status === 'REPLACEMENT_REQUIRED' || expired) && (
                  <div className="my-document-rejection">
                    <strong>Action Required: </strong>
                    {doc.rejectionReason
                      ? doc.rejectionReason
                      : expired
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
                      <dt>{expired ? 'Expired On' : 'Valid Until'}</dt>
                      <dd style={expired ? { color: '#dc2626', fontWeight: 700 } : undefined}>
                        {formatDate(doc.expirationDate)}
                      </dd>
                    </div>
                  )}
                </dl>

                {/* Action Buttons */}
                <div className="my-document-actions">
                  {doc.hasFile ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setPreviewDoc(doc)}
                        title="View document preview"
                      >
                        <AppIcon name="view" size={15} /> View
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => openUploadModal(doc)}
                        title="Replace this document"
                      >
                        <AppIcon name="sync" size={15} /> Replace
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setScannerDoc(doc)}
                        title="Scan replacement with camera"
                      >
                        <AppIcon name="view" size={15} /> Scan
                      </button>
                      {doc.status !== 'APPROVED' && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm my-document-delete"
                          onClick={() => setConfirmDelete(doc)}
                          title="Delete or reset document"
                        >
                          <AppIcon name="delete" size={15} />
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => openUploadModal(doc)}
                      >
                        <AppIcon name="upload" size={15} /> Upload File
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setScannerDoc(doc)}
                      >
                        <AppIcon name="view" size={15} /> Scan with Camera
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Upload & Replacement Modal */}
      {uploadOpen && (
        <ModalPortal>
          <ModalOverlay onDismiss={closeUploadModal}>
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="upload-modal-title" style={{ maxWidth: 560, width: '100%' }}>
              <form onSubmit={submitUpload}>
                <div className="modal-header">
                  <h2 id="upload-modal-title" style={{ margin: 0, fontSize: '1.05rem' }}>
                    {targetDoc && targetDoc.hasFile
                      ? `Replace: ${targetDoc.documentTypeName}`
                      : targetDoc
                      ? `Upload: ${targetDoc.documentTypeName}`
                      : 'Upload 201 Document'}
                  </h2>
                  <button type="button" className="my-document-close" onClick={closeUploadModal} aria-label="Close" disabled={busy}>
                    <AppIcon name="close" size={18} />
                  </button>
                </div>

                <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
                  {/* Document Type Selector */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="doc-type-select">Document Type *</label>
                    <select
                      id="doc-type-select"
                      className="form-select"
                      value={typeId}
                      disabled={busy || Boolean(targetDoc)}
                      onChange={e => {
                        setTypeId(e.target.value);
                        setFormError('');
                      }}
                    >
                      <option value="">Choose document type…</option>
                      {types.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
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
                        onChange={e => setCustomName(e.target.value)}
                        disabled={busy}
                      />
                    </div>
                  )}

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
                          setScannerDoc(targetDoc || { documentTypeName: selectedType?.name || 'Document' } as any);
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

                <div className="modal-footer" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={closeUploadModal}
                    disabled={busy}
                    style={{ minHeight: 44 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={busy || !file || !typeId}
                    style={{ minHeight: 44 }}
                  >
                    {busy ? 'Submitting…' : 'Submit Document'}
                  </button>
                </div>
              </form>
            </div>
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
          viewTokenUrl={`/personnel/documents/${previewDoc.id}/view-token`}
        />
      )}

      {/* In-App Document Scanner Modal */}
      {scannerDoc && (
        <DocumentScannerModal
          isOpen={Boolean(scannerDoc)}
          onClose={() => setScannerDoc(null)}
          onScanComplete={handleScanFinished}
          documentTypeName={scannerDoc.documentTypeName || 'Document'}
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
