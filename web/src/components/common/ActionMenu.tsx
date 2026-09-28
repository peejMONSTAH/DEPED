import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppIcon } from './AppIcon';
import './row-action-menu.css';

export interface ActionMenuItem {
  id: string;
  label: string;
  icon?: string | React.ReactNode;
  tone?: 'default' | 'danger' | 'warning' | 'primary';
  disabled?: boolean;
  onSelect: () => void;
}

export interface ActionMenuProps {
  label: string;
  items: ActionMenuItem[];
  align?: 'left' | 'right';
  triggerIcon?: string;
  size?: 'sm' | 'md';
}

export const ActionMenu: React.FC<ActionMenuProps> = ({
  label,
  items,
  align = 'right',
  triggerIcon = 'more-horizontal',
  size = 'sm',
}) => {
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
    let left = align === 'right' ? rect.right - menuWidth : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));

    const menuHeight = menuRef.current?.offsetHeight || items.length * 40 + 12;
    const below = rect.bottom + 6;
    const top = below + menuHeight > window.innerHeight - 8 ? Math.max(8, rect.top - menuHeight - 6) : below;
    setPosition({ top, left });
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
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
    const activeElements = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || []
    );
    const index = activeElements.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      close(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeElements[(index + 1) % activeElements.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeElements[(index - 1 + activeElements.length) % activeElements.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      activeElements[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      activeElements[activeElements.length - 1]?.focus();
    }
  };

  const visibleItems = items.filter(Boolean);
  if (visibleItems.length === 0) return null;

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
        onClick={event => {
          event.stopPropagation();
          setOpen(prev => !prev);
        }}
        style={{
          width: size === 'sm' ? 32 : 36,
          height: size === 'sm' ? 32 : 36,
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg-card)',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
        }}
      >
        <AppIcon name={triggerIcon as any} size={16} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            className="row-action-popover"
            style={{
              position: 'fixed',
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              zIndex: 9999,
              minWidth: 200,
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              padding: 6,
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            }}
            onKeyDown={onMenuKeyDown}
          >
            {visibleItems.map(item => {
              const isDanger = item.tone === 'danger';
              const isWarning = item.tone === 'warning';
              const fgColor = item.disabled
                ? 'var(--color-text-muted)'
                : isDanger
                ? '#dc2626'
                : isWarning
                ? '#d97706'
                : 'var(--color-text-primary)';

              return (
                <button
                  key={item.id}
                  role="menuitem"
                  type="button"
                  disabled={item.disabled}
                  onClick={e => {
                    e.stopPropagation();
                    close();
                    item.onSelect();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'transparent',
                    color: fgColor,
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    textAlign: 'left',
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                    opacity: item.disabled ? 0.5 : 1,
                  }}
                >
                  {typeof item.icon === 'string' ? (
                    <AppIcon name={item.icon as any} size={15} color={fgColor} />
                  ) : (
                    item.icon
                  )}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
};
