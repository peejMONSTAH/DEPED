import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import './row-action-menu.css';

export interface RowAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'danger';
  onSelect: () => void;
}

interface RowActionMenuProps {
  /** Accessible name, e.g. "Actions for Juan Dela Cruz". */
  label: string;
  actions: RowAction[];
}

/**
 * Compact per-row action menu. Rendered in a portal with fixed positioning so
 * a scrolling table container cannot clip it. Escape, Tab and outside clicks
 * close it; arrow keys move between items; focus returns to the trigger.
 */
export const RowActionMenu: React.FC<RowActionMenuProps> = ({ label, actions }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 220;
    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    const menuHeight = menuRef.current?.offsetHeight || actions.length * 44 + 12;
    const below = rect.bottom + 6;
    const top = below + menuHeight > window.innerHeight - 8 ? Math.max(8, rect.top - menuHeight - 6) : below;
    setPosition({ top, left });
  }, [open, actions.length]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    const onScroll = () => close(false);
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'Tab') close(false);
    else if (event.key === 'ArrowDown') { event.preventDefault(); items[(index + 1) % items.length]?.focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus(); }
    else if (event.key === 'Home') { event.preventDefault(); items[0]?.focus(); }
    else if (event.key === 'End') { event.preventDefault(); items[items.length - 1]?.focus(); }
  };

  if (actions.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="row-action-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={event => { event.stopPropagation(); setOpen(value => !value); }}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
        <span>Actions</span>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="row-action-menu"
          style={position ? { top: position.top, left: position.left } : { visibility: 'hidden' }}
          onKeyDown={onMenuKeyDown}
        >
          {actions.map(action => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              className={`row-action-item ${action.tone === 'danger' ? 'is-danger' : ''}`}
              onClick={event => {
                event.stopPropagation();
                close(false);
                action.onSelect();
              }}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
};
