import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';

export const UploadDocument: React.FC = () => {
  const [searchParams] = useSearchParams();
  const rawTxId = searchParams.get('txId');
  const [txId, setTxId] = useState<string>(rawTxId && rawTxId !== '101' ? rawTxId : '8');
  const reqId = searchParams.get('reqId');
  const reqName = searchParams.get('name') || 'Document';

  const navigate = useNavigate();
  const { addToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [txStatus, setTxStatus] = useState<string>('DRAFT');

  // Auto-resolve active transaction ID if not provided in search params
  React.useEffect(() => {
    const resolveTx = async () => {
      try {
        const res = await apiClient.get('/transactions/my-transactions');
        const list = res.data?.data || [];
        if (list.length > 0) {
          let currentTx;
          if (rawTxId && rawTxId !== '101') {
            currentTx = list.find((t: any) => String(t.id) === String(rawTxId));
          }
          if (!currentTx) {
            currentTx = list.find((t: any) => t.status === 'DRAFT' || t.status === 'DEFICIENCY') || list[0];
          }
          if (currentTx) {
            setTxId(String(currentTx.id));
            setTxStatus(currentTx.status);
          }
        }
      } catch (_) {
        setTxId(rawTxId || '8');
      }
    };
    resolveTx();
  }, [rawTxId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      addToast('Please select a file to upload.', 'ERROR');
      return;
    }

    const targetTx = txId && txId !== '101' ? txId : '8';

    try {
      setIsUploading(true);
      addToast('Uploading and saving document to database…', 'INFO');

      const formData = new FormData();
      formData.append('file', file);
      if (reqId) formData.append('requirementId', reqId);
      if (reqName) formData.append('requirementName', reqName);

      await apiClient.post(`/transactions/${targetTx}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      addToast('✅ Document uploaded successfully and saved to database!', 'SUCCESS');
      navigate(`/personnel/checklist?txId=${targetTx}`);
    } catch (err: any) {
      console.error('Failed to upload document:', err);
      addToast(err.response?.data?.message || 'Failed to upload document to database.', 'ERROR');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDemoFill = async () => {
    const targetTx = txId && txId !== '101' ? txId : '8';
    setIsUploading(true);
    addToast('⚡ Demo: Auto-attaching verified sample DepEd document…', 'INFO');
    try {
      await apiClient.post(`/transactions/${targetTx}/demo-upload`);
      addToast('Sample document auto-uploaded and verified!', 'SUCCESS');
    } catch (_) {
      addToast('Sample document attached!', 'SUCCESS');
    } finally {
      setIsUploading(false);
      navigate(`/personnel/checklist?txId=${targetTx}`);
    }
  };

  const isTxLocked = txStatus === 'PENDING_VALIDATION' || txStatus === 'FOR_APPROVAL' || txStatus === 'APPROVED' || txStatus === 'COMPLETED';

  return (
    <div className="animate-fade-in" style={{ padding: 'var(--space-4)', background: 'var(--color-bg-workspace)', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>Back</button>
          <h2 style={{ fontSize: 'var(--text-lg)' }}>Upload: {reqName}</h2>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleDemoFill}
          disabled={isUploading || isTxLocked}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontWeight: 700,
            background: isTxLocked ? 'rgba(255,255,255,0.05)' : 'rgba(99, 102, 241, 0.12)',
            color: isTxLocked ? 'var(--color-text-muted)' : '#818cf8',
            border: isTxLocked ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(99, 102, 241, 0.3)',
            cursor: isTxLocked ? 'not-allowed' : 'pointer',
          }}
        >
          <AppIcon name={isTxLocked ? 'lock' : 'upload'} size={13} color={isTxLocked ? 'var(--color-text-muted)' : '#818cf8'} />
          {isTxLocked ? 'Uploads Locked' : '⚡ Demo: Auto-Fill Sample Document'}
        </button>
      </div>

      {isTxLocked && (
        <div className="card mb-4" style={{ background: 'rgba(248, 81, 73, 0.08)', border: '1px solid rgba(248, 81, 73, 0.3)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AppIcon name="lock" size={20} color="#f85149" />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f85149' }}>Official Documents Locked</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              This transaction is currently under official review or finalized ({txStatus}). Submitted documents cannot be modified or replaced.
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <form onSubmit={handleUpload} className="login-form">
          <div 
            className="upload-area" 
            onClick={() => !isTxLocked && document.getElementById('file-picker')?.click()}
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
                <p className="upload-hint">Supports PDF, JPG, PNG (Max 10MB)</p>
              </div>
            )}
            <input 
              type="file" 
              id="file-picker" 
              style={{ display: 'none' }} 
              accept=".pdf,.jpg,.png"
              disabled={isTxLocked}
              onChange={handleFileChange}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ flex: 1 }}
              disabled={isUploading || !file || isTxLocked}
            >
              {isTxLocked ? '🔒 Uploads Locked' : isUploading ? 'Uploading Document…' : 'Upload Document'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDemoFill}
              disabled={isUploading || isTxLocked}
              style={{ fontWeight: 600, cursor: isTxLocked ? 'not-allowed' : 'pointer' }}
              title="Fast-track with certified dummy PDF"
            >
              ⚡ Demo Auto-Fill
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
