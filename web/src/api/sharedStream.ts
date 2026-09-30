import { apiUrl, freshAccessToken, streamBackoff } from './client';

type Listener = (event: MessageEvent) => void;
interface Shared {
  source: EventSource | null;
  listeners: Set<Listener>;
  timer: ReturnType<typeof setTimeout> | null;
  failures: number;
  closed: boolean;
}

const streams = new Map<string, Shared>();

async function connect(path: string, shared: Shared) {
  if (shared.closed) return;
  const token = await freshAccessToken();
  if (!token || shared.closed) return; // No session: the pages keep polling instead.
  const source = new EventSource(apiUrl(`${path}?token=${encodeURIComponent(token)}`));
  shared.source = source;
  source.onopen = () => { shared.failures = 0; };
  source.onmessage = event => shared.listeners.forEach(listener => listener(event));
  source.onerror = () => {
    source.close();
    shared.source = null;
    if (shared.closed) return;
    shared.failures += 1;
    shared.timer = setTimeout(() => { void connect(path, shared); }, streamBackoff(shared.failures));
  };
}

/**
 * Listen to a server-sent-event stream. Every listener on the same path shares one
 * connection, which is closed when the last listener leaves. Browsers allow only a few
 * connections per host over HTTP/1.1, so a page with several hooks must not open one each.
 * Returns the unsubscribe function.
 */
export function subscribeStream(path: string, listener: Listener): () => void {
  let shared = streams.get(path);
  if (!shared) {
    shared = { source: null, listeners: new Set(), timer: null, failures: 0, closed: false };
    streams.set(path, shared);
    void connect(path, shared);
  }
  shared.listeners.add(listener);
  const current = shared;
  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size > 0) return;
    current.closed = true;
    current.source?.close();
    if (current.timer) clearTimeout(current.timer);
    if (streams.get(path) === current) streams.delete(path);
  };
}
