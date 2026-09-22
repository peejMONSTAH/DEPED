import { useEffect, useRef } from 'react';
import { playSuccessChime } from '../utils/sound.utils';
import { apiUrl } from '../api/client';

/**
 * Custom React hook for real-time notification updates using SSE (Server-Sent Events)
 * + tab focus refresh and periodic reconciliation across API instances.
 */
export const useRealtimeNotifications = (onUpdate: () => void, intervalMs: number = 30000) => {
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
        if (!token) return;
        const url = apiUrl(`/notifications/stream?token=${encodeURIComponent(token)}`);
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
      isDisposed = true;
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      clearInterval(timer);
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intervalMs]);
};
