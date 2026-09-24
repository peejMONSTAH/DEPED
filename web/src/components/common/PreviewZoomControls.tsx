import React from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { ZOOM_MAX, ZOOM_MIN, zoomIn, zoomOut, zoomPercent } from './document-preview';
import './preview-zoom-controls.css';

interface PreviewZoomControlsProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  disabled?: boolean;
  /** Button class from the host viewer, so the controls match its toolbar. */
  buttonClassName: string;
}

/** Zoom Out · percentage · Zoom In · Fit. Changes view state only; never refetches. */
export const PreviewZoomControls: React.FC<PreviewZoomControlsProps> = ({ zoom, onZoomChange, disabled, buttonClassName }) => (
  <div className="preview-zoom-controls" role="group" aria-label="Zoom">
    <button
      type="button"
      className={buttonClassName}
      onClick={() => onZoomChange(zoomOut(zoom))}
      disabled={disabled || zoom <= ZOOM_MIN}
      aria-label="Zoom out"
      title="Zoom out"
    >
      <ZoomOut size={16} aria-hidden="true" />
    </button>
    <output className="preview-zoom-level" aria-live="polite" aria-label={`Zoom ${zoomPercent(zoom)}`}>
      {zoomPercent(zoom)}
    </output>
    <button
      type="button"
      className={buttonClassName}
      onClick={() => onZoomChange(zoomIn(zoom))}
      disabled={disabled || zoom >= ZOOM_MAX}
      aria-label="Zoom in"
      title="Zoom in"
    >
      <ZoomIn size={16} aria-hidden="true" />
    </button>
    <button
      type="button"
      className={buttonClassName}
      onClick={() => onZoomChange(1)}
      disabled={disabled || zoom === 1}
      aria-label="Fit to view"
      title="Fit to view"
    >
      <Maximize2 size={16} aria-hidden="true" />
    </button>
  </div>
);
