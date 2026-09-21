import React from 'react';

/**
 * Inline validation message for a single field. Renders nothing when the field is
 * valid, so it can sit unconditionally under any input.
 *
 * `role="alert"` so screen readers announce the problem when it appears.
 */
export const FieldError: React.FC<{ message?: string; id?: string }> = ({ message, id }) => {
  if (!message) return null;
  return (
    <span
      id={id}
      role="alert"
      style={{
        display: 'block',
        marginTop: 4,
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--color-error)',
      }}
    >
      {message}
    </span>
  );
};
