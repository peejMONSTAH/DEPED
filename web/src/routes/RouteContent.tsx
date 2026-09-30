import React, { Component, Suspense } from 'react';
import { useLocation } from 'react-router-dom';

export const RouteLoading: React.FC<{ label?: string }> = ({ label = 'Loading page…' }) => (
  <div role="status" aria-live="polite" style={{ padding: 24 }}>
    {label}
  </div>
);

export const isPageDownloadError = (error: unknown): boolean =>
  error instanceof Error && /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading (?:CSS )?chunk|Unable to preload CSS/i.test(error.message);

type Props = { children: React.ReactNode; resetKey: string };
type State = { error: Error | null; resetKey: string };

/** A failed page must not unmount navigation or the authenticated session. */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error) { return { error }; }

  static getDerivedStateFromProps(props: Props, state: State) {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Page failed to open', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const downloadFailed = isPageDownloadError(error);
    return (
      <section role="alert" className="card" style={{ padding: 24, margin: 16 }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: 12 }}>This page could not open</h1>
        <p>{downloadFailed
          ? 'A page file could not be downloaded. The app may have been updated, or your connection was interrupted.'
          : 'Something went wrong while displaying this page. You can try again or use the navigation to open another page.'}</p>
        <p>Reloading keeps you signed in, but any unsaved changes on this screen will be lost.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
          {!downloadFailed && <button type="button" className="btn btn-primary" onClick={() => this.setState({ error: null })}>Try again</button>}
          {/* A rejected React.lazy import is cached. Reload only on an explicit click;
              no timers or automatic reloads can loop or discard a form silently. */}
          <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      </section>
    );
  }
}

/** Place inside each layout so a suspended page leaves its shell available. */
export const RouteContent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  return (
    <RouteErrorBoundary resetKey={pathname}>
      <Suspense fallback={<RouteLoading />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
};
