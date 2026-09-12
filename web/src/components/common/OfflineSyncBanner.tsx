import React, { useState, useEffect } from 'react';
import { AppIcon } from './AppIcon';

export const OfflineSyncBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 9999,
      background: 'rgba(234, 179, 8, 0.95)',
      color: '#000000',
      padding: '10px 16px',
      borderRadius: 'var(--radius-lg)',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 13,
      fontWeight: 600,
      animation: 'fadeIn 0.3s ease'
    }}>
      <AppIcon name="warning" size={18} color="#000" />
      <div>
        <span>Offline Mode Active</span>
        <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85 }}>
          Drafts & 201 updates will sync automatically when reconnected.
        </div>
      </div>
    </div>
  );
};
