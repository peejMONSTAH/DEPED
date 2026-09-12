import React from 'react';
import { useToast } from '../../contexts/ToastContext';
import { AppIcon } from '../common/AppIcon';

const typeIconName: Record<string, string> = {
  SUCCESS: 'validated',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'under-review',
};

const typeClass: Record<string, string> = {
  SUCCESS: 'toast-success',
  ERROR: 'toast-error',
  WARNING: 'toast-warning',
  INFO: 'toast-info',
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast ${typeClass[toast.type]}`}>
          <AppIcon name={typeIconName[toast.type] || 'info'} size={16} />
          <span style={{ flex: 1 }}>{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '16px', padding: '0 0 0 8px' }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
