import React, { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Every page of a PDF drawn so the whole page fits the viewer (zoom 1 = fit
 * page: width and height), never opening zoomed in; zoom enlarges from there.
 * Used instead of an <iframe>: iOS Safari draws framed PDFs at native size,
 * cannot scroll them, and so showed only a zoomed-in corner of the page.
 */
export const PdfPages: React.FC<{ url: string; zoom: number; title: string }> = ({ url, zoom, title }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const task = getDocument(url);
    task.promise.then(doc => { if (!cancelled) setPdf(doc); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; void task.destroy(); };
  }, [url]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => { setWidth(el.clientWidth); setHeight(el.clientHeight); };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={scrollRef} className="doc-viewer-pdf-scroll" style={{ padding: '12px 0' }}>
      {failed && <p className="text-sm" style={{ textAlign: 'center', color: 'var(--color-danger)' }}>This PDF could not be displayed here. Use Download to open it.</p>}
      {!pdf && !failed && <p className="text-sm text-muted" style={{ textAlign: 'center' }}>Rendering pages…</p>}
      {pdf && width > 0 && Array.from({ length: pdf.numPages }, (_, i) => (
        <PdfPage key={i} pdf={pdf} pageNumber={i + 1} boxWidth={width - 24} boxHeight={height - 24} zoom={zoom} label={`${title}, page ${i + 1} of ${pdf.numPages}`} />
      ))}
    </div>
  );
};

const PdfPage: React.FC<{ pdf: PDFDocumentProxy; pageNumber: number; boxWidth: number; boxHeight: number; zoom: number; label: string }> = ({ pdf, pageNumber, boxWidth, boxHeight, zoom, label }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cssHeight, setCssHeight] = useState<number | undefined>();
  const [cssWidth, setCssWidth] = useState<number>(Math.max(120, boxWidth));

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    pdf.getPage(pageNumber).then(page => {
      if (cancelled || !canvasRef.current) return;
      const base = page.getViewport({ scale: 1 });
      // Fit the whole page in the box (a very short box falls back to width).
      const fitScale = boxHeight > 200 ? Math.min(boxWidth / base.width, boxHeight / base.height) : boxWidth / base.width;
      const scale = Math.max(0.1, fitScale * zoom);
      setCssWidth(base.width * scale);
      // Sharp on high-density screens, capped so large zooms stay within canvas limits.
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * pixelRatio });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      setCssHeight(viewport.height / pixelRatio);
      renderTask = page.render({ canvasContext: canvas.getContext('2d')!, viewport, canvas } as any);
      renderTask.promise.catch(() => { /* superseded by a newer zoom */ });
    });
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [pdf, pageNumber, boxWidth, boxHeight, zoom]);

  return (
    <canvas ref={canvasRef} role="img" aria-label={label}
      style={{ display: 'block', width: cssWidth, height: cssHeight, margin: '0 auto 12px', background: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.12)', borderRadius: 4 }} />
  );
};
