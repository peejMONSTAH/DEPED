import React from 'react';
import { Link } from 'react-router-dom';
import { AppIcon } from '../../../components/common/AppIcon';

interface PersonnelOverviewProps {
  user: any;
  personnel: any;
  onOpenScanner?: () => void;
}

export const PersonnelOverview: React.FC<PersonnelOverviewProps> = ({
  user,
  personnel,
  onOpenScanner,
}) => {
  const firstName = personnel?.firstName || user?.firstName || 'DepEd';
  const lastName = personnel?.lastName || user?.lastName || 'Personnel';
  const fullName = `${firstName} ${lastName}`.trim();
  const designation = personnel?.designation || personnel?.plantillaItem?.positionTitle || user?.designation || 'Teaching Personnel';
  const employeeId = personnel?.employeeId || 'Not recorded';
  const stationName = personnel?.school || personnel?.station || user?.school || 'Division of General Santos City';

  return (
    <div
      className="card mb-4"
      style={{
        borderRadius: 16,
        padding: '24px 28px',
        background: 'linear-gradient(135deg, var(--color-primary) 0%, #1e3a8a 100%)',
        color: '#fff',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
        {/* Profile Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 0, flex: '1 1 320px' }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.2)',
              border: '2px solid rgba(255, 255, 255, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {firstName[0]}
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.8125rem', opacity: 0.9, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
              DepEd Personnel Portal
            </div>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 800, margin: '2px 0 4px 0', lineHeight: 1.2 }}>
              Welcome, {fullName}
            </h1>
            <div style={{ fontSize: '0.875rem', opacity: 0.92, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>Position: <strong>{designation}</strong></span>
              <span>·</span>
              <span>Employee No: <strong className="font-mono">{employeeId}</strong></span>
              <span>·</span>
              <span>Station: <strong>{stationName}</strong></span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onOpenScanner}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 700,
              background: 'rgba(255, 255, 255, 0.15)',
              borderColor: 'rgba(255, 255, 255, 0.3)',
              color: '#fff',
            }}
          >
            <AppIcon name="camera" size={14} color="#fff" /> Scan with Camera
          </button>
          <Link
            to="/personnel/documents"
            className="btn btn-primary btn-sm"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 700,
              background: '#fff',
              borderColor: '#fff',
              color: 'var(--color-primary)',
              textDecoration: 'none',
            }}
          >
            <AppIcon name="folder" size={14} color="var(--color-primary)" /> My 201 Files
          </Link>
        </div>
      </div>
    </div>
  );
};
