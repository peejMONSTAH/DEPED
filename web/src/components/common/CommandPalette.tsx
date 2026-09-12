import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from './AppIcon';
import { useAuthContext } from '../../contexts/AuthContext';
import { useTheme, type AppTheme } from '../../contexts/ThemeContext';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CommandItem {
  id: string;
  title: string;
  category: 'Navigation' | '201 Personnel' | 'Transactions' | 'Settings';
  icon: string;
  path?: string;
  action?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { setTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const userRole = user?.role || 'SYSTEM_ADMIN';
  const isAdmin = userRole === 'SYSTEM_ADMIN' || userRole === 'AO_II' || userRole === 'HRMO';

  const commands: CommandItem[] = [
    // Navigation items
    ...(isAdmin ? [
      { id: 'nav-dashboard', title: 'Admin Dashboard', category: 'Navigation' as const, icon: 'dashboard', path: '/admin/dashboard' },
      { id: 'nav-notifications', title: 'Notifications Center', category: 'Navigation' as const, icon: 'notifications', path: '/admin/notifications' },
      { id: 'nav-personnel', title: 'Personnel Directory', category: 'Navigation' as const, icon: 'personnel', path: '/admin/personnel' },
      { id: 'nav-transactions', title: 'Transaction Queue', category: 'Navigation' as const, icon: 'transactions', path: '/admin/transactions' },
      { id: 'nav-approvals', title: 'HRMO Approvals', category: 'Navigation' as const, icon: 'approvals', path: '/admin/approvals' },
      { id: 'nav-documents', title: 'AO II Document Validation', category: 'Navigation' as const, icon: 'validation', path: '/admin/documents' },
      { id: 'nav-credentials', title: 'Credential Distribution', category: 'Navigation' as const, icon: 'credentials', path: '/admin/credentials' },
      { id: 'nav-promotions', title: 'Promotions Management', category: 'Navigation' as const, icon: 'promotions', path: '/admin/promotions' },
      { id: 'nav-reports', title: 'HR Analytics & Reports', category: 'Navigation' as const, icon: 'reports', path: '/admin/reports' },
      { id: 'nav-audit', title: 'Audit Trail Logs', category: 'Navigation' as const, icon: 'audit', path: '/admin/audit' },
      { id: 'nav-settings', title: 'Settings & Roles', category: 'Navigation' as const, icon: 'settings', path: '/admin/settings' },
    ] : [
      { id: 'nav-home', title: 'Personnel Home', category: 'Navigation' as const, icon: 'home', path: '/personnel/home' },
      { id: 'nav-my-transactions', title: 'My Submissions', category: 'Navigation' as const, icon: 'transactions', path: '/personnel/transactions' },
      { id: 'nav-new-app', title: 'New Application Submission', category: 'Navigation' as const, icon: 'new-transaction', path: '/personnel/new-transaction' },
      { id: 'nav-my-profile', title: 'My 201 File Record', category: 'Navigation' as const, icon: 'profile', path: '/personnel/profile' },
      { id: 'nav-my-notifs', title: 'My Notifications', category: 'Navigation' as const, icon: 'notifications', path: '/personnel/notifications' },
    ]),

    // System Settings & Actions

    // Theme Actions
    { id: 'theme-dark', title: 'Switch to Dark Theme', category: 'Settings', icon: 'settings', action: () => setTheme('dark') },
    { id: 'theme-light', title: 'Switch to Light Theme', category: 'Settings', icon: 'settings', action: () => setTheme('light') },
  ];

  const filtered = commands.filter(cmd =>
    cmd.title.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (item: CommandItem) => {
    onClose();
    if (item.action) {
      item.action();
    } else if (item.path) {
      navigate(item.path);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filtered.length) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000 }}>
      <div
        className="modal animate-scale-in"
        style={{
          maxWidth: 600,
          width: '92vw',
          borderRadius: 'var(--radius-xl)',
          padding: 0,
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search Bar Input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 20px',
          borderBottom: '1px solid var(--glass-border-subtle)',
          background: 'var(--glass-bg-subtle)'
        }}>
          <AppIcon name="search" size={20} color="var(--color-primary)" />
          <input
            ref={inputRef}
            type="text"
            className="form-input"
            placeholder="Type a command or search 201 records..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              fontSize: 16,
              outline: 'none',
              boxShadow: 'none',
              padding: 0
            }}
          />
          <kbd style={{
            background: 'var(--color-bg-hover)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: 11,
            color: 'var(--color-text-muted)'
          }}>
            ESC
          </kbd>
        </div>

        {/* Command Items List */}
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: '8px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 14 }}>
              No matching commands or 201 HRIS records found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--color-primary-100, rgba(0, 123, 255, 0.15))' : 'transparent',
                    color: isSelected ? 'var(--color-primary-light, #38bdf8)' : 'var(--color-text-primary)',
                    transition: 'background 0.15s ease'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <AppIcon name={item.icon} size={16} color={isSelected ? 'var(--color-primary)' : 'var(--color-text-muted)'} />
                    <span style={{ fontSize: 14, fontWeight: isSelected ? 600 : 400 }}>
                      {item.title}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'var(--color-bg-hover)',
                    color: 'var(--color-text-muted)'
                  }}>
                    {item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div style={{
          padding: '10px 16px',
          background: 'var(--glass-bg-subtle)',
          borderTop: '1px solid var(--glass-border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--color-text-muted)'
        }}>
          <div className="flex items-center gap-3">
            <span><kbd style={{ background: 'var(--color-bg-hover)', padding: '1px 4px', borderRadius: 3 }}>↑↓</kbd> Navigate</span>
            <span><kbd style={{ background: 'var(--color-bg-hover)', padding: '1px 4px', borderRadius: 3 }}>↵</kbd> Select</span>
          </div>
          <div>Eminence HRIS Quick Actions</div>
        </div>
      </div>
    </div>
  );
};
