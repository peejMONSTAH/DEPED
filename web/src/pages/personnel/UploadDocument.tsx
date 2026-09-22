import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';
import { templateForRequirement } from '../../components/forms/templateMatch';
import { extractStructuredDataFromPdf } from '../../components/forms/formDataExtraction';
import { fieldsForTemplate } from '../../components/forms/formFields';
import { clickable } from '../../a11y/clickable';

export const UploadDocument: React.FC = () => {
  const [searchParams] = useSearchParams();
  const rawTxId = searchParams.get('txId');
  const [txId, setTxId] = useState<string>(rawTxId || '');
  const reqId = searchParams.get('reqId');
  const rawReqName = searchParams.get('name');
  const reqName = rawReqName && rawReqName !== 'undefined' && rawReqName !== 'null' ? rawReqName.trim() : '';

  const navigate = useNavigate();
  const { addToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [txStatus, setTxStatus] = useState<string>('UNKNOWN');
  const [structuredData, setStructuredData] = useState<{ templateId: string; fields: Record<string, string> } | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Never substitute another transaction or a demo ID when a link is missing or invalid.
  React.useEffect(() => {
    let disposed = false;
    setTxStatus('UNKNOWN');
    if (!rawTxId || !Number.isSafeInteger(Number(rawTxId)) || Number(rawTxId) <= 0) {
      setTxId('');
      return;
    }
    apiClient.get(`/transactions/${rawTxId}`).then(response => {
      if (!disposed) {
        setTxId(String(response.data.data.id));
        setTxStatus(response.data.data.status);
      }
    }).catch(() => { if (!disposed) setTxStatus('UNKNOWN'); });
    return () => { disposed = true; };
  }, [rawTxId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
      const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg'];
      const ext = selected.name.substring(selected.name.lastIndexOf('.')).toLowerCase();

      if (!allowedMimes.includes(selected.type) && !allowedExts.includes(ext)) {
        addToast('Invalid file format. Strict upload policy: Only PDF, PNG, and JPEG files (.pdf, .png, .jpg, .jpeg) are allowed for transaction document uploads.', 'ERROR');
        e.target.value = '';
        setFile(null);
        return;
      }

      if (selected.size > 10 * 1024 * 1024) {
        addToast('File exceeds maximum size limit of 10 MB.', 'ERROR');
        e.target.value = '';
        setFile(null);
        return;
      }

      setFile(selected);
      setStructuredData(null);
      setConfirmed(false);
      const templateId = templateForRequirement(reqName);
      if (templateId && (selected.type === 'application/pdf' || selected.name.toLowerCase().endsWith('.pdf'))) {
        setIsExtracting(true);
        try {
          const blank = await apiClient.get(`/forms/templates/${templateId}/file`, { responseType: 'arraybuffer' });
          const extracted = await extractStructuredDataFromPdf(selected, templateId, blank.data as ArrayBuffer);
          if (extracted && Object.values(extracted.fields).some(value => value.trim())) setStructuredData(extracted);
          else addToast('No fillable text was detected. The AO can still inspect the uploaded scan manually.', 'INFO');
        } catch {
          addToast('Automatic field detection was unavailable. The document can still be uploaded for manual review.', 'INFO');
        } finally {
          setIsExtracting(false);
        }
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      addToast('Please select a file to upload.', 'ERROR');
      return;
    }

    if (!txId || !['DRAFT', 'DEFICIENCY'].includes(txStatus)) { addToast('Open an editable assigned transaction before uploading.', 'ERROR'); return; }
    if (structuredData?.templateId === 'pds-2025' && !confirmed) { addToast('Confirm the detected fields before uploading.', 'ERROR'); return; }
    const targetTx = txId;

    try {
      setIsUploading(true);
      addToast('Uploading and saving document to database…', 'INFO');

      const formData = new FormData();
      formData.append('file', file);
      if (reqId) formData.append('requirementId', reqId);
      if (reqName) formData.append('requirementName', reqName);
      if (structuredData) formData.append('structuredDataJson', JSON.stringify(structuredData));

      const uploadResponse = await apiClient.post(`/transactions/${targetTx}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const documentId = uploadResponse.data?.data?.id;
      if (structuredData?.templateId === 'pds-2025' && documentId) {
        if (!confirmed) throw new Error('Please confirm the detected PDS fields before continuing.');
        await apiClient.put(`/documents/${documentId}/extraction-review`, { fields: structuredData.fields, version: uploadResponse.data.data.updatedAt });
      }

      addToast('✅ Document uploaded successfully and saved to database!', 'SUCCESS');
      navigate(`/personnel/checklist?txId=${targetTx}`);
    } catch (err: any) {
      console.error('Failed to upload document:', err);
      addToast(err.response?.data?.message || 'Failed to upload document to database.', 'ERROR');
    } finally {
      setIsUploading(false);
    }
  };

  // Mirror the server rule (documents.controller.ts: DRAFT and DEFICIENCY only)
  // as an allow-list. The previous deny-list omitted REJECTED, RETURNED and
  // CANCELLED, so those let the user pick a file and submit only to get a 400.
  const UPLOADABLE_STATUSES = ['DRAFT', 'DEFICIENCY'];
  const isTxLocked = !UPLOADABLE_STATUSES.includes(txStatus || '');

  // The lock now covers terminal states too, so 'under review' is not always true.
  const lockReason =
    txStatus === 'REJECTED'
      ? 'This transaction was rejected, so its documents are final. Start a new transaction if you need to submit again.'
      : txStatus === 'CANCELLED'
        ? 'This transaction was cancelled, so no further documents can be attached.'
        : txStatus === 'APPROVED' || txStatus === 'COMPLETED'
          ? 'This transaction is complete. Its documents form part of your official 201 record and can no longer be changed.'
          : `This transaction is under official review (${txStatus}). Documents cannot be modified until a reviewer returns it to you.`;

  return (
    <div className="animate-fade-in" style={{ padding: 'var(--space-4)', background: 'var(--color-bg-workspace)', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>Back</button>
          <h2 style={{ fontSize: 'var(--text-lg)' }}>{reqName ? `Upload: ${reqName}` : 'Upload document'}</h2>
        </div>
      </div>

      {isTxLocked && (
        <div className="card mb-4" style={{ background: 'rgba(248, 81, 73, 0.08)', border: '1px solid rgba(248, 81, 73, 0.3)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AppIcon name="lock" size={20} color="#f85149" />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f85149' }}>Uploads are closed</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {lockReason}
            </div>
          </div>
        </div>
      )}

      {templateForRequirement(reqName) && <section className="card" style={{ marginBottom: 20 }}>
        <h3>Prefer to fill out a template?</h3>
        <p style={{ margin: '10px 0', lineHeight: 1.6 }}>Enter information on the official form, save a draft to your account, and generate a PDF. Required signatures and AO/HRMO validation still apply.</p>
        <button type="button" className="btn btn-primary" disabled={!rawTxId} onClick={() => navigate(`/personnel/fill-document?txId=${txId}&reqId=${reqId || ''}&name=${encodeURIComponent(reqName)}`)}>{isTxLocked ? 'View online form' : 'Fill online'}</button>
      </section>}
      <div className="card">
        <form onSubmit={handleUpload} className="login-form">
          <div 
            className="upload-area"
            {...(isTxLocked ? {} : clickable<HTMLDivElement>(() => document.getElementById('file-picker')?.click(), 'Choose a file to upload'))}
            style={isTxLocked ? { cursor: 'not-allowed', opacity: 0.6 } : {}}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <AppIcon name={isTxLocked ? 'lock' : 'upload'} size={36} color={isTxLocked ? 'var(--color-text-muted)' : 'var(--color-primary-light)'} />
            </div>
            {isTxLocked ? (
              <div>
                <p className="upload-text" style={{ color: 'var(--color-text-muted)' }}>Document uploads are disabled for this transaction</p>
                <p className="upload-hint">Record is official and locked against alterations</p>
              </div>
            ) : file ? (
              <div>
                <p className="upload-text" style={{ fontWeight: 600, color: 'var(--color-primary-light)' }}>
                  {file.name}
                </p>
                <p className="upload-hint">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>
            ) : (
              <div>
                <p className="upload-text">Drag & Drop file or click to browse</p>
                <p className="upload-hint">Strictly accepts PDF, PNG, JPEG (.pdf, .png, .jpg, .jpeg — Max 10MB)</p>
              </div>
            )}
            <input 
              type="file" 
              id="file-picker" 
              style={{ display: 'none' }} 
              accept=".pdf,application/pdf,.png,image/png,.jpg,.jpeg,image/jpeg"
              disabled={isTxLocked}
              onChange={handleFileChange}
            />
          </div>

          {isExtracting && <div className="card" style={{ marginTop: 16, padding: 16 }}>Detecting fields from the uploaded form…</div>}
          {structuredData && (
            <section className="card" style={{ marginTop: 16, padding: 18, border: '1px solid var(--color-border)' }}>
              <h3 style={{ marginBottom: 6 }}>Review detected fields</h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                Correct any inaccurate value below. These values are only a draft and will not update your official 201 record until AO validation and HRMO approval.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
                {fieldsForTemplate(structuredData.templateId).filter(field => structuredData.fields[field.key]?.trim()).map(field => (
                  <label key={field.key} style={{ display: 'grid', gap: 5, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                    {field.label}
                    <input
                      className="form-input"
                      value={structuredData.fields[field.key] || ''}
                      onChange={event => setStructuredData(current => current ? { ...current, fields: { ...current.fields, [field.key]: event.target.value } } : current)}
                    />
                  </label>
                ))}
              </div>
              {structuredData.templateId === 'pds-2025' && (
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, lineHeight: 1.45 }}>
                  <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} style={{ marginTop: 3 }} />
                  <span>I reviewed these detected PDS values and confirm that they are accurate. I understand they remain subject to AO and HRMO validation.</span>
                </label>
              )}
            </section>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ flex: 1 }}
              disabled={isUploading || isExtracting || !file || isTxLocked || (structuredData?.templateId === 'pds-2025' && !confirmed)}
            >
              {isTxLocked ? '🔒 Uploads Locked' : isUploading ? 'Uploading Document…' : 'Upload Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
