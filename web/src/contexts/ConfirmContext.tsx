import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ModalOverlay } from '../components/common/ModalOverlay';
import { AppIcon } from '../components/common/AppIcon';

export interface ConfirmReasonField {
  label: string;
  placeholder?: string;
  /** When true the confirm button stays disabled until the reason is non-empty. */
  required?: boolean;
}

export interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' for irreversible actions; 'primary' for ordinary confirmations. */
  tone?: 'danger' | 'primary';
  icon?: string;
  /** Renders a textarea whose value is returned with the result. */
  reason?: ConfirmReasonField;
}

export interface ConfirmResult {
  confirmed: boolean;
  reason?: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [reason, setReason] = useState('');
  const resolverRef = useRef<((result: ConfirmResult) => void) | null>(null);

  const settle = useCallback((result: ConfirmResult) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
    setReason('');
  }, []);

  const confirm = useCallback<ConfirmFn>(next => {
    // A second request while one is open cancels the first rather than losing its promise.
    resolverRef.current?.({ confirmed: false });
    setReason('');
    setOptions(next);
    return new Promise<ConfirmResult>(resolve => {
      resolverRef.current = resolve;
    });
  }, []);

  const danger = options?.tone !== 'primary';
  const reasonMissing = Boolean(options?.reason?.required) && !reason.trim();

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <ModalOverlay
          onClick={() => settle({ confirmed: false })}
          onDismiss={() => settle({ confirmed: false })}
        >
          <div className="modal" onClick={event => event.stopPropagation()} style={{ width: '100%', maxWidth: 460, borderRadius: 20, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 22px', borderBottom: '1px solid var(--color-border)' }}>
              <span
                aria-hidden="true"
                style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: danger ? 'var(--color-error-light)' : 'var(--color-primary-light)',
                  color: danger ? 'var(--color-error)' : 'var(--color-primary)',
                }}
              >
                <AppIcon name={options.icon || (danger ? 'warning' : 'check')} size={18} />
              </span>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                {options.title}
              </h3>
            </div>

            <div style={{ padding: '20px 22px' }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
                {options.message}
              </div>

              {options.reason && (
                <label style={{ display: 'block', marginTop: 16 }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--color-text-primary)' }}>
                    {options.reason.label}
                    {options.reason.required && <span style={{ color: 'var(--color-error)' }}> *</span>}
                  </span>
                  <textarea
                    data-autofocus
                    rows={3}
                    value={reason}
                    onChange={event => setReason(event.target.value)}
                    placeholder={options.reason.placeholder}
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 13,
                      borderRadius: 10, border: '1px solid var(--color-border)', resize: 'vertical',
                      background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)',
                      fontFamily: 'inherit',
                    }}
                  />
                </label>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}>
              <button
                type="button"
                onClick={() => settle({ confirmed: false })}
                style={{
                  background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)', borderRadius: 9999,
                  padding: '8px 18px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {options.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                {...(options.reason ? {} : { 'data-autofocus': true })}
                disabled={reasonMissing}
                onClick={() => settle({ confirmed: true, reason: reason.trim() || undefined })}
                style={{
                  background: reasonMissing ? 'var(--color-border)' : (danger ? 'var(--color-error)' : 'var(--color-primary)'),
                  color: reasonMissing ? 'var(--color-text-secondary)' : '#fff',
                  border: 'none', borderRadius: 9999,
                  padding: '8px 20px', fontSize: 12.5, fontWeight: 700,
                  cursor: reasonMissing ? 'not-allowed' : 'pointer',
                }}
              >
                {options.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </ConfirmContext.Provider>
  );
};

/** Returns an async confirm(). Resolves `{ confirmed: false }` on cancel, Escape or backdrop click. */
// eslint-disable-next-line react-refresh/only-export-components
export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
};
