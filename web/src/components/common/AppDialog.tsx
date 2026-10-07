import React from 'react';
import { X } from 'lucide-react';
import { ModalOverlay } from './ModalOverlay';
import './app-dialog.css';

interface AppDialogProps {
  title: React.ReactNode;
  /** Small label above the title, e.g. "Open item". */
  kicker?: React.ReactNode;
  /** Status pill beside the kicker. */
  badge?: React.ReactNode;
  badgeTone?: 'ok' | 'warn' | 'bad' | 'muted';
  onClose: () => void;
  /** Footer actions: secondary first, primary last (right-most). */
  footer?: React.ReactNode;
  /**
   * Show the header ✕. Leave it off when the footer already has Close/Cancel:
   * one dismiss control per dialog.
   */
  closeButton?: boolean;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

/**
 * The one dialog layout for the system: solid card, header (kicker, title, optional ✕), scrolling
 * body, footer with actions on the right. Escape and focus trapping come from ModalOverlay.
 */
export const AppDialog: React.FC<AppDialogProps> = ({ title, kicker, badge, badgeTone = 'muted', onClose, footer, closeButton = !footer, size = 'md', children }) => {
  const titleId = React.useId();
  return (
    <ModalOverlay onDismiss={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className={`app-dialog app-dialog--${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="app-dialog__head">
          <div className="app-dialog__titles">
            {(kicker || badge) && (
              <div className="app-dialog__kicker-row">
                {kicker && <span className="app-dialog__kicker">{kicker}</span>}
                {badge && <span className={`app-dialog__badge is-${badgeTone}`}>{badge}</span>}
              </div>
            )}
            <h2 id={titleId}>{title}</h2>
          </div>
          {closeButton && (
            <button type="button" className="app-dialog__x" onClick={onClose} aria-label="Close"><X size={22} aria-hidden="true" /></button>
          )}
        </header>
        <div className="app-dialog__body">{children}</div>
        {footer && <footer className="app-dialog__foot">{footer}</footer>}
      </section>
    </ModalOverlay>
  );
};

/** Label / value pairs inside a dialog. */
export const DialogFacts: React.FC<{ items: [React.ReactNode, React.ReactNode][] }> = ({ items }) => (
  <dl className="app-dialog__facts">
    {items.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}
  </dl>
);
