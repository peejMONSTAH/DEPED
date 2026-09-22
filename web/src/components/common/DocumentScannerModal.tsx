import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  X,
  RotateCw,
  Trash2,
  Check,
  Upload,
  Loader2,
  FileText,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { ModalPortal } from './ModalPortal';
import { ModalOverlay } from './ModalOverlay';
import './document-scanner-modal.css';

export interface DocumentScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (scannedFile: File) => void;
  documentTypeName?: string;
}

export const DocumentScannerModal: React.FC<DocumentScannerModalProps> = ({
  isOpen,
  onClose,
  onScanComplete,
  documentTypeName = 'Document',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [compiling, setCompiling] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported on this browser or connection.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission was denied. You can allow camera access or use file upload instead.'
        : (err.message || 'Unable to access device camera.');
      setCameraError(msg);
      setCameraActive(false);
    }
  }, [stopCamera]);

  useEffect(() => {
    if (isOpen) {
      setPages([]);
      setActivePageIndex(0);
      setCompiling(false);
      void startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  if (!isOpen) return null;

  const handleCapture = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setPages(prev => {
      const updated = [...prev, dataUrl];
      setActivePageIndex(updated.length - 1);
      return updated;
    });
  };

  const handleRotateActivePage = () => {
    if (pages.length === 0 || activePageIndex < 0 || activePageIndex >= pages.length) return;
    const currentDataUrl = pages[activePageIndex];
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      const rotated = canvas.toDataURL('image/jpeg', 0.88);
      setPages(prev => prev.map((p, idx) => (idx === activePageIndex ? rotated : p)));
    };
    img.src = currentDataUrl;
  };

  const handleDeleteActivePage = (idxToDelete: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPages(prev => {
      const updated = prev.filter((_, idx) => idx !== idxToDelete);
      if (activePageIndex >= updated.length) {
        setActivePageIndex(Math.max(0, updated.length - 1));
      }
      return updated;
    });
  };

  const handleMovePage = (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= pages.length) return;
    setPages(prev => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
    setActivePageIndex(targetIndex);
  };

  const handleFallbackFilePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      // Directly pass through the selected PDF file
      stopCamera();
      onScanComplete(file);
      onClose();
      return;
    }

    // Convert picked image to dataUrl and add as a page
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPages(prev => {
          const updated = [...prev, reader.result as string];
          setActivePageIndex(updated.length - 1);
          return updated;
        });
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCompleteScan = async () => {
    if (pages.length === 0 || compiling) return;
    setCompiling(true);

    try {
      const pdfDoc = await PDFDocument.create();

      for (const pageDataUrl of pages) {
        const imageBytes = await fetch(pageDataUrl).then(res => res.arrayBuffer());
        const jpgImage = await pdfDoc.embedJpg(imageBytes);
        const { width, height } = jpgImage.scale(1);

        const page = pdfDoc.addPage([width, height]);
        page.drawImage(jpgImage, {
          x: 0,
          y: 0,
          width,
          height,
        });
      }

      const pdfBytes = await pdfDoc.save();
      const safeName = `${documentTypeName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_scanned_${Date.now()}.pdf`;
      const compiledFile = new File([pdfBytes.buffer as ArrayBuffer], safeName, { type: 'application/pdf' });

      stopCamera();
      onScanComplete(compiledFile);
      onClose();
    } catch (err: any) {
      alert(`Could not compile scanned pages into PDF: ${err.message || 'Unknown error'}`);
    } finally {
      setCompiling(false);
    }
  };

  return (
    <ModalPortal>
      <ModalOverlay onDismiss={onClose}>
        <div
          className="doc-scanner-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={`Scan ${documentTypeName}`}
        >
          {/* Header */}
          <div className="doc-scanner-header">
            <h2 className="doc-scanner-title">
              <Camera size={20} color="#3b82f6" />
              <span>Document Scanner: {documentTypeName}</span>
            </h2>
            <button
              type="button"
              className="doc-scanner-close"
              onClick={onClose}
              aria-label="Close scanner"
              title="Close scanner"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="doc-scanner-body">
            {cameraActive ? (
              <div className="doc-scanner-viewport">
                <video
                  ref={videoRef}
                  className="doc-scanner-video"
                  playsInline
                  autoPlay
                  muted
                />
                <div className="doc-scanner-guide">
                  <div className="doc-scanner-guide-corner doc-scanner-guide-tl" />
                  <div className="doc-scanner-guide-corner doc-scanner-guide-tr" />
                  <div className="doc-scanner-guide-corner doc-scanner-guide-bl" />
                  <div className="doc-scanner-guide-corner doc-scanner-guide-br" />
                </div>
                <div className="doc-scanner-tip">
                  Align document within the frame and hold steady
                </div>
              </div>
            ) : (
              <div className="doc-scanner-fallback-banner">
                {cameraError ? (
                  <>
                    <AlertCircle size={44} color="#f59e0b" />
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '1.05rem' }}>
                      Camera not accessible
                    </p>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8', maxWidth: 400 }}>
                      {cameraError}
                    </p>
                    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => void startCamera()}
                      >
                        <RefreshCw size={15} /> Try camera again
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload size={15} /> Upload photo instead
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <Loader2 size={36} className="spin" color="#3b82f6" />
                    <p style={{ margin: 0, fontWeight: 600 }}>Connecting to camera…</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Captured Pages Thumbnail Tray */}
          {pages.length > 0 && (
            <div className="doc-scanner-tray">
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>
                {pages.length} {pages.length === 1 ? 'Page' : 'Pages'}:
              </span>
              {pages.map((imgUrl, idx) => (
                <div
                  key={idx}
                  className={`doc-scanner-thumb ${idx === activePageIndex ? 'active' : ''}`}
                  onClick={() => setActivePageIndex(idx)}
                >
                  <img src={imgUrl} alt={`Page ${idx + 1}`} />
                  <span className="doc-scanner-thumb-badge">{idx + 1}</span>
                  <div className="doc-scanner-thumb-actions">
                    <button
                      type="button"
                      className="doc-scanner-thumb-btn"
                      onClick={e => handleDeleteActivePage(idx, e)}
                      title="Delete page"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bottom Bar Controls */}
          <div className="doc-scanner-controls">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                style={{ display: 'none' }}
                onChange={handleFallbackFilePick}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => fileInputRef.current?.click()}
                title="Add photo from gallery or file"
              >
                <Upload size={14} /> Add photo
              </button>

              {pages.length > 0 && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleRotateActivePage}
                    title="Rotate selected page"
                  >
                    <RotateCw size={14} /> Rotate
                  </button>
                  {activePageIndex > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleMovePage(activePageIndex, 'left')}
                      title="Move page left"
                    >
                      <ChevronLeft size={14} />
                    </button>
                  )}
                  {activePageIndex < pages.length - 1 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleMovePage(activePageIndex, 'right')}
                      title="Move page right"
                    >
                      <ChevronRight size={14} />
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Center Shutter Button */}
            {cameraActive && (
              <button
                type="button"
                className="doc-scanner-shutter-btn"
                onClick={handleCapture}
                title="Capture document page"
                aria-label="Capture page"
              >
                <Camera size={26} color="#3b82f6" />
              </button>
            )}

            {/* Right Complete Action */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 100 }}>
              {pages.length > 0 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCompleteScan}
                  disabled={compiling}
                  style={{ gap: 6, fontWeight: 700 }}
                >
                  {compiling ? (
                    <>
                      <Loader2 size={16} className="spin" /> Compiling PDF…
                    </>
                  ) : (
                    <>
                      <Check size={16} /> Save Document ({pages.length})
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </ModalOverlay>
    </ModalPortal>
  );
};
export default DocumentScannerModal;
