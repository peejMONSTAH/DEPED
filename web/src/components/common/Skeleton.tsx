import React from 'react';

interface SkeletonBoxProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
  className?: string;
}

export const SkeletonBox: React.FC<SkeletonBoxProps> = ({
  width = '100%',
  height = '16px',
  borderRadius,
  style,
  className = '',
}) => {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius: borderRadius !== undefined ? borderRadius : undefined,
        ...style,
      }}
    />
  );
};

export const SkeletonText: React.FC<{ width?: string | number; height?: string | number; style?: React.CSSProperties }> = ({
  width = '100%',
  height = '14px',
  style,
}) => {
  return <div className="skeleton-text" style={{ width, height, ...style }} />;
};

export const SkeletonAvatar: React.FC<{ size?: number; style?: React.CSSProperties }> = ({
  size = 40,
  style,
}) => {
  return (
    <div
      className="skeleton-avatar"
      style={{
        width: size,
        height: size,
        minWidth: size,
        ...style,
      }}
    />
  );
};

export const SkeletonStats: React.FC<{ count?: number; columns?: number }> = ({
  count = 4,
  columns = 4,
}) => {
  return (
    <div
      className="compliance-stats-grid"
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        marginBottom: '20px',
      }}
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="skeleton-stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <SkeletonBox width={38} height={38} borderRadius={12} />
            <SkeletonBox width={64} height={20} borderRadius={9999} />
          </div>
          <div>
            <SkeletonBox width="50%" height={32} borderRadius={8} style={{ marginBottom: 8 }} />
            <SkeletonBox width="70%" height={12} borderRadius={4} />
          </div>
        </div>
      ))}
    </div>
  );
};

export const SkeletonList: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="skeleton-card-container">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SkeletonAvatar size={40} />
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <SkeletonBox width={70} height={20} borderRadius={6} />
                  <SkeletonBox width={140} height={18} borderRadius={6} />
                </div>
                <SkeletonBox width={180} height={12} borderRadius={4} />
              </div>
            </div>
            <SkeletonBox width={90} height={24} borderRadius={9999} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            <SkeletonBox height={34} borderRadius={8} />
            <SkeletonBox height={34} borderRadius={8} />
            <SkeletonBox height={34} borderRadius={8} />
            <SkeletonBox height={34} borderRadius={8} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <SkeletonBox width={160} height={12} borderRadius={4} />
            <div style={{ display: 'flex', gap: 8 }}>
              <SkeletonBox width={70} height={28} borderRadius={9999} />
              <SkeletonBox width={100} height={28} borderRadius={9999} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const SkeletonTable: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 5,
  columns = 5,
}) => {
  return (
    <div className="table-wrapper">
      <div style={{ padding: '14px 18px', background: 'var(--glass-bg-subtle)', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 16 }}>
        {Array.from({ length: columns }).map((_, cIdx) => (
          <SkeletonBox key={cIdx} width={`${100 / columns}%`} height={14} borderRadius={4} />
        ))}
      </div>
      <div>
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="skeleton-table-row">
            {Array.from({ length: columns }).map((_, cIdx) => (
              <div key={cIdx} style={{ flex: 1 }}>
                <SkeletonBox
                  width={cIdx === 1 ? '75%' : cIdx === 0 ? '50%' : '60%'}
                  height={14}
                  borderRadius={4}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
