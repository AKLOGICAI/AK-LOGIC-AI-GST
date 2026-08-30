import { Component, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props { children: ReactNode }
interface State { hasError: boolean; isChunkError: boolean; message: string }

/**
 * App-wide error boundary.
 *
 * Two jobs:
 *  1. Never let a render/runtime error leave the user on a black screen.
 *  2. Recover gracefully from "failed to fetch dynamically imported module"
 *     errors. These happen when a returning visitor still has an old
 *     index.html that references code-split chunks whose hashed filenames
 *     changed in a new deployment. The fix is a one-time hard reload so the
 *     browser fetches the fresh index.html + chunks.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, isChunkError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    const msg = error instanceof Error ? error.message : String(error);
    const isChunkError = /dynamically imported module|Loading chunk|Importing a module script failed|Failed to fetch/i.test(msg);
    return { hasError: true, isChunkError, message: msg };
  }

  componentDidCatch(error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    // Auto-recover from stale-chunk errors exactly once per session.
    if (/dynamically imported module|Loading chunk|Importing a module script failed|Failed to fetch/i.test(msg)) {
      const KEY = 'aklogic_chunk_reloaded';
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, '1');
        window.location.reload();
      }
    }
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error);
  }

  /** Try again on the SAME route — reloads current URL, so the user stays
   *  where they were (e.g. mid-registration) instead of starting over. */
  private retryHere = () => {
    sessionStorage.removeItem('aklogic_chunk_reloaded');
    window.location.reload();
  };

  private goHome = () => {
    sessionStorage.removeItem('aklogic_chunk_reloaded');
    window.location.assign('/');
  };

  /** Friendly, specific message based on what failed. */
  private friendlyMessage(): { title: string; body: string } {
    const m = this.state.message || '';
    if (this.state.isChunkError) {
      return { title: 'Updating to the latest version…', body: 'A new version of the app is available. Reloading now.' };
    }
    if (/quota|storage/i.test(m)) {
      return { title: 'Storage is full', body: 'Your browser storage is full. Clear some space or remove old data, then try again.' };
    }
    if (/network|fetch|connection/i.test(m)) {
      return { title: 'Connection problem', body: 'We couldn’t reach the server. Check your internet connection and try again.' };
    }
    if (/decrypt|cipher|JSON|parse/i.test(m)) {
      return { title: 'Couldn’t read saved data', body: 'A saved record looked corrupted. Try again — your other data is safe.' };
    }
    return { title: 'Something didn’t load correctly', body: 'A small hiccup occurred. Tapping “Try Again” usually fixes it — you’ll stay right where you were.' };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const { title, body } = this.friendlyMessage();
    const onThisRoute = typeof window !== 'undefined' && window.location.pathname !== '/';

    return (
      <div className="min-h-screen bg-[var(--color-ink)] text-[var(--color-ivory)] grid place-items-center px-6 grid-bg">
        <div className="depth-card rounded-[28px] p-8 sm:p-10 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-2xl grid place-items-center mx-auto mb-5" style={{ background: this.state.isChunkError ? 'rgba(56,224,200,0.12)' : 'rgba(255,107,136,0.12)' }}>
            {this.state.isChunkError ? (
              <RefreshCw size={26} className="text-[var(--color-aqua)]" strokeWidth={2} />
            ) : (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ff6b88" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            )}
          </div>
          <h2 className="font-[var(--font-display)] text-xl font-bold">{title}</h2>
          <p className="text-sm text-[var(--color-mist)] mt-2">{body}</p>

          {(!this.state.isChunkError || sessionStorage.getItem('aklogic_chunk_reloaded')) && (
            <div className="mt-6 space-y-2.5">
              <button onClick={this.retryHere} className="w-full py-3.5 rounded-2xl font-semibold text-[var(--color-ink)] depth-raised" style={{ background: 'linear-gradient(135deg,#f6dd9b,#e9c46a)' }}>
                {this.state.isChunkError ? 'Refresh Now' : `Try Again ${onThisRoute ? '(stay on this page)' : ''}`}
              </button>
              <button onClick={this.goHome} className="w-full py-3 rounded-2xl font-medium border border-[var(--color-line)] text-[var(--color-mist)] hover:text-[var(--color-ivory)] transition">
                {this.state.isChunkError ? 'Continue Anyway' : 'Go to Home'}
              </button>
            </div>
          )}

          {import.meta.env.DEV && this.state.message && (
            <pre className="mt-4 text-[10px] text-left text-[var(--color-mist-2)] bg-[#0c1322] rounded-lg p-3 overflow-auto max-h-32">{this.state.message}</pre>
          )}
        </div>
      </div>
    );
  }
}
