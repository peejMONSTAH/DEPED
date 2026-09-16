import React from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: React.ReactNode;
}

/**
 * Keeps viewport-level dialogs outside scrolling or animated layout containers.
 * Those containers can otherwise clip `position: fixed` overlays at browser zoom.
 */
export const ModalPortal: React.FC<ModalPortalProps> = ({ children }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};
