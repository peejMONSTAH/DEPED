import React from 'react';
import { createRoot } from 'react-dom/client';
import { Camera, X, RotateCw, Check, Image as ImageIcon, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import '../src/index.css';
import '../src/components/common/document-scanner-modal.css';

// SVG Letter of Intent placeholder image for preview
const sampleDocSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="850" viewBox="0 0 600 850"><rect width="100%" height="100%" fill="%23f8fafc"/><rect x="50" y="60" width="120" height="20" fill="%23cbd5e1" rx="4"/><rect x="50" y="100" width="200" height="14" fill="%2394a3b8" rx="3"/><rect x="50" y="125" width="180" height="14" fill="%2394a3b8" rx="3"/><rect x="50" y="150" width="150" height="14" fill="%2394a3b8" rx="3"/><rect x="50" y="210" width="500" height="1" fill="%23e2e8f0"/><text x="50" y="250" font-family="sans-serif" font-size="22" font-weight="bold" fill="%231e293b">LETTER OF INTENT</text><text x="50" y="280" font-family="sans-serif" font-size="14" fill="%23475569">SUBJECT: Application for Promotion - Master Teacher I</text><rect x="50" y="320" width="500" height="12" fill="%23cbd5e1" rx="2"/><rect x="50" y="345" width="480" height="12" fill="%23cbd5e1" rx="2"/><rect x="50" y="370" width="460" height="12" fill="%23cbd5e1" rx="2"/><rect x="50" y="395" width="490" height="12" fill="%23cbd5e1" rx="2"/><rect x="50" y="440" width="500" height="12" fill="%23cbd5e1" rx="2"/><rect x="50" y="465" width="450" height="12" fill="%23cbd5e1" rx="2"/><rect x="50" y="550" width="180" height="16" fill="%23475569" rx="3"/><text x="50" y="610" font-family="sans-serif" font-size="16" font-weight="bold" fill="%231e293b">MARIA SANTOS DELA CRUZ</text><text x="50" y="632" font-family="sans-serif" font-size="13" fill="%2364748b">Teacher III, Koronadal NHS</text></svg>`;

export const ScannerQAFixture: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode') || 'after'; // 'before' or 'after'
  const isBefore = mode === 'before';

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
      <div
        className="doc-scanner-dialog"
        style={{
          width: '100%',
          height: '100%',
          maxWidth: '100%',
          maxHeight: '100%',
          borderRadius: 0,
          border: 'none',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="doc-scanner-header">
          <h2 className="doc-scanner-title">
            <Camera size={20} color="#3b82f6" />
            <span>Document Scanner: Letter of Intent</span>
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 4, background: isBefore ? '#ef4444' : '#10b981', color: '#fff', fontWeight: 700 }}>
              {isBefore ? 'BEFORE (Overlap Bug)' : 'AFTER (Fixed Layout)'}
            </span>
            <button type="button" className="doc-scanner-close" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Viewport with simulated preview */}
        <div className="doc-scanner-body" style={{ flex: 1, minHeight: 0 }}>
          <div className="doc-scanner-viewport" style={{ background: '#1e293b' }}>
            <img
              src={sampleDocSvg}
              alt="Scanned Letter of Intent"
              style={{
                width: '85%',
                height: '85%',
                objectFit: 'contain',
                borderRadius: 6,
                boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
              }}
            />
            <div className="doc-scanner-guide">
              <div className="doc-scanner-guide-corner doc-scanner-guide-tl" />
              <div className="doc-scanner-guide-corner doc-scanner-guide-tr" />
              <div className="doc-scanner-guide-corner doc-scanner-guide-bl" />
              <div className="doc-scanner-guide-corner doc-scanner-guide-br" />
            </div>
            <div className="doc-scanner-tip">
              Page 1 captured • Ready to save or add more pages
            </div>
          </div>
        </div>

        {/* Thumbnail tray */}
        <div className="doc-scanner-tray">
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>
            1 Page:
          </span>
          <div className="doc-scanner-thumb active">
            <img src={sampleDocSvg} alt="Page 1" />
            <span className="doc-scanner-thumb-badge">1</span>
            <div className="doc-scanner-thumb-actions">
              <button type="button" className="doc-scanner-thumb-btn" title="Delete page">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Controls Bar: BEFORE (Single cramped row with overlap) vs AFTER (Two stacked rows) */}
        {isBefore ? (
          <div
            style={{
              padding: '16px 20px',
              paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
              background: 'rgba(15, 23, 42, 0.95)',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexShrink: 0,
              position: 'relative',
            }}
          >
            {/* Left tools */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 100, flex: '1 1 0' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '8px 12px', fontSize: '0.8125rem' }}
              >
                <ImageIcon size={16} /> <span>Add photo</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '8px 12px', fontSize: '0.8125rem' }}
              >
                <RotateCw size={16} /> <span>Rotate</span>
              </button>
            </div>

            {/* Center Shutter Button - causing overlap in single row flex */}
            <div style={{ position: 'relative', zIndex: 10 }}>
              <button
                type="button"
                className="doc-scanner-shutter-btn"
                style={{ margin: '0 auto', boxShadow: '0 0 20px rgba(59, 130, 246, 0.5)' }}
              >
                <Camera size={26} color="#3b82f6" />
              </button>
            </div>

            {/* Right Complete Action */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 100, flex: '1 1 0', zIndex: 5 }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  padding: '8px 16px',
                  background: '#2563eb',
                  color: '#fff',
                  borderRadius: 8,
                }}
              >
                <Check size={16} /> Save Document (1)
              </button>
            </div>
          </div>
        ) : (
          <div className="doc-scanner-controls">
            {/* Row 1: Capture & Tool Controls */}
            <div className="doc-scanner-capture-row">
              <div className="doc-scanner-left-tools">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm doc-scanner-tool-btn"
                  title="Add photo from gallery or file"
                >
                  <ImageIcon size={18} />
                  <span>Add photo</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm doc-scanner-tool-btn"
                  title="Rotate active page clockwise"
                >
                  <RotateCw size={18} />
                  <span>Rotate</span>
                </button>
              </div>

              <div className="doc-scanner-shutter-container">
                <button
                  type="button"
                  className="doc-scanner-shutter-btn"
                  title="Capture document page"
                  aria-label="Capture page"
                >
                  <Camera size={26} color="#3b82f6" />
                </button>
              </div>

              <div className="doc-scanner-right-tools">
                <div className="doc-scanner-page-nav">
                  <button type="button" className="doc-scanner-nav-btn" disabled title="Previous page">
                    <ChevronLeft size={16} />
                  </button>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, padding: '0 4px' }}>
                    1/1
                  </span>
                  <button type="button" className="doc-scanner-nav-btn" disabled title="Next page">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Row 2: Dedicated Full-Width Completion Action */}
            <div className="doc-scanner-completion-row">
              <button
                type="button"
                className="btn btn-primary doc-scanner-use-doc-btn"
              >
                <Check size={18} /> Use Document (1)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<ScannerQAFixture />);
