import React, { useEffect, useState } from 'react';
import {
  X,
  RotateCw,
  Download,
  AlertTriangle,
  Loader2,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { ModalPortal } from './ModalPortal';
import { ModalOverlay } from './ModalOverlay';
import { useToast } from '../../contexts/ToastContext';
import { useDocumentPreview, downloadDocument } from './useDocumentPreview';
import { PdfPages } from './PdfPages';
import { PreviewZoomControls } from './PreviewZoomControls';
import './document-viewer-modal.css';

export interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  /** Authenticated endpoint for the file bytes, e.g. `/personnel/documents/${id}/file` */
  fileUrl: string;
  /** Download file name */
  downloadFileName?: string;
}

const formatSize = (bytes?: number): string => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  isOpen,
  onClose,
  title,
  fileName,
  fileSize,
  mimeType,
  fileUrl,
  downloadFileName,
}) => {
  const { addToast } = useToast();
  const { preview, retry } = useDocumentPreview(isOpen && fileUrl ? fileUrl : null, mimeType);
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [downloading, setDownloading] = useState(false);

  // A new document always opens unzoomed.
  useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [fileUrl, isOpen]);

  if (!isOpen) return null;

  const loading = preview.status === 'loading' || preview.status === 'idle';
  const error = preview.error;
  const blobUrl = preview.url;
  const resolvedType = preview.type;
  const isPdf = resolvedType === 'application/pdf' || (!resolvedType && Boolean(fileName?.toLowerCase().endsWith('.pdf')));
  const isImage = resolvedType.startsWith('image/');

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadDocument(fileUrl, blobUrl, downloadFileName || fileName || (isPdf ? 'document.pdf' : 'document'));
    } catch {
      addToast('The document could not be downloaded. Please try again.', 'ERROR');
    } finally {
      setDownloading(false);
    }
  };

  const downloadButton = (label: string) => (
    <button type="button" className="doc-viewer-btn" onClick={() => void handleDownload()} disabled={downloading} title="Download document">
      {downloading ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
      <span>{label}</span>
    </button>
  );

  return (
    <ModalPortal>
      <ModalOverlay onDismiss={onClose}>
        <div
          className="doc-viewer-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview of ${title}`}
        >
          {/* Header */}
          <div className="doc-viewer-header">
            <div className="doc-viewer-meta">
              <div className="doc-viewer-icon" aria-hidden="true">
                <FileText size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h2 className="doc-viewer-title" title={title}>{title}</h2>
                {(fileName || fileSize) && (
                  <p className="doc-viewer-subtitle" title={fileName}>
                    {fileName} {fileSize ? `· ${formatSize(fileSize)}` : ''}
                  </p>
                )}
              </div>
            </div>

            {/* Toolbar */}
            <div className="doc-viewer-toolbar">
              <PreviewZoomControls
                zoom={zoom}
                onZoomChange={setZoom}
                disabled={!blobUrl || !(isPdf || isImage)}
                buttonClassName="doc-viewer-btn doc-viewer-btn-icon"
              />

              {isImage && (
                <button
                  type="button"
                  className="doc-viewer-btn doc-viewer-btn-icon"
                  onClick={() => setRotation(prev => (prev + 90) % 360)}
                  title="Rotate 90 degrees"
                  aria-label="Rotate clockwise"
                  disabled={!blobUrl}
                >
                  <RotateCw size={16} />
                </button>
              )}

              {blobUrl && downloadButton('Download')}

              <button
                type="button"
                className="doc-viewer-close-btn"
                onClick={onClose}
                title="Close viewer (Esc)"
                aria-label="Close viewer"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Viewer Body */}
          <div className="doc-viewer-body" aria-busy={loading}>
            {loading ? (
              <div className="doc-viewer-status-container" role="status">
                <Loader2 size={36} className="spin" color="#2f7d52" />
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  Loading document preview…
                </p>
              </div>
            ) : error ? (
              <div className="doc-viewer-status-container" role="alert">
                <AlertTriangle size={36} color="#dc2626" />
                <p style={{ margin: 0, fontWeight: 700, color: '#dc2626' }}>
                  Unable to view document
                </p>
                <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
                  {error}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button type="button" className="doc-viewer-btn" onClick={retry}>
                    <RefreshCw size={15} /> Retry
                  </button>
                  {downloadButton('Download')}
                </div>
              </div>
            ) : isPdf && blobUrl ? (
              // Zoom resizes the frame inside a scroll area; the src never
              // changes, so zooming cannot reload the document.
              <PdfPages url={blobUrl} zoom={zoom} title={title} />
            ) : isImage && blobUrl ? (
              <div className="doc-viewer-image-canvas">
                <img
                  src={blobUrl}
                  alt={title}
                  className="doc-viewer-img"
                  style={{
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  }}
                />
              </div>
            ) : (
              <div className="doc-viewer-status-container">
                <FileText size={40} color="var(--color-text-muted)" />
                <p style={{ margin: 0, fontWeight: 700 }}>
                  Preview unavailable for this format
                </p>
                <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
                  Only PDF, PNG and JPEG files can be shown here. You can download the file to inspect it.
                </p>
                {downloadButton('Download file')}
              </div>
            )}
          </div>
        </div>
      </ModalOverlay>
    </ModalPortal>
  );
};
