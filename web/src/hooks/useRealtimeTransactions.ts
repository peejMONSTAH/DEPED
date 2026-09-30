import { useEffect, useRef } from 'react';
import { subscribeStream } from '../api/sharedStream';

/**
 * Custom React hook for real-time transaction updates using SSE (Server-Sent Events)
 * + tab focus refresh and periodic reconciliation across API instances.
 * All hooks on a page share one stream connection (see api/sharedStream).
 */
export const useRealtimeTransactions = (onUpdate: (data?: any) => void, intervalMs: number = 30000) => {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    // Initial fetch
    callbackRef.current();

    const unsubscribe = subscribeStream('/transactions/stream', event => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type !== 'CONNECTED') {
          callbackRef.current(payload);
        }
      } catch {
        callbackRef.current();
      }
    });

    // Responsive polling fallback ensuring real-time UI synchronization
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        callbackRef.current();
      }
    }, intervalMs);

    // Window focus / tab visibility listener
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        callbackRef.current();
      }
    };

    window.addEventListener('focus', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intervalMs]);
};
