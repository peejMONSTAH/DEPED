import type { KeyboardEvent } from 'react';

/**
 * Keyboard activation for elements that are clickable but cannot be a <button> —
 * table rows, cards that already contain their own buttons, list items.
 *
 * The target check matters: these elements usually wrap real controls, and a
 * space press on an inner button must not also fire the wrapper's action.
 */
export const activateOnKey =
  <T extends HTMLElement>(onActivate: () => void) =>
  (event: KeyboardEvent<T>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    onActivate();
  };

/**
 * Props for a div/span that behaves as a button. Prefer a real <button>; use
 * this only where the element must stay a div for layout or table semantics.
 */
export const clickable = <T extends HTMLElement>(onActivate: () => void, label?: string) => ({
  role: 'button' as const,
  tabIndex: 0,
  onClick: onActivate,
  onKeyDown: activateOnKey<T>(onActivate),
  ...(label ? { 'aria-label': label } : {}),
});

/**
 * Keyboard access for a clickable table row. Rows keep their row semantics —
 * overriding them with role="button" would break the table for screen readers —
 * so they get focus and key handling only.
 */
export const clickableRow = (onActivate: () => void, label?: string) => ({
  tabIndex: 0,
  onClick: onActivate,
  onKeyDown: activateOnKey<HTMLTableRowElement>(onActivate),
  ...(label ? { 'aria-label': label } : {}),
});
