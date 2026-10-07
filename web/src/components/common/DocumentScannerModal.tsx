import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, RotateCw, Trash2, Crop, Image as ImageIcon, Loader2, AlertCircle, RefreshCw, SwitchCamera, Plus, Wand2, RotateCcw, Check } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { ModalPortal } from './ModalPortal';
import { detectIn, quadDrift, renderPage, loadImage, FULL_QUAD, type Quad, type ScanFilter } from './scanner/vision';
import './document-scanner-modal.css';

export interface DocumentScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (scannedFile: File) => void;
  documentTypeName?: string;
}

type Page = { id: number; original: string; quad: Quad; filter: ScanFilter; rotation: number; rendered: string | null };
type Stage = 'camera' | 'review' | 'crop';

const FILTERS: { key: ScanFilter; label: string }[] = [
  { key: 'auto', label: 'Auto' }, { key: 'gray', label: 'Grayscale' }, { key: 'bw', label: 'Black & white' }, { key: 'none', label: 'Original' },
];
const PAGE_LIMIT = 20;
/** The page must stay put this long before auto-capture fires (the app's "hold steady"). */
const STEADY_MS = 1100;

/**
 * Web phone scanner, built to match the Android app's ML Kit document scanner (full mode): live page
 * outline with automatic capture, corner crop, Auto / Grayscale / Black & white filters, rotate,
 * retake, delete, gallery import and several pages, saved as one PDF.
 */
export const DocumentScannerModal: React.FC<DocumentScannerModalProps> = ({ isOpen, onClose, onScanComplete, documentTypeName = 'Document' }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  const [stage, setStage] = useState<Stage>('camera');
  const [currentStream, setCurrentStream] = useState<MediaStream | null>(null);
  const [cameraConnecting, setCameraConnecting] = useState(true);
  const [hasLiveFrames, setHasLiveFrames] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);
  const [autoCapture, setAutoCapture] = useState(true);
  const [liveQuad, setLiveQuad] = useState<Quad | null>(null);
  const [steady, setSteady] = useState(0); // 0..1 progress of the hold-steady timer
  const [flash, setFlash] = useState(false);

  const [pages, setPages] = useState<Page[]>([]);
  const [active, setActive] = useState(0);
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [cropQuad, setCropQuad] = useState<Quad | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => { try { t.stop(); } catch { /* already stopped */ } });
    streamRef.current = null;
    if (videoRef.current) { try { videoRef.current.srcObject = null; } catch { /* detached */ } }
    setCurrentStream(null); setHasLiveFrames(false); setLiveQuad(null); setSteady(0);
  }, []);

  const startCamera = useCallback(async (preferredDeviceId?: string) => {
    stopCamera(); setCameraError(null); setCameraConnecting(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(window.isSecureContext === false ? 'The camera needs a secure connection (HTTPS).' : 'This browser cannot use the camera.');
      setCameraConnecting(false); return;
    }
    const ladder: MediaStreamConstraints[] = [
      preferredDeviceId ? { video: { deviceId: { exact: preferredDeviceId } }, audio: false }
        : { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false },
      preferredDeviceId ? { video: { deviceId: { ideal: preferredDeviceId } }, audio: false } : { video: { facingMode: 'environment' }, audio: false },
      { video: true, audio: false },
    ];
    let lastError: any = null, stream: MediaStream | null = null;
    for (const c of ladder) {
      try { stream = await navigator.mediaDevices.getUserMedia(c); break; }
      catch (err: any) { lastError = err; if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') break; }
    }
    if (!stream) {
      const n = lastError?.name || '';
      setCameraError(n === 'NotAllowedError' || n === 'PermissionDeniedError' ? 'Camera permission was denied. Allow the camera in your browser settings, or choose a photo from the gallery.'
        : n === 'NotFoundError' ? 'No camera was found on this device.'
        : n === 'NotReadableError' ? 'Another app is using the camera.'
        : lastError?.message || 'The camera could not start.');
      setCameraConnecting(false); return;
    }
    streamRef.current = stream; setCurrentStream(stream);
    try { setAvailableDevices((await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput')); } catch { /* optional */ }
  }, [stopCamera]);

  useEffect(() => {
    const video = videoRef.current; if (!video || !currentStream) return;
    video.srcObject = currentStream; video.muted = true; video.playsInline = true;
    let live = true;
    const onMeta = async () => { if (!live) return; try { await video.play(); setHasLiveFrames(true); setCameraConnecting(false); } catch { /* autoplay blocked until a tap */ } };
    video.addEventListener('loadedmetadata', onMeta); if (video.readyState >= 1) void onMeta();
    return () => { live = false; video.removeEventListener('loadedmetadata', onMeta); };
  }, [currentStream]);

  useEffect(() => {
    if (!currentStream || hasLiveFrames) return;
    const t = setTimeout(() => { const v = videoRef.current; if (!v || !v.videoWidth) { setCameraError('The camera preview did not start. Close other apps using the camera, or choose a photo.'); setCameraConnecting(false); } }, 5000);
    return () => clearTimeout(t);
  }, [currentStream, hasLiveFrames]);

  // Open / close: fresh session each time; the camera runs only on the camera stage.
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('has-scanner-open');
      setPages([]); setActive(0); setStage('camera'); setRetakeIndex(null); setBusy(null);
    } else { document.body.classList.remove('has-scanner-open'); stopCamera(); }
    return () => { document.body.classList.remove('has-scanner-open'); stopCamera(); };
  }, [isOpen, stopCamera]);
  useEffect(() => {
    if (!isOpen) return;
    if (stage === 'camera') void startCamera(availableDevices[currentDeviceIndex]?.deviceId);
    else stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, stage]);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') stopCamera(); else if (isOpen && stage === 'camera') void startCamera(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [isOpen, stage, startCamera, stopCamera]);

  /** Adds a captured image as a page (or replaces the page being retaken) and opens it for review. */
  const addPage = useCallback(async (original: string, detected: Quad | null) => {
    setBusy('Preparing page…');
    try {
      const quad = detected ?? FULL_QUAD;
      const rendered = await renderPage(original, quad, 'auto', 0);
      setPages(prev => {
        const page: Page = { id: nextId.current++, original, quad, filter: 'auto', rotation: 0, rendered };
        if (retakeIndex !== null && prev[retakeIndex]) { const copy = [...prev]; copy[retakeIndex] = page; setActive(retakeIndex); return copy; }
        setActive(prev.length); return [...prev, page];
      });
      setRetakeIndex(null); setStage('review');
    } catch (e: any) { setCameraError(e?.message || 'The page could not be prepared.'); }
    finally { setBusy(null); }
  }, [retakeIndex]);

  const capture = useCallback(() => {
    const v = videoRef.current; if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    setFlash(true); setTimeout(() => setFlash(false), 180);
    const quad = detectIn(c, c.width, c.height) ?? liveQuad;
    void addPage(c.toDataURL('image/jpeg', 0.92), quad);
  }, [addPage, liveQuad]);

  // The loop calls capture through a ref: capture changes with every detected outline, and
  // restarting the loop on each change would reset the hold-steady timer forever.
  const captureRef = useRef(capture);
  captureRef.current = capture;

  // Live detection loop: draw the outline, and auto-capture once the page holds still.
  useEffect(() => {
    if (!isOpen || stage !== 'camera' || !hasLiveFrames) return;
    let stop = false, last: Quad | null = null, steadySince = 0, timer = 0;
    const tick = () => {
      if (stop) return;
      const v = videoRef.current;
      if (v && v.videoWidth && !busy) {
        const q = detectIn(v, v.videoWidth, v.videoHeight);
        setLiveQuad(q);
        const now = performance.now();
        if (q && last && quadDrift(q, last) < 0.025) { if (!steadySince) steadySince = now; }
        else steadySince = 0;
        last = q;
        const p = steadySince ? Math.min(1, (now - steadySince) / STEADY_MS) : 0;
        setSteady(autoCapture ? p : 0);
        if (autoCapture && p >= 1 && pages.length < PAGE_LIMIT) { steadySince = 0; last = null; captureRef.current(); return; }
      }
      timer = window.setTimeout(tick, 140);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [isOpen, stage, hasLiveFrames, autoCapture, busy, pages.length]);

  // Paint the detected outline over the video (object-fit: cover mapping).
  useEffect(() => {
    const cv = overlayRef.current, v = videoRef.current; if (!cv || !v) return;
    const r = cv.getBoundingClientRect(); cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!liveQuad || !v.videoWidth) return;
    const scale = Math.max(cv.width / v.videoWidth, cv.height / v.videoHeight);
    const ox = (cv.width - v.videoWidth * scale) / 2, oy = (cv.height - v.videoHeight * scale) / 2;
    const pts = liveQuad.map(p => ({ x: ox + p.x * v.videoWidth * scale, y: oy + p.y * v.videoHeight * scale }));
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
    ctx.fillStyle = 'rgba(66, 196, 120, 0.22)'; ctx.fill();
    ctx.lineWidth = 4 * devicePixelRatio; ctx.strokeStyle = '#4ADE80'; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = '#FFFFFF'; pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 7 * devicePixelRatio, 0, Math.PI * 2); ctx.fill(); });
  }, [liveQuad]);

  if (!isOpen) return null;

  const page = pages[active];
  const updatePage = async (patch: Partial<Page>) => {
    if (!page) return;
    const next = { ...page, ...patch };
    setBusy('Updating…');
    try { next.rendered = await renderPage(next.original, next.quad, next.filter, next.rotation); setPages(prev => prev.map((p, i) => (i === active ? next : p))); }
    finally { setBusy(null); }
  };
  const deletePage = () => {
    setPages(prev => { const copy = prev.filter((_, i) => i !== active); setActive(Math.max(0, Math.min(active, copy.length - 1))); if (!copy.length) setStage('camera'); return copy; });
  };

  const onGalleryPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []); if (fileInputRef.current) fileInputRef.current.value = '';
    if (!files.length) return;
    if (files.length === 1 && files[0].type === 'application/pdf') { stopCamera(); onScanComplete(files[0]); onClose(); return; }
    for (const f of files.filter(f => f.type.startsWith('image/')).slice(0, PAGE_LIMIT - pages.length)) {
      const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
      const img = await loadImage(url);
      // Re-encode through a canvas so every page is a JPEG the PDF can embed.
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d')!.drawImage(img, 0, 0);
      await addPage(c.toDataURL('image/jpeg', 0.92), detectIn(c, c.width, c.height));
    }
  };

  const save = async () => {
    if (!pages.length || busy) return;
    setBusy('Saving PDF…');
    try {
      const pdfDoc = await PDFDocument.create();
      for (const p of pages) {
        const bytes = await fetch(p.rendered || p.original).then(r => r.arrayBuffer());
        const jpg = await pdfDoc.embedJpg(bytes);
        // A4-width pages like the app's PDF output, keeping each page's own proportions.
        const w = 595.28, h = (jpg.height / jpg.width) * w;
        pdfDoc.addPage([w, h]).drawImage(jpg, { x: 0, y: 0, width: w, height: h });
      }
      const pdfBytes = await pdfDoc.save();
      const safeName = `${documentTypeName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_scanned_${Date.now()}.pdf`;
      // Copy out exactly this view of the bytes (pdf-lib may hand back a view into a larger buffer).
      const cleanBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
      stopCamera();
      onScanComplete(new File([cleanBuffer], safeName, { type: 'application/pdf' }));
      onClose();
    } catch (err: any) {
      setCameraError(`The PDF could not be made: ${err?.message || 'unknown error'}`);
    } finally { setBusy(null); }
  };

  const hint = !hasLiveFrames ? 'Starting camera…' : liveQuad ? (autoCapture ? (steady > 0.05 ? 'Hold still…' : 'Document found') : 'Tap the shutter') : 'Looking for a document…';

  return (
    <ModalPortal>
      <div className="dsx" role="dialog" aria-modal="true" aria-label={`Scan ${documentTypeName}`}>
        <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={e => void onGalleryPick(e)} />

        {stage === 'camera' && (
          <>
            <header className="dsx-top">
              <button type="button" className="dsx-icon" onClick={() => (pages.length ? setStage('review') : onClose())} aria-label={pages.length ? 'Back to pages' : 'Close scanner'}><X size={24} /></button>
              <div className="dsx-seg" role="group" aria-label="Capture mode">
                <button type="button" aria-pressed={autoCapture} onClick={() => setAutoCapture(true)}>Auto</button>
                <button type="button" aria-pressed={!autoCapture} onClick={() => setAutoCapture(false)}>Manual</button>
              </div>
              {availableDevices.length > 1 ? (
                <button type="button" className="dsx-icon" aria-label="Switch camera" onClick={() => { const i = (currentDeviceIndex + 1) % availableDevices.length; setCurrentDeviceIndex(i); void startCamera(availableDevices[i].deviceId); }}><SwitchCamera size={22} /></button>
              ) : <span className="dsx-icon dsx-icon--ghost" />}
            </header>

            <div className="dsx-stage">
              <video ref={videoRef} className="dsx-video" playsInline autoPlay muted />
              <canvas ref={overlayRef} className="dsx-overlay" aria-hidden="true" />
              {flash && <div className="dsx-flash" />}
              {!cameraError && <div className={`dsx-hint${liveQuad ? ' is-found' : ''}`} role="status">{hint}</div>}
              {cameraConnecting && !cameraError && <div className="dsx-center"><Loader2 size={40} className="spin" /></div>}
              {cameraError && (
                <div className="dsx-center dsx-error">
                  <AlertCircle size={44} />
                  <strong>Camera unavailable</strong>
                  <span>{cameraError}</span>
                  <div className="dsx-row">
                    <button type="button" className="dsx-pill" onClick={() => void startCamera()}><RefreshCw size={18} /> Try again</button>
                    <button type="button" className="dsx-pill is-primary" onClick={() => fileInputRef.current?.click()}><ImageIcon size={18} /> Choose from gallery</button>
                  </div>
                </div>
              )}
            </div>

            <footer className="dsx-bottom">
              <button type="button" className="dsx-icon dsx-icon--lg" onClick={() => fileInputRef.current?.click()} aria-label="Import from gallery"><ImageIcon size={26} /></button>
              <button type="button" className="dsx-shutter" onClick={capture} disabled={!hasLiveFrames || !!busy || pages.length >= PAGE_LIMIT} aria-label="Capture page"
                style={{ ['--p' as any]: steady }}>
                <span />
              </button>
              {pages.length ? (
                <button type="button" className="dsx-thumb" onClick={() => setStage('review')} aria-label={`Review ${pages.length} page${pages.length === 1 ? '' : 's'}`}>
                  <img src={pages[pages.length - 1].rendered || pages[pages.length - 1].original} alt="" />
                  <b>{pages.length}</b>
                </button>
              ) : <span className="dsx-icon dsx-icon--lg dsx-icon--ghost" />}
            </footer>
          </>
        )}

        {stage === 'review' && page && (
          <>
            <header className="dsx-top">
              <button type="button" className="dsx-icon" onClick={onClose} aria-label="Discard and close"><X size={24} /></button>
              <span className="dsx-title">Page {active + 1} of {pages.length}</span>
              <button type="button" className="dsx-save" onClick={() => void save()} disabled={!!busy}>Save</button>
            </header>
            <div className="dsx-stage dsx-stage--review">
              <img className="dsx-page" src={page.rendered || page.original} alt={`Page ${active + 1}`} />
            </div>
            {showFilters && (
              <div className="dsx-filters" role="group" aria-label="Filter">
                {FILTERS.map(f => <button key={f.key} type="button" aria-pressed={page.filter === f.key} onClick={() => void updatePage({ filter: f.key })}>{f.label}</button>)}
              </div>
            )}
            <div className="dsx-strip" aria-label="Pages">
              {pages.map((p, i) => (
                <button key={p.id} type="button" className={`dsx-strip__item${i === active ? ' is-on' : ''}`} onClick={() => setActive(i)} aria-label={`Page ${i + 1}`} aria-current={i === active}>
                  <img src={p.rendered || p.original} alt="" /><b>{i + 1}</b>
                </button>
              ))}
              {pages.length < PAGE_LIMIT && <button type="button" className="dsx-strip__add" onClick={() => { setRetakeIndex(null); setStage('camera'); }} aria-label="Add page"><Plus size={26} /></button>}
            </div>
            <nav className="dsx-tools" aria-label="Page tools">
              <button type="button" onClick={() => { setRetakeIndex(null); setStage('camera'); }}><Plus size={22} /><span>Add</span></button>
              <button type="button" onClick={() => { setRetakeIndex(active); setStage('camera'); }}><RotateCcw size={22} /><span>Retake</span></button>
              <button type="button" onClick={() => { setCropQuad(page.quad); setStage('crop'); }}><Crop size={22} /><span>Crop</span></button>
              <button type="button" onClick={() => void updatePage({ rotation: (page.rotation + 1) % 4 })}><RotateCw size={22} /><span>Rotate</span></button>
              <button type="button" aria-pressed={showFilters} onClick={() => setShowFilters(s => !s)}><Wand2 size={22} /><span>Filter</span></button>
              <button type="button" onClick={deletePage}><Trash2 size={22} /><span>Delete</span></button>
            </nav>
          </>
        )}

        {stage === 'crop' && page && cropQuad && (
          <CropStage src={page.original} quad={cropQuad} onChange={setCropQuad}
            onCancel={() => setStage('review')}
            onAuto={async () => { const img = await loadImage(page.original); setCropQuad(detectIn(img, img.naturalWidth, img.naturalHeight) ?? FULL_QUAD); }}
            onFull={() => setCropQuad([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])}
            onApply={async () => { await updatePage({ quad: cropQuad }); setStage('review'); }} />
        )}

        {busy && <div className="dsx-busy" role="status"><Loader2 size={30} className="spin" /><span>{busy}</span></div>}
      </div>
    </ModalPortal>
  );
};

/** Four draggable corners over the original photo, like the app's crop screen. */
const CropStage: React.FC<{ src: string; quad: Quad; onChange: (q: Quad) => void; onCancel: () => void; onAuto: () => void; onFull: () => void; onApply: () => void }> = ({ src, quad, onChange, onCancel, onAuto, onFull, onApply }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const move = (e: React.PointerEvent) => {
    if (drag.current === null || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    const next = quad.map((p, i) => (i === drag.current ? { x, y } : p)) as Quad;
    onChange(next);
  };
  const pts = quad.map(p => `${p.x * 100},${p.y * 100}`).join(' ');
  return (
    <>
      <header className="dsx-top">
        <button type="button" className="dsx-icon" onClick={onCancel} aria-label="Cancel crop"><X size={24} /></button>
        <span className="dsx-title">Crop</span>
        <button type="button" className="dsx-save" onClick={onApply}><Check size={20} /> Apply</button>
      </header>
      <div className="dsx-stage dsx-stage--review">
        <div className="dsx-crop" ref={boxRef} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          <img src={src} alt="Page to crop" draggable={false} />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polygon points={pts} />
          </svg>
          {quad.map((p, i) => (
            <button key={i} type="button" className="dsx-handle" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              aria-label={['Top-left corner', 'Top-right corner', 'Bottom-right corner', 'Bottom-left corner'][i]}
              onPointerDown={e => { drag.current = i; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
              onPointerMove={move} onPointerUp={() => { drag.current = null; }}
              onKeyDown={e => {
                const step = 0.01, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
                if (!d) return; e.preventDefault();
                onChange(quad.map((q, j) => (j === i ? { x: Math.max(0, Math.min(1, q.x + d[0])), y: Math.max(0, Math.min(1, q.y + d[1])) } : q)) as Quad);
              }} />
          ))}
        </div>
      </div>
      <nav className="dsx-tools dsx-tools--two" aria-label="Crop tools">
        <button type="button" onClick={onAuto}><Wand2 size={22} /><span>Detect edges</span></button>
        <button type="button" onClick={onFull}><Crop size={22} /><span>Whole photo</span></button>
      </nav>
    </>
  );
};
