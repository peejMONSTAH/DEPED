import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppIcon } from '../../../components/common/AppIcon';
import { ModalPortal } from '../../../components/common/ModalPortal';
import { ModalOverlay } from '../../../components/common/ModalOverlay';
import { PromotionCycleItem } from './CareerOpportunities';
import { My201DocumentPicker } from './My201DocumentPicker';
import { PersonnelDocumentRecord } from '../../../models/documentStatus';
import { useToast } from '../../../contexts/ToastContext';
import apiClient from '../../../api/client';
import { normaliseAnnexCItem } from '../checklistData';
import { ANNEX_C_FALLBACK, loadAnnexCRequirements } from '../../../promotions/annexCRequirements';

export interface ChecklistFormItem {
  code: string;
  title: string;
  description: string;
  isMandatory: boolean;
  suggestedDocumentTypeIds?: string[];
  submitted: boolean;
  documentName?: string;
  documentType?: string;
  personnelDocumentId?: number;
  uploadedFileUrl?: string;
  fileSize?: number;
  remarks?: string;
  file?: File;
}

interface ApplicationChecklistProps {
  cycle: PromotionCycleItem | null;
  user: any;
  personnel: any;
  user201Documents: PersonnelDocumentRecord[];
  onClose: () => void;
  onApplicationSubmitted: () => void;
  onOpenScanner?: (itemCode: string) => void;
  onPreviewDocument?: (url: string, name: string) => void;
}

export const ApplicationChecklist: React.FC<ApplicationChecklistProps> = ({
  cycle,
  user,
  personnel,
  user201Documents,
  onClose,
  onApplicationSubmitted,
  onOpenScanner,
  onPreviewDocument,
}) => {
  const { addToast } = useToast();
  const [checklistItems, setChecklistItems] = useState<ChecklistFormItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const checklistApplicationCode = cycle?.myApplication?.applicantNumber || '';

  // Applicant metadata form
  const [applicantName, setApplicantName] = useState('');
  const [office, setOffice] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [region, setRegion] = useState('Region XII');
  const [ethnicity, setEthnicity] = useState('');
  const [isPwd, setIsPwd] = useState(false);
  const [isSoloParent, setIsSoloParent] = useState(false);

  // Sub-modal for 201 picker
  const [pickingCode, setPickingCode] = useState<string | null>(null);

  // File input ref for direct uploads
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingItemCode, setUploadingItemCode] = useState<string | null>(null);

  // Initialize checklist items and profile
  useEffect(() => {
    if (!cycle) return;

    const firstName = personnel?.firstName || user?.firstName || '';
    const lastName = personnel?.lastName || user?.lastName || '';
    setApplicantName(`${firstName} ${lastName}`.trim());
    setOffice(personnel?.school || personnel?.station || user?.school || 'Division Office');
    setContactNo(personnel?.phoneNumber || user?.contactNumber || '');

    // Check if user already submitted an application
    const myApp = cycle.myApplication;
    const existingChecklist = myApp?.annexCChecklist;

    // Load templates
    void (async () => {
      setLoading(true);
      try {
        const templates = await loadAnnexCRequirements(apiClient);
        const baseItems: ChecklistFormItem[] = templates.map(t => {
          const code = t.code.toLowerCase();
          const savedItem = existingChecklist?.items?.find((it: any) => it.code?.toLowerCase() === code);

          if (savedItem) {
            return {
              ...t,
              submitted: Boolean(savedItem.submitted || savedItem.uploadedFileUrl || savedItem.personnelDocumentId),
              documentName: savedItem.documentName,
              documentType: savedItem.documentType,
              personnelDocumentId: savedItem.personnelDocumentId,
              uploadedFileUrl: savedItem.uploadedFileUrl,
              fileSize: savedItem.fileSize,
              remarks: savedItem.remarks,
            };
          }

          return {
            ...t,
            submitted: false,
          };
        });

        setChecklistItems(baseItems);
      } catch {
        setChecklistItems(
          ANNEX_C_FALLBACK.map(it => ({
            ...it,
            submitted: false,
          }))
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [cycle, personnel, user]);

  if (!cycle) return null;

  const isReadOnly = Boolean(cycle.hasApplied && cycle.myApplication?.status && cycle.myApplication.status !== 'DRAFT');

  // Handle attaching from 201 picker
  const handleSelect201Document = (doc: PersonnelDocumentRecord) => {
    if (!pickingCode) return;
    setChecklistItems(prev =>
      prev.map(item => {
        if (item.code.toLowerCase() === pickingCode.toLowerCase()) {
          return {
            ...item,
            submitted: true,
            personnelDocumentId: doc.id,
            documentName: doc.documentTypeName || doc.originalFileName || '201 Record',
            documentType: doc.documentTypeId,
            uploadedFileUrl: doc.fileUrl || `/personnel/documents/${doc.id}/file`,
            fileSize: doc.fileSize || undefined,
          };
        }
        return item;
      })
    );
    setPickingCode(null);
    addToast(`Attached "${doc.documentTypeName}" to Item ${pickingCode.toUpperCase()}.`, 'SUCCESS');
  };

  // Handle direct file upload from computer
  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingItemCode) return;

    if (file.size > 10 * 1024 * 1024) {
      addToast('File exceeds 10 MB limit.', 'ERROR');
      return;
    }

    setChecklistItems(prev =>
      prev.map(item => {
        if (item.code.toLowerCase() === uploadingItemCode.toLowerCase()) {
          return {
            ...item,
            submitted: true,
            file,
            documentName: file.name,
            fileSize: file.size,
          };
        }
        return item;
      })
    );

    addToast(`Selected file "${file.name}" for Item ${uploadingItemCode.toUpperCase()}.`, 'SUCCESS');
    setUploadingItemCode(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle removing attachment
  const handleRemoveAttachment = (code: string) => {
    setChecklistItems(prev =>
      prev.map(item => {
        if (item.code.toLowerCase() === code.toLowerCase()) {
          return {
            ...item,
            submitted: false,
            file: undefined,
            personnelDocumentId: undefined,
            uploadedFileUrl: undefined,
            documentName: undefined,
            fileSize: undefined,
          };
        }
        return item;
      })
    );
  };

  // Validation
  const mandatoryItems = checklistItems.filter(i => i.isMandatory);
  const submittedMandatory = mandatoryItems.filter(i => i.submitted);
  const canSubmit = submittedMandatory.length === mandatoryItems.length && !isReadOnly;

  // Submit application
  const handleSubmitApplication = async () => {
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    try {
      const payload = {
        applicantDetails: {
          name: applicantName,
          office,
          contactNo,
          region,
          ethnicity,
          isPwd,
          isSoloParent,
        },
        items: checklistItems.map(item => ({
          code: item.code,
          title: item.title,
          isMandatory: item.isMandatory,
          submitted: item.submitted,
          documentName: item.documentName,
          documentType: item.documentType,
          personnelDocumentId: item.personnelDocumentId,
          uploadedFileUrl: item.uploadedFileUrl,
          fileSize: item.fileSize,
          remarks: item.remarks,
        })),
      };

      await apiClient.post(`/promotions/cycles/${cycle.id}/apply`, payload);
      addToast('Promotion application & Annex C checklist submitted successfully!', 'SUCCESS');
      onApplicationSubmitted();
      onClose();
    } catch (err: any) {
      console.error('Failed to submit application:', err);
      addToast(
        err?.response?.data?.message || 'Failed to submit application. Please ensure all required items are attached.',
        'ERROR'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const targetReq = pickingCode ? checklistItems.find(it => it.code.toLowerCase() === pickingCode.toLowerCase()) : null;

  return (
    <>
      <ModalPortal>
        <ModalOverlay onDismiss={onClose}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checklist-modal-title"
            style={{
              width: '100%',
              maxWidth: 900,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-bg-card)',
              borderRadius: 16,
              border: '1px solid var(--color-border)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 16,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span
                    style={{
                      fontSize: '0.6875rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: isReadOnly ? 'rgba(16, 185, 129, 0.15)' : 'rgba(2, 132, 199, 0.15)',
                      color: isReadOnly ? '#059669' : 'var(--color-primary)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {isReadOnly ? 'Submitted (Read-Only)' : 'Annex C Application'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    DepEd Order No. 007, s. 2023
                  </span>
                </div>

                <h3 id="checklist-modal-title" style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                  Checklist of Requirements and Omnibus Sworn Statement
                </h3>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  Vacancy: <strong>{cycle.targetPosition || cycle.name}</strong> · {cycle.type}
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 6,
                  color: 'var(--color-text-muted)',
                  fontSize: 18,
                }}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Applicant Info Section */}
              <div style={{ background: 'var(--color-bg-secondary)', borderRadius: 12, padding: 16, border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  1. Basic Applicant Information
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                      Applicant Name
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={applicantName}
                      disabled={isReadOnly}
                      onChange={e => setApplicantName(e.target.value)}
                      style={{ fontSize: '0.8125rem', padding: '6px 10px', width: '100%', borderRadius: 6 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                      Application Code
                    </label>
                    <input
                      aria-label="Application Code"
                      type="text"
                      className="form-control"
                      readOnly
                      value={checklistApplicationCode || 'Assigned when you submit'}
                      style={{ fontSize: '0.8125rem', padding: '6px 10px', width: '100%', borderRadius: 6, fontWeight: 700 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                      Office / School Assignment
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={office}
                      disabled={isReadOnly}
                      onChange={e => setOffice(e.target.value)}
                      style={{ fontSize: '0.8125rem', padding: '6px 10px', width: '100%', borderRadius: 6 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                      Contact Number
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={contactNo}
                      disabled={isReadOnly}
                      onChange={e => setContactNo(e.target.value)}
                      style={{ fontSize: '0.8125rem', padding: '6px 10px', width: '100%', borderRadius: 6 }}
                    />
                  </div>
                </div>
              </div>

              {/* Requirements Checklist Section */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      2. Documentary Requirements Checklist (Annex C Items a – k)
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      All items marked <strong>Required</strong> must be substantiated with valid attachments.
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 9999,
                      background: submittedMandatory.length === mandatoryItems.length ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.1)',
                      color: submittedMandatory.length === mandatoryItems.length ? '#059669' : '#dc2626',
                    }}
                  >
                    {submittedMandatory.length} of {mandatoryItems.length} Required Attached
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {checklistItems.map(item => (
                    <div
                      key={item.code}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 12,
                        background: item.submitted ? 'rgba(16, 185, 129, 0.04)' : 'var(--color-bg-secondary)',
                        border: item.submitted ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--color-border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: '1 1 300px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              background: item.submitted ? '#10b981' : 'var(--color-border)',
                              color: '#fff',
                              fontSize: '0.6875rem',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {item.submitted ? '✓' : item.code.toUpperCase()}
                          </span>

                          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                            {item.title}
                          </span>

                          <span
                            style={{
                              fontSize: '0.6875rem',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: item.isMandatory ? 'rgba(239, 68, 68, 0.1)' : 'var(--color-bg-secondary)',
                              color: item.isMandatory ? '#dc2626' : 'var(--color-text-muted)',
                            }}
                          >
                            {item.isMandatory ? 'Required' : 'If applicable'}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginLeft: 30 }}>
                          {item.description}
                        </div>

                        {/* Attached file row */}
                        {item.submitted && (
                          <div
                            style={{
                              marginLeft: 30,
                              marginTop: 8,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '4px 10px',
                              borderRadius: 6,
                              background: 'rgba(16, 185, 129, 0.12)',
                              fontSize: '0.75rem',
                              color: '#059669',
                              fontWeight: 600,
                            }}
                          >
                            <AppIcon name="document" size={12} color="#059669" />
                            <span>Attached: <strong>{item.documentName || 'Document file'}</strong></span>
                            {onPreviewDocument && item.uploadedFileUrl && (
                              <button
                                type="button"
                                onClick={() => onPreviewDocument(item.uploadedFileUrl!, item.documentName || item.title)}
                                style={{ background: 'none', border: 'none', color: '#059669', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                              >
                                View
                              </button>
                            )}
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() => handleRemoveAttachment(item.code)}
                                style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '0 4px', fontWeight: 800 }}
                                title="Remove attachment"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      {!isReadOnly && (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setPickingCode(item.code)}
                            style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 8px' }}
                          >
                            Attach from 201
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setUploadingItemCode(item.code);
                              fileInputRef.current?.click();
                            }}
                            style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 8px' }}
                          >
                            Upload File
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--color-border)',
                background: 'var(--color-bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                {canSubmit
                  ? 'All mandatory requirements are satisfied. Ready to endorse to AO II.'
                  : `Please attach all ${mandatoryItems.length} mandatory documents before submitting.`}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                  Close
                </button>

                {!isReadOnly && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!canSubmit || submitting}
                    onClick={handleSubmitApplication}
                    style={{ fontWeight: 700 }}
                  >
                    {submitting ? 'Submitting Application...' : 'Submit Application to AO II'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </ModalOverlay>
      </ModalPortal>

      {/* Hidden file input for direct computer uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        style={{ display: 'none' }}
        onChange={handleFilePicked}
      />

      {/* Sub-modal: 201 File Picker */}
      {pickingCode && (
        <My201DocumentPicker
          pickingCode={pickingCode}
          targetTitle={targetReq?.title}
          suggestedTypes={targetReq?.suggestedDocumentTypeIds}
          documents={user201Documents}
          onSelect={handleSelect201Document}
          onClose={() => setPickingCode(null)}
        />
      )}
    </>
  );
};
