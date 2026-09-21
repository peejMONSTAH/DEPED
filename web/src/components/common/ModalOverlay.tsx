import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const openDialogs: HTMLDivElement[] = [];
let previousOverflow = '';
const focusable = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';

interface ModalOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Called when the user presses Escape on the topmost dialog. */
  onDismiss?: () => void;
}

/** Shared viewport placement for every modal, independent of page animation. */
export const ModalOverlay: React.FC<ModalOverlayProps> = ({ children, className = 'modal-overlay', onDismiss, ...props }) => {
  const ref = useRef<HTMLDivElement>(null);
  // Read through a ref so the listener is installed once but always calls the latest handler.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (!openDialogs.length) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openDialogs.push(dialog);
    const heading = dialog.querySelector('h1, h2, h3, [role="heading"]');
    if (!dialog.hasAttribute('aria-label')) dialog.setAttribute('aria-label', heading?.textContent || 'Dialog');
    // Child effects run before this one, so a child's own autoFocus would be undone here.
    // Honour an explicit [data-autofocus] target instead of always grabbing the dialog.
    const preferred = dialog.querySelector<HTMLElement>('[data-autofocus]');
    (preferred || dialog).focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== dialog) return;
      if (event.key === 'Escape') {
        // Only the topmost dialog closes, so stacked modals unwind one at a time.
        if (!dismissRef.current) return;
        event.stopPropagation();
        dismissRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(focusable)).filter(el => el.getClientRects().length > 0);
      if (!controls.length) { event.preventDefault(); dialog.focus(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
    };
    const keepFocus = (event: FocusEvent) => {
      if (openDialogs[openDialogs.length - 1] === dialog && event.target instanceof Node && !dialog.contains(event.target)) dialog.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', keepFocus);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', keepFocus);
      const index = openDialogs.indexOf(dialog);
      if (index >= 0) openDialogs.splice(index, 1);
      if (!openDialogs.length) document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<div {...props} ref={ref} role="dialog" aria-modal="true" tabIndex={-1} className={className}>{children}</div>, document.body);
};
