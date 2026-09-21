import { useCallback, useState } from 'react';

export type FieldErrors = Record<string, string>;

/**
 * Per-field validation errors.
 *
 * Validation feedback was toast-only, which tells someone *that* a form is wrong but
 * not *which* field. Toasts also vanish after four seconds, so the message is gone by
 * the time the user looks back at the form.
 *
 * `setFromResponse` understands the API's `"field: message"` 400 body produced by
 * `validateBody` on the server, so a rejected request lands on the right input.
 */
export const useFormErrors = () => {
  const [errors, setErrors] = useState<FieldErrors>({});

  const clear = useCallback(() => setErrors({}), []);
  const clearField = useCallback((field: string) => {
    setErrors(prev => {
      if (!(field in prev)) return prev;
      const { [field]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);
  const setField = useCallback((field: string, message: string) => {
    setErrors(prev => ({ ...prev, [field]: message }));
  }, []);

  /** Validates required fields; returns true when the form may be submitted. */
  const validate = useCallback((rules: Record<string, string | false | null | undefined>) => {
    const next: FieldErrors = {};
    for (const [field, message] of Object.entries(rules)) {
      if (message) next[field] = message;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, []);

  /** Maps a server 400 of the form "field: message" onto that field. */
  const setFromResponse = useCallback((error: unknown): boolean => {
    const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    if (typeof message !== 'string') return false;
    const match = /^([A-Za-z0-9_.[\]]+):\s*(.+)$/.exec(message);
    if (!match) return false;
    setErrors(prev => ({ ...prev, [match[1]]: match[2] }));
    return true;
  }, []);

  return { errors, setErrors, setField, clearField, clear, validate, setFromResponse };
};
