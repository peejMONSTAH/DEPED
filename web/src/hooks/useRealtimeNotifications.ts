import { useEffect, useRef } from 'react';
import { playSuccessChime } from '../utils/sound.utils';

/**
 * Custom React hook for real-time notification updates using SSE (Server-Sent Events)
 * + Tab Focus listener + 5-second polling fallback.
 */
export const useRealtimeNotifications = (onUpdate: () => void, intervalMs: number = 3000) => {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    // Initial fetch
    callbackRef.current();

    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;
    let isDisposed = false;

    const connectSSE = () => {
      if (isDisposed) return;
      try {
        const token = localStorage.getItem('accessToken') || '';
        const url = token ? `/api/v1/notifications/stream?token=${encodeURIComponent(token)}` : '/api/v1/notifications/stream';
        eventSource = new EventSource(url);

        eventSource.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'NOTIFICATION') {
              playSuccessChime();
              callbackRef.current();
            }
          } catch {
            callbackRef.current();
          }
        };

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (!isDisposed) {
            reconnectTimeout = setTimeout(connectSSE, 3500);
          }
        };
      } catch {
        // Fallback to polling
      }
    };

    connectSSE();

    // Polling timer
    const timer = setInterval(() => {
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
      isDisposed = true;
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      clearInterval(timer);
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intervalMs]);
};
