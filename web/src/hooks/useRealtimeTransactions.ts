import { useEffect, useRef } from 'react';

/**
 * Custom React hook for real-time transaction updates using SSE (Server-Sent Events)
 * + Tab Focus listener + 5-second polling fallback.
 */
export const useRealtimeTransactions = (onUpdate: (data?: any) => void, intervalMs: number = 30000) => {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    // Initial fetch
    callbackRef.current();

    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;
    let isDisposed = false;
    let sseConnected = false;

    const connectSSE = () => {
      if (isDisposed) return;
      try {
        const token = localStorage.getItem('accessToken');
        if (!token) return;
        const url = `/api/v1/transactions/stream?token=${encodeURIComponent(token)}`;
        eventSource = new EventSource(url);
        eventSource.onopen = () => { sseConnected = true; };

        eventSource.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type !== 'CONNECTED') {
              callbackRef.current(payload);
            }
          } catch {
            callbackRef.current();
          }
        };

        eventSource.onerror = () => {
          if (eventSource) {
            sseConnected = false;
            eventSource.close();
            eventSource = null;
          }
          if (!isDisposed) {
            reconnectTimeout = setTimeout(connectSSE, 3500);
          }
        };
      } catch {
        // Fall back to fast polling
      }
    };

    connectSSE();

    // Responsive polling fallback ensuring real-time UI synchronization
    const timer = setInterval(() => {
      if (!sseConnected && document.visibilityState === 'visible') {
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
      isDisposed = true;
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      clearInterval(timer);
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intervalMs]);
};
