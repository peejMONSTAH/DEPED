import { useEffect, useRef } from 'react';
import { playSuccessChime } from '../utils/sound.utils';
import { subscribeStream } from '../api/sharedStream';

/**
 * Custom React hook for real-time notification updates using SSE (Server-Sent Events)
 * + tab focus refresh and periodic reconciliation across API instances.
 * All hooks on a page share one stream connection (see api/sharedStream).
 */
export const useRealtimeNotifications = (onUpdate: () => void, intervalMs: number = 30000) => {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    // Initial fetch
    callbackRef.current();

    const unsubscribe = subscribeStream('/notifications/stream', event => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'NOTIFICATION') {
          playSuccessChime();
          callbackRef.current();
        }
      } catch {
        callbackRef.current();
      }
    });

    // Polling timer
    const timer = setInterval(() => {
      // Poll even while connected: events are currently local to each API instance.
      if (document.visibilityState === 'visible') {
        callbackRef.current();
      }
    }, intervalMs);

    // Focus listener
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
