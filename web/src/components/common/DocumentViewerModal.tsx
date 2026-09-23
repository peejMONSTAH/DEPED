import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  ExternalLink,
  AlertTriangle,
  Loader2,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { ModalPortal } from './ModalPortal';
import { ModalOverlay } from './ModalOverlay';
import apiClient, { API_BASE_URL } from '../../api/client';
import { loadDocumentPreview } from './document-preview';
import './document-viewer-modal.css';

export interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  /** Primary endpoint to fetch file bytes from via apiClient, e.g. `/personnel/documents/${id}/file` */
  fileUrl: string;
  /** Optional view token endpoint to generate a signed single-use URL for opening in a new tab */
  viewTokenUrl?: string;
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
  viewTokenUrl,
  downloadFileName,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [resolvedType, setResolvedType] = useState<string>('');
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [openingNewTab, setOpeningNewTab] = useState(false);
  const [popupBlockedUrl, setPopupBlockedUrl] = useState<string | null>(null);

  const cleanBlobUrl = useCallback(() => {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }
  }, [blobUrl]);

  const fetchDocument = useCallback(async () => {
    if (!fileUrl) return;
    setLoading(true);
    setError(null);
    setPopupBlockedUrl(null);

    try {
      const { blob, type } = await loadDocumentPreview(apiClient, fileUrl, API_BASE_URL, mimeType);
      setResolvedType(type);

      const objectUrl = URL.createObjectURL(blob);
      setBlobUrl(objectUrl);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) {
        // The server answers a document outside the viewer's station exactly
        // like a missing one, so this message covers both on purpose.
        setError('This document is unavailable, or you do not have access to it.');
      } else if (status === 403) {
        setError('You do not have authorization to view this document.');
      } else if (status === 401) {
        setError('Your session has expired. Please sign in again to view this document.');
      } else {
        setError(err?.response?.data?.message || 'Failed to load the document preview. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  }, [fileUrl, mimeType]);

  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setRotation(0);
      void fetchDocument();
    } else {
      cleanBlobUrl();
    }
    return () => {
      cleanBlobUrl();
    };
  }, [isOpen, fetchDocument]);

  if (!isOpen) return null;

  const isPdf = resolvedType === 'application/pdf' || fileUrl.toLowerCase().includes('.pdf') || (fileName && fileName.toLowerCase().endsWith('.pdf'));
  const isImage = resolvedType.startsWith('image/') || (!isPdf && ['jpg', 'jpeg', 'png'].some(ext => fileName?.toLowerCase().endsWith(ext)));

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => {
    setZoom(1);
    setRotation(0);
  };
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = downloadFileName || fileName || (isPdf ? 'document.pdf' : 'document.jpg');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenInNewTab = async () => {
    if (openingNewTab) return;
    setPopupBlockedUrl(null);
    setOpeningNewTab(true);

    try {
      // Determine the token endpoint: explicitly passed viewTokenUrl or derived from fileUrl
      const tokenEndpoint = viewTokenUrl || (fileUrl.endsWith('/file') ? fileUrl.replace(/\/file$/, '/view-token') : null);

      let targetUrl: string;
      if (tokenEndpoint) {
        const res = await apiClient.get(tokenEndpoint);
        targetUrl = res.data?.data?.fileUrl || res.data?.fileUrl;
        if (!targetUrl) throw new Error('Token endpoint did not return authorized URL');
      } else if (blobUrl) {
        targetUrl = blobUrl;
      } else {
        targetUrl = fileUrl;
      }

      const opened = window.open(targetUrl, '_blank', 'noopener,noreferrer');
      if (!opened || opened.closed || typeof opened.closed === 'undefined') {
        setPopupBlockedUrl(targetUrl);
      }
    } catch (err) {
      // Fallback: try opening blobUrl or fileUrl
      if (blobUrl) {
        const fallback = window.open(blobUrl, '_blank');
        if (!fallback) setPopupBlockedUrl(blobUrl);
      }
    } finally {
      setOpeningNewTab(false);
    }
  };

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
              {isImage && (
                <>
                  <div className="doc-viewer-tool-group">
                    <button
                      type="button"
                      className="doc-viewer-btn doc-viewer-btn-icon"
                      onClick={handleZoomOut}
                      title="Zoom out"
                      aria-label="Zoom out"
                      disabled={loading || Boolean(error) || zoom <= 0.5}
                    >
                      <ZoomOut size={16} />
                    </button>
                    <span className="doc-viewer-zoom-level">{Math.round(zoom * 100)}%</span>
                    <button
                      type="button"
                      className="doc-viewer-btn doc-viewer-btn-icon"
                      onClick={handleZoomIn}
                      title="Zoom in"
                      aria-label="Zoom in"
                      disabled={loading || Boolean(error) || zoom >= 3}
                    >
                      <ZoomIn size={16} />
                    </button>
                  </div>

                  <button
                    type="button"
                    className="doc-viewer-btn doc-viewer-btn-icon"
                    onClick={handleRotate}
                    title="Rotate 90 degrees"
                    aria-label="Rotate clockwise"
                    disabled={loading || Boolean(error)}
                  >
                    <RotateCw size={16} />
                  </button>

                  {(zoom !== 1 || rotation !== 0) && (
                    <button
                      type="button"
                      className="doc-viewer-btn"
                      onClick={handleResetZoom}
                      title="Reset view"
                    >
                      Reset
                    </button>
                  )}
                </>
              )}

              {blobUrl && (
                <button
                  type="button"
                  className="doc-viewer-btn"
                  onClick={handleDownload}
                  title="Download document"
                >
                  <Download size={15} />
                  <span>Download</span>
                </button>
              )}

              <button
                type="button"
                className="doc-viewer-btn"
                onClick={handleOpenInNewTab}
                title="Open document in a new window"
                disabled={openingNewTab}
              >
                {openingNewTab ? <Loader2 size={15} className="spin" /> : <ExternalLink size={15} />}
                <span>New tab</span>
              </button>

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

          {/* Popup Blocked Warning */}
          {popupBlockedUrl && (
            <div className="doc-viewer-popup-notice" role="alert">
              <span>Your browser blocked the document pop-up window.</span>
              <a href={popupBlockedUrl} target="_blank" rel="noopener noreferrer">
                Click here to open the document
              </a>
            </div>
          )}

          {/* Viewer Body */}
          <div className="doc-viewer-body">
            {loading ? (
              <div className="doc-viewer-status-container">
                <Loader2 size={36} className="spin" color="#2f7d52" />
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  Loading document preview…
                </p>
              </div>
            ) : error ? (
              <div className="doc-viewer-status-container">
                <AlertTriangle size={36} color="#dc2626" />
                <p style={{ margin: 0, fontWeight: 700, color: '#dc2626' }}>
                  Unable to view document
                </p>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                  {error}
                </p>
                <button
                  type="button"
                  className="doc-viewer-btn"
                  onClick={() => void fetchDocument()}
                  style={{ marginTop: 8 }}
                >
                  <RefreshCw size={15} /> Retry
                </button>
              </div>
            ) : isPdf && blobUrl ? (
              <iframe
                src={`${blobUrl}#toolbar=0`}
                className="doc-viewer-iframe"
                title={title}
              />
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
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                  This file format cannot be displayed directly in the browser. You can download the file to inspect it.
                </p>
                {blobUrl && (
                  <button
                    type="button"
                    className="doc-viewer-btn"
                    onClick={handleDownload}
                    style={{ marginTop: 8 }}
                  >
                    <Download size={15} /> Download file
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </ModalOverlay>
    </ModalPortal>
  );
};
export default DocumentViewerModal;
