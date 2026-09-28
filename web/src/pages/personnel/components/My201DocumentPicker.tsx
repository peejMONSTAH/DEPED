import React, { useState, useMemo } from 'react';
import { AppIcon } from '../../../components/common/AppIcon';
import { ModalPortal } from '../../../components/common/ModalPortal';
import { ModalOverlay } from '../../../components/common/ModalOverlay';
import { PersonnelDocumentRecord } from '../../../models/documentStatus';
import { formatSize, formatDate } from '../MyDocuments';

interface My201DocumentPickerProps {
  pickingCode: string | null;
  targetTitle?: string;
  suggestedTypes?: string[];
  documents: PersonnelDocumentRecord[];
  onSelect: (doc: PersonnelDocumentRecord) => void;
  onClose: () => void;
}

export const My201DocumentPicker: React.FC<My201DocumentPickerProps> = ({
  pickingCode,
  targetTitle,
  suggestedTypes = [],
  documents,
  onSelect,
  onClose,
}) => {
  const [search, setSearch] = useState('');

  // 1. Exclude empty placeholders (only documents that actually have an uploaded file)
  const validDocs = useMemo(() => {
    return (documents || []).filter((d: any) =>
      Boolean(d.hasFile && (d.fileUrl || d.storagePath || d.storedFileName || d.originalFileName))
    );
  }, [documents]);

  // 2. Filter by search query
  const searchedDocs = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return validDocs;
    return validDocs.filter((d: any) =>
      (d.documentTypeName && d.documentTypeName.toLowerCase().includes(query)) ||
      (d.originalFileName && d.originalFileName.toLowerCase().includes(query)) ||
      (d.customDocumentName && d.customDocumentName.toLowerCase().includes(query))
    );
  }, [validDocs, search]);

  // 3. Sort prioritized (compatible / recommended types first)
  const sortedDocs = useMemo(() => {
    return [...searchedDocs].sort((a: any, b: any) => {
      const aMatch = suggestedTypes.includes(a.documentTypeId);
      const bMatch = suggestedTypes.includes(b.documentTypeId);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return (b.id || 0) - (a.id || 0);
    });
  }, [searchedDocs, suggestedTypes]);

  if (!pickingCode) return null;

  return (
    <ModalPortal>
      <ModalOverlay
        onDismiss={onClose}
        className="modal-overlay"
        style={{
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(6px)',
          zIndex: 1300,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="picker-201-title"
          style={{
            width: '100%',
            maxWidth: 620,
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--color-bg-card, #ffffff)',
            borderRadius: 14,
            border: '1px solid var(--color-border)',
            boxShadow: '0 20px 48px rgba(0,0,0,0.3)',
            overflow: 'hidden',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--color-border)',
              background: 'var(--color-bg-secondary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div>
              <h4 id="picker-201-title" style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>
                Select 201 File for Item ({pickingCode.toUpperCase()})
              </h4>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                {targetTitle ? `Requirement: ${targetTitle}` : 'Attach an existing file from your digital 201 profile records.'}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              style={{
                width: 44,
                height: 44,
                minWidth: 44,
                minHeight: 44,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 20,
                color: 'var(--color-text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
              }}
            >
              ✕
            </button>
          </div>

          {/* Search Filter Input */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-card)' }}>
            <input
              type="search"
              className="form-control"
              placeholder="Search documents by name or filename…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ fontSize: '0.85rem', width: '100%', padding: '8px 12px', borderRadius: 8 }}
            />
          </div>

          {/* Document List */}
          <div
            style={{
              padding: '16px 20px',
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              background: 'var(--color-bg-card, #ffffff)',
            }}
          >
            {sortedDocs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--color-text-muted)' }}>
                <AppIcon name="folder" size={32} />
                <p style={{ marginTop: 10, fontSize: '0.85rem', fontWeight: 600 }}>
                  {validDocs.length === 0
                    ? 'No uploaded files found in your digital 201 records.'
                    : 'No 201 files match your search.'}
                </p>
                <span style={{ fontSize: '0.8125rem' }}>
                  {validDocs.length === 0
                    ? 'Please use the "Upload File" option in the checklist or upload documents in My 201 Files first.'
                    : 'Try adjusting your search query to find your document.'}
                </span>
              </div>
            ) : (
              sortedDocs.map((doc: any) => {
                const isRecommended = suggestedTypes.includes(doc.documentTypeId);
                const isDocExpired = Boolean(
                  doc.expirationDate && new Date(doc.expirationDate) < new Date(new Date().toDateString())
                );

                return (
                  <div
                    key={doc.id}
                    onClick={() => {
                      if (!isDocExpired) onSelect(doc);
                    }}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: isRecommended ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: isRecommended ? 'rgba(2, 132, 199, 0.03)' : 'var(--color-bg-secondary)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      cursor: isDocExpired ? 'not-allowed' : 'pointer',
                      opacity: isDocExpired ? 0.6 : 1,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                          {doc.documentTypeName || '201 File'}
                        </span>
                        {isRecommended && (
                          <span
                            style={{
                              fontSize: '0.6875rem',
                              fontWeight: 800,
                              background: 'rgba(2, 132, 199, 0.12)',
                              color: 'var(--color-primary)',
                              padding: '1px 6px',
                              borderRadius: 4,
                            }}
                          >
                            RECOMMENDED
                          </span>
                        )}
                        {isDocExpired && (
                          <span
                            style={{
                              fontSize: '0.6875rem',
                              fontWeight: 800,
                              background: 'rgba(239, 68, 68, 0.12)',
                              color: '#dc2626',
                              padding: '1px 6px',
                              borderRadius: 4,
                            }}
                          >
                            EXPIRED
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {doc.originalFileName || 'Uploaded file'} ({formatSize(doc.fileSize)})
                        {doc.issueDate && ` · Issued: ${formatDate(doc.issueDate)}`}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isDocExpired}
                      className="btn btn-primary btn-sm"
                      style={{ flexShrink: 0, fontWeight: 700, fontSize: '0.75rem' }}
                    >
                      Attach File
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </ModalOverlay>
    </ModalPortal>
  );
};
