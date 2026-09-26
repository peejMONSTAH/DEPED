import { useEffect } from 'react';

/** Matches the server's web idle limit (backend config.session.webIdleMinutes). */
export const WEB_IDLE_MINUTES = 30;
const LAST_ACTIVITY_KEY = 'lastActivityAt';
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

/**
 * Signs the user out after WEB_IDLE_MINUTES without input, the rule for
 * shared school computers. Activity in any open tab counts for all of them
 * (the timestamp lives in localStorage), so reading in one tab does not end
 * the session in another.
 */
export const useIdleSignOut = (active: boolean, onIdle: () => void) => {
  useEffect(() => {
    if (!active) return;
    const touch = () => {
      try { localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now())); } catch { /* storage unavailable */ }
    };
    let lastWrite = 0;
    // Writes at most every 15 s; the check below runs every 30 s.
    const onActivity = () => {
      if (Date.now() - lastWrite > 15_000) { lastWrite = Date.now(); touch(); }
    };
    touch();
    EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }));
    const timer = window.setInterval(() => {
      let last = Date.now();
      try { last = Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || Date.now(); } catch { /* keep now */ }
      if (Date.now() - last > WEB_IDLE_MINUTES * 60_000) onIdle();
    }, 30_000);
    return () => {
      EVENTS.forEach(e => window.removeEventListener(e, onActivity));
      window.clearInterval(timer);
    };
  }, [active, onIdle]);
};
