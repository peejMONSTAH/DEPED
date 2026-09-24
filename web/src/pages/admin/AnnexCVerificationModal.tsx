import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Eye,
  FileText,
  Check,
  AlertCircle,
  RotateCw,
  Download,
  Loader2,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { ModalOverlay } from '../../components/common/ModalOverlay';
import { AppIcon } from '../../components/common/AppIcon';

import { useDocumentPreview, downloadDocument } from '../../components/common/useDocumentPreview';
import { PreviewZoomControls } from '../../components/common/PreviewZoomControls';
import { useToast } from '../../contexts/ToastContext';
import { groupByAnnex, requirementState, REQUIREMENT_STATE_LABEL } from '../../promotions/annexGroups';
import './annex-c-verification-modal.css';
import { PdfPages } from '../../components/common/PdfPages';

export interface AnnexCItemState {
  code: string;
  title: string;
  description: string;
  isMandatory: boolean;
  submitted: boolean;
  documentName?: string;
  documentType?: string;
  personnelDocumentId?: number;
  status: 'VERIFIED' | 'INCOMPLETE' | 'NOT_APPLICABLE';
  remarks?: string;
}

export interface AnnexCVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  applicant: any;
  cycle: any;
  modalTrack?: 'TEACHING' | 'NON_TEACHING';
  theme?: string;
  items: AnnexCItemState[];
  setItems: React.Dispatch<React.SetStateAction<AnnexCItemState[]>>;
  completenessStatus: 'COMPLETE' | 'INCOMPLETE';
  setCompletenessStatus: (status: 'COMPLETE' | 'INCOMPLETE') => void;
  remarks: string;
  setRemarks: (remarks: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  initialActiveDocCode?: string;
}

const formatSize = (bytes?: number): string => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const AnnexCVerificationModal: React.FC<AnnexCVerificationModalProps> = ({
  isOpen,
  onClose,
  applicant,
  cycle,
  modalTrack = 'TEACHING',
  theme,
  items,
  setItems,
  completenessStatus,
  setCompletenessStatus,
  remarks,
  setRemarks,
  onSubmit,
  isPending,
  initialActiveDocCode,
}) => {
  // Document Inspector State
  const [activeDoc, setActiveDoc] = useState<AnnexCItemState | null>(() => {
    if (initialActiveDocCode) {
      return items.find(it => it.code === initialActiveDocCode && it.personnelDocumentId) || null;
    }
    return null;
  });
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [downloading, setDownloading] = useState(false);
  const { addToast } = useToast();

  // Density & View preferences
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
  const [showAllDescriptions, setShowAllDescriptions] = useState(false);

  // Ref tracking trigger button for focus restoration
  const triggerButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Keyed on the document id, not the item object, so neither re-renders nor
  // zooming nor the published blob URL can start another fetch.
  const activeDocId = isOpen ? activeDoc?.personnelDocumentId : undefined;
  const activeFileUrl = activeDocId ? `/personnel/documents/${activeDocId}/file` : null;
  const { preview, retry } = useDocumentPreview(
    activeFileUrl,
    activeDoc?.documentName?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : undefined,
  );
  const docLoading = preview.status === 'loading';
  const docError = preview.error;
  const blobUrl = preview.url;
  const resolvedType = preview.type;

  // A newly selected document always opens unzoomed.
  useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [activeDocId]);

  // When modal closes, reset active preview
  useEffect(() => {
    if (!isOpen) setActiveDoc(null);
  }, [isOpen]);

  if (!isOpen || !applicant) return null;

  // Derivations for live progress summary
  const verifiedCount = items.filter(it => it.status === 'VERIFIED').length;
  const deficientCount = items.filter(it => it.status === 'INCOMPLETE').length;
  const naCount = items.filter(it => it.status === 'NOT_APPLICABLE').length;
  const totalCount = items.length;

  const isPdf = resolvedType === 'application/pdf' || (!resolvedType && Boolean(activeDoc?.documentName?.toLowerCase().endsWith('.pdf')));
  const isImage = resolvedType.startsWith('image/');

  // Bulk action: Mark submitted as verified (preserves exact logic)
  const handleMarkSubmittedAsVerified = () => {
    setItems(prev => prev.map(it => ({
      ...it,
      status: it.submitted ? 'VERIFIED' : (it.isMandatory ? 'INCOMPLETE' : 'NOT_APPLICABLE'),
    })));
    setCompletenessStatus('COMPLETE');
  };

  // Close inspector panel
  const handleCloseInspector = () => {
    const prevCode = activeDoc?.code;
    setActiveDoc(null);
    if (prevCode && triggerButtonRefs.current[prevCode]) {
      triggerButtonRefs.current[prevCode]?.focus();
    }
  };

  // Download active document (works from the error state too)
  const handleDownload = async () => {
    if (!activeDoc || !activeFileUrl || downloading) return;
    setDownloading(true);
    try {
      await downloadDocument(activeFileUrl, blobUrl, activeDoc.documentName || `annex-c-${activeDoc.code}.pdf`);
    } catch {
      addToast('The document could not be downloaded. Please try again.', 'ERROR');
    } finally {
      setDownloading(false);
    }
  };

  const toggleDescription = (code: string) => {
    setExpandedDescriptions(prev => ({
      ...prev,
      [code]: !prev[code],
    }));
  };

  const toggleAllDescriptions = () => {
    const nextState = !showAllDescriptions;
    setShowAllDescriptions(nextState);
    const updated: Record<string, boolean> = {};
    items.forEach(it => {
      updated[it.code] = nextState;
    });
    setExpandedDescriptions(updated);
  };

  const appCode = applicant.scoreDetailsJson?.applicantNumber
    || applicant.scoreDetailsJson?.annexCChecklist?.applicationCode
    || `APP-${String(applicant.id).padStart(4, '0')}`;

  return (
    <ModalOverlay onDismiss={onClose} className="modal-overlay">
      <div
        className="annex-c-dialog animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="annex-c-title"
      >
        {/* Header */}
        <div className="annex-c-header">
          <div className="annex-c-header-left">
            <div className="annex-c-stage-badge">
              <span>Stage 1 • Administrative Officer II (AO II)</span>
              <span>•</span>
              <span>DepEd Order No. 007, s. 2023</span>
            </div>
            <h2 id="annex-c-title" className="annex-c-title">
              <AppIcon name="checklist" size={20} color="var(--color-primary)" />
              Requirements Completeness Verification (Annex C)
            </h2>
          </div>
          <button
            type="button"
            className="annex-c-close-btn"
            onClick={onClose}
            title="Close verification workspace (Esc)"
            aria-label="Close verification workspace"
          >
            <X size={18} />
          </button>
        </div>

        {/* Applicant Context Banner */}
        <div className="annex-c-applicant-strip">
          <div className="annex-c-applicant-grid">
            <div className="annex-c-applicant-cell">
              <span className="annex-c-cell-label">Applicant</span>
              <span className="annex-c-cell-value">{applicant.name}</span>
              <span className="annex-c-cell-sub">ID: {applicant.employeeId || 'N/A'}</span>
            </div>
            <div className="annex-c-applicant-cell">
              <span className="annex-c-cell-label">Position Applied For</span>
              <span className="annex-c-cell-value">{cycle?.name || applicant.designation || 'Teacher Position'}</span>
              <span className="annex-c-cell-sub">Track: {modalTrack === 'NON_TEACHING' ? 'Non-Teaching' : 'Teaching'}</span>
            </div>
            <div className="annex-c-applicant-cell">
              <span className="annex-c-cell-label">Office / School Unit</span>
              <span className="annex-c-cell-value">{applicant.station || cycle?.rulesConfigurationJson?.officeUnit || 'Division of Koronadal City'}</span>
              <span className="annex-c-cell-sub">Region XII</span>
            </div>
            <div className="annex-c-applicant-cell">
              <span className="annex-c-cell-label">Application Code</span>
              <span className="annex-c-app-code">{appCode}</span>
            </div>
          </div>

          {/* Progress Status Strip */}
          <div className="annex-c-progress-strip">
            <div className="annex-c-progress-pills">
              <span className="annex-c-progress-pill">
                <span className="annex-c-progress-dot verified" />
                <strong>{verifiedCount}</strong> Verified
              </span>
              <span className="annex-c-progress-pill">
                <span className="annex-c-progress-dot deficient" />
                <strong>{deficientCount}</strong> Deficient
              </span>
              <span className="annex-c-progress-pill">
                <span className="annex-c-progress-dot na" />
                <strong>{naCount}</strong> N/A
              </span>
            </div>
            <span style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              {verifiedCount + deficientCount + naCount} of {totalCount} evaluated
            </span>
          </div>
        </div>

        {/* Dual-Pane Workbench Body */}
        <div className="annex-c-body">
          {/* Left Column: Requirements Checklist & Verification Controls */}
          <div className="annex-c-checklist-pane">
            <div className="annex-c-checklist-scroll">
              {/* Checklist Toolbar */}
              <div className="annex-c-toolbar">
                <div className="annex-c-toolbar-heading">
                  <span className="annex-c-toolbar-title">Documentary Requirements Checklist</span>
                  <span className="annex-c-toolbar-sub">
                    {verifiedCount} of {totalCount} verified{deficientCount > 0 ? ` · ${deficientCount} deficient` : ''}
                  </span>
                  <div
                    className="annex-c-toolbar-progress"
                    role="progressbar"
                    aria-label="Requirements verified"
                    aria-valuemin={0}
                    aria-valuemax={totalCount}
                    aria-valuenow={verifiedCount}
                  >
                    <span style={{ width: `${totalCount ? (verifiedCount / totalCount) * 100 : 0}%` }} />
                  </div>
                </div>
                <div className="annex-c-toolbar-actions">
                  <button
                    type="button"
                    onClick={toggleAllDescriptions}
                    className="annex-c-btn-secondary"
                    title={showAllDescriptions ? 'Collapse all descriptions' : 'Expand all descriptions'}
                  >
                    {showAllDescriptions ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    <span>{showAllDescriptions ? 'Compact view' : 'Details'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleMarkSubmittedAsVerified}
                    className="annex-c-btn-secondary"
                    style={{ color: '#059669', borderColor: 'rgba(16, 185, 129, 0.4)' }}
                    title="Mark all items with submitted documents as Verified"
                  >
                    <Check size={13} />
                    <span>Mark Submitted as Verified</span>
                  </button>
                </div>
              </div>

              {/* Requirements grouped by Annex; labels come from the official code. */}
              {groupByAnnex(items).map(group => (
              <section key={group.annex} className="annex-c-group" aria-labelledby={`annex-group-${group.annex}`}>
                <h3 id={`annex-group-${group.annex}`} className="annex-c-group-heading">
                  {group.heading}
                  <span className="annex-c-group-count">{group.entries.length} {group.entries.length === 1 ? 'document' : 'documents'}</span>
                </h3>
              {group.entries.map(({ item, index: idx, label }) => {
                const state = requirementState(item);
                const isVerified = item.status === 'VERIFIED';
                const isIncomplete = item.status === 'INCOMPLETE';
                const isNA = item.status === 'NOT_APPLICABLE';
                const isViewingThis = activeDoc?.code === item.code;
                const isExpanded = expandedDescriptions[item.code] || showAllDescriptions;

                return (
                  <div
                    key={item.code}
                    className={`annex-c-item ${isViewingThis ? 'is-viewing' : ''} ${isVerified ? 'is-verified-state' : isIncomplete ? 'is-deficient-state' : isNA ? 'is-na-state' : ''}`}
                  >
                    <div className="annex-c-item-header">
                      <div className="annex-c-item-title-col">
                        <div className="annex-c-item-heading-row">
                          <span className="annex-c-item-code" aria-hidden="true">{label}</span>
                          <span className="annex-c-item-title">{item.title}</span>
                          {item.isMandatory ? (
                            <span className="annex-c-badge-mandatory">Mandatory</span>
                          ) : (
                            <span className="annex-c-badge-optional">If Applicable</span>
                          )}
                          <span className={`annex-c-state-chip state-${state}`}>
                            {state === 'verified' ? <CheckCircle2 size={14} aria-hidden="true" />
                              : state === 'deficient' ? <X size={14} aria-hidden="true" />
                              : state === 'missing' ? <AlertCircle size={14} aria-hidden="true" />
                              : state === 'pending' ? <Eye size={14} aria-hidden="true" /> : null}
                            {REQUIREMENT_STATE_LABEL[state]}
                          </span>
                          {isViewingThis && (
                            <span className="annex-c-active-indicator">
                              <Eye size={11} /> Viewing in Inspector
                            </span>
                          )}
                        </div>

                        {/* Description (collapsible / readable) */}
                        <p className="annex-c-item-desc">
                          {isExpanded ? (
                            item.description
                          ) : (
                            <>
                              {item.description.length > 80
                                ? `${item.description.substring(0, 80)}…`
                                : item.description}
                              {item.description.length > 80 && (
                                <button
                                  type="button"
                                  className="annex-c-desc-toggle"
                                  onClick={() => toggleDescription(item.code)}
                                >
                                  more
                                </button>
                              )}
                            </>
                          )}
                        </p>
                      </div>

                      {/* Decision Segmented Buttons */}
                      <div
                        className="annex-c-decision-group"
                        role="group"
                        aria-label={`Verification decision for item ${item.code}: ${item.title}`}
                      >
                        <button
                          type="button"
                          className={`annex-c-decision-btn ${isVerified ? 'is-selected verified' : ''}`}
                          onClick={() => {
                            setItems(prev => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], status: 'VERIFIED' };
                              return next;
                            });
                          }}
                          aria-pressed={isVerified}
                          title={`Mark item (${item.code}) as Verified`}
                        >
                          <Check size={12} />
                          <span>Verified</span>
                        </button>

                        <button
                          type="button"
                          className={`annex-c-decision-btn ${isIncomplete ? 'is-selected deficient' : ''}`}
                          onClick={() => {
                            setItems(prev => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], status: 'INCOMPLETE' };
                              return next;
                            });
                            setCompletenessStatus('INCOMPLETE');
                          }}
                          aria-pressed={isIncomplete}
                          title={`Mark item (${item.code}) as Deficient`}
                        >
                          <X size={12} />
                          <span>Deficient</span>
                        </button>

                        <button
                          type="button"
                          className={`annex-c-decision-btn ${isNA ? 'is-selected na' : ''}`}
                          onClick={() => {
                            setItems(prev => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], status: 'NOT_APPLICABLE' };
                              return next;
                            });
                          }}
                          aria-pressed={isNA}
                          title={`Mark item (${item.code}) as Not Applicable`}
                        >
                          <span>N/A</span>
                        </button>
                      </div>
                    </div>

                    {/* Attachment Bar */}
                    <div className="annex-c-attach-bar">
                      {item.submitted || item.documentName ? (
                        <div className="annex-c-doc-chip" title={item.documentName || `${item.title}.pdf`}>
                          <FileText size={13} />
                          <span className="annex-c-doc-chip-name">
                            {item.documentName || `${item.title}.pdf`}
                          </span>
                        </div>
                      ) : (
                        item.isMandatory ? (
                          <span className="annex-c-missing-mandatory">
                            <AlertCircle size={12} /> No document attached by applicant
                          </span>
                        ) : (
                          <span className="annex-c-missing-optional">
                            No document attached
                          </span>
                        )
                      )}

                      {/* Prominent Inspect / View Button */}
                      {item.personnelDocumentId ? (
                        <button
                          ref={el => { triggerButtonRefs.current[item.code] = el; }}
                          type="button"
                          className={`annex-c-inspect-btn ${isViewingThis ? 'active-view' : ''}`}
                          onClick={() => setActiveDoc(item)}
                          title={`Inspect ${item.documentName || item.title} in the side-by-side panel`}
                        >
                          <Eye size={13} />
                          <span>{isViewingThis ? 'Viewing preview' : 'View document'}</span>
                        </button>
                      ) : null}
                    </div>

                    {/* Deficiency Remark Input (Smoothly revealed when Deficient) */}
                    {isIncomplete && (
                      <div className="annex-c-deficiency-box animate-scale-in">
                        <label className="annex-c-deficiency-label" htmlFor={`deficiency-${item.code}`}>
                          <AlertTriangle size={13} />
                          <span>Deficiency Remarks for Item ({item.code})</span>
                        </label>
                        <input
                          id={`deficiency-${item.code}`}
                          aria-label={`Deficiency remark for item ${item.code}`}
                          type="text"
                          className="annex-c-deficiency-input"
                          placeholder={`Specify deficiency or required correction for item (${item.code})...`}
                          value={item.remarks || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItems(prev => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], remarks: val };
                              return next;
                            });
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              </section>
              ))}

              {/* Omnibus Sworn Statement Status */}
              <div className="annex-c-omnibus-card">
                <div className="annex-c-omnibus-left">
                  <ShieldCheck size={18} color="#059669" />
                  <div>
                    <strong style={{ fontSize: '1rem', color: 'var(--color-text-primary)' }}>
                      Omnibus Sworn Statement & Data Privacy Consent
                    </strong>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                      Certified and digitally signed under Republic Act No. 8792 (E-Commerce Act of 2000)
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#059669', background: 'rgba(5, 150, 105, 0.12)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(5, 150, 105, 0.25)' }}>
                  Acknowledged
                </span>
              </div>

              {/* AO II Overall Finding Card */}
              <div className={`annex-c-finding-card ${completenessStatus === 'COMPLETE' ? 'status-complete' : 'status-incomplete'}`}>
                <span className="annex-c-finding-header" style={{ color: completenessStatus === 'COMPLETE' ? '#059669' : '#dc2626' }}>
                  AO II Overall Requirements Verification Finding
                </span>

                <div className="annex-c-radios">
                  <label className="annex-c-radio-label">
                    <input
                      type="radio"
                      name="annexCReqFinding"
                      value="COMPLETE"
                      checked={completenessStatus === 'COMPLETE'}
                      onChange={() => setCompletenessStatus('COMPLETE')}
                    />
                    <span style={{ color: '#059669' }}>Complete & Verified</span>
                    <span style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                      (Endorsed for HRMPSB Deliberation)
                    </span>
                  </label>

                  <label className="annex-c-radio-label">
                    <input
                      type="radio"
                      name="annexCReqFinding"
                      value="INCOMPLETE"
                      checked={completenessStatus === 'INCOMPLETE'}
                      onChange={() => setCompletenessStatus('INCOMPLETE')}
                    />
                    <span style={{ color: '#dc2626' }}>Incomplete / Deficient</span>
                    <span style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                      (Flagged for Deficiency)
                    </span>
                  </label>
                </div>

                <div>
                  <label
                    className="annex-c-cell-label"
                    style={{ marginBottom: '4px' }}
                    htmlFor="ao-verification-remarks"
                  >
                    AO II Verification Remarks / Notes for HRMPSB
                  </label>
                  <textarea
                    id="ao-verification-remarks"
                    aria-label="AO II Verification Remarks / Notes for HRMPSB"
                    className="annex-c-remarks-textarea"
                    rows={2}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder={completenessStatus === 'COMPLETE'
                      ? 'All documentary requirements verified complete and authentic...'
                      : 'Specify missing or deficient requirements...'}
                  />
                </div>
              </div>
            </div>

            {/* Bottom Form Actions */}
            <div className="annex-c-footer">
              <button
                type="button"
                className="annex-c-btn-secondary"
                onClick={onClose}
                style={{ padding: '8px 16px', fontSize: '1rem' }}
              >
                Cancel
              </button>

              <div className="annex-c-footer-actions">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={onSubmit}
                  className={`annex-c-submit-btn ${completenessStatus === 'COMPLETE' ? 'complete' : 'incomplete'}`}
                >
                  {isPending ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  <span>
                    {completenessStatus === 'COMPLETE'
                      ? 'Confirm Requirements Complete'
                      : 'Record Deficiencies'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: In-Window Document Inspector */}
          <div className={`annex-c-preview-pane ${!activeDoc ? 'no-active-doc' : ''}`}>
            {activeDoc ? (
              <>
                {/* Inspector Header & Toolbar */}
                <div className="annex-c-preview-header">
                  <div className="annex-c-preview-meta">
                    {/* Back to Checklist button on Mobile */}
                    <button
                      type="button"
                      className="annex-c-back-btn-mobile sm:hidden"
                      onClick={handleCloseInspector}
                      title="Return to checklist"
                    >
                      <ArrowLeft size={14} /> Back to Checklist
                    </button>

                    <div className="annex-c-preview-icon" aria-hidden="true">
                      <FileText size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h3 className="annex-c-preview-title" title={activeDoc.documentName || activeDoc.title}>
                        {activeDoc.documentName || `${activeDoc.title}.pdf`}
                      </h3>
                      <p className="annex-c-preview-sub">
                        Requirement ({activeDoc.code}): {activeDoc.title}
                      </p>
                    </div>
                  </div>

                  {/* Toolbar */}
                  <div className="annex-c-preview-toolbar">
                    <PreviewZoomControls
                      zoom={zoom}
                      onZoomChange={setZoom}
                      disabled={!blobUrl || docLoading || !(isPdf || isImage)}
                      buttonClassName="annex-c-tool-btn"
                    />

                    {isImage && (
                      <button
                        type="button"
                        className="annex-c-tool-btn"
                        onClick={() => setRotation(prev => (prev + 90) % 360)}
                        title="Rotate 90 degrees"
                        aria-label="Rotate clockwise"
                        disabled={docLoading || !blobUrl}
                      >
                        <RotateCw size={14} />
                      </button>
                    )}

                    {blobUrl && (
                      <button
                        type="button"
                        className="annex-c-tool-btn"
                        onClick={() => void handleDownload()}
                        disabled={docLoading || downloading}
                        title="Download file"
                      >
                        <Download size={14} />
                        <span className="hidden sm:inline">Download</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="annex-c-preview-close-btn"
                      onClick={handleCloseInspector}
                      title="Close preview"
                      aria-label="Close document inspector"
                    >
                      <X size={15} />
                      <span className="hidden sm:inline">Close</span>
                    </button>
                  </div>
                </div>

                {/* Preview Specimen Body */}
                <div className="annex-c-preview-viewport" aria-busy={docLoading}>
                  {docLoading && blobUrl && (
                    <div className="annex-c-preview-refreshing" role="status">
                      <Loader2 size={16} className="spin" color="#2f7d52" /> Loading document preview…
                    </div>
                  )}
                  {docLoading && !blobUrl ? (
                    <div className="annex-c-preview-status">
                      <Loader2 size={32} className="spin" color="#2f7d52" />
                      <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text-secondary)', fontSize: '1rem' }}>
                        Loading document preview…
                      </p>
                    </div>
                  ) : docError ? (
                    <div className="annex-c-preview-status">
                      <AlertTriangle size={36} color="#dc2626" />
                      <p style={{ margin: 0, fontWeight: 700, color: '#dc2626', fontSize: '1rem' }}>
                        Unable to view document
                      </p>
                      <p style={{ margin: 0, fontSize: '1rem', color: 'var(--color-text-muted)' }}>
                        {docError}
                      </p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button type="button" className="annex-c-btn-secondary" onClick={retry}>
                          <RefreshCw size={13} /> Retry
                        </button>
                        <button type="button" className="annex-c-btn-secondary" onClick={() => void handleDownload()} disabled={downloading}>
                          <Download size={13} /> Download
                        </button>
                      </div>
                    </div>
                  ) : isPdf && blobUrl ? (
                    // Zoom resizes the frame inside a scroll area; the src
                    // never changes, so zooming cannot reload the document.
                    <PdfPages url={blobUrl} zoom={zoom} title={activeDoc.documentName || activeDoc.title} />
                  ) : isImage && blobUrl ? (
                    <div className="annex-c-image-canvas">
                      <img
                        src={blobUrl}
                        alt={activeDoc.title}
                        className="annex-c-preview-img"
                        style={{
                          transform: `scale(${zoom}) rotate(${rotation}deg)`,
                        }}
                      />
                    </div>
                  ) : (
                    <div className="annex-c-preview-status">
                      <FileText size={36} color="var(--color-text-muted)" />
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem' }}>
                        Preview unavailable for this format
                      </p>
                      <p style={{ margin: 0, fontSize: '1rem', color: 'var(--color-text-muted)' }}>
                        Only PDF, PNG and JPEG files can be shown here. You can download the file to inspect it.
                      </p>
                      <button
                        type="button"
                        className="annex-c-btn-secondary"
                        onClick={() => void handleDownload()}
                        disabled={downloading}
                        style={{ marginTop: 8 }}
                      >
                        <Download size={13} /> Download file
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Empty State when no document is active */
              <div className="annex-c-placeholder-pane">
                <div className="annex-c-placeholder-icon" aria-hidden="true">
                  <FileText size={28} />
                </div>
                <h3 className="annex-c-placeholder-title">Document Inspection Workspace</h3>
                <p className="annex-c-placeholder-desc">
                  Select <strong>View document</strong> on any requirement in the checklist to review its attached PDF or image side-by-side with your evaluation.
                </p>
                {items.some(it => it.personnelDocumentId) && (
                  <button
                    type="button"
                    className="annex-c-btn-secondary"
                    onClick={() => {
                      const firstWithDoc = items.find(it => it.personnelDocumentId);
                      if (firstWithDoc) setActiveDoc(firstWithDoc);
                    }}
                    style={{ marginTop: 6 }}
                  >
                    <Eye size={13} />
                    <span>Inspect First Attachment</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
};

export default AnnexCVerificationModal;
