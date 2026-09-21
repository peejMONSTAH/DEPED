import { useCallback, useRef, useState } from 'react';

/**
 * Guards an async action against double submission.
 *
 * Several submit buttons had no in-flight state, so a double click sent the request
 * twice — which on approval and credential endpoints means doing the action twice.
 * The ref makes the guard effective immediately; React state only drives the UI.
 */
export const usePending = () => {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(async <T>(action: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setPending(true);
    try {
      return await action();
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);

  return { pending, run };
};
