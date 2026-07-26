import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Guards against a reload loop: if the auto-reload below doesn't actually fix
// a stale-chunk error (e.g. the chunk is genuinely gone for good, not just
// stale), we still only try once per tab session before falling back to the
// normal "something went wrong" screen.
const RELOAD_GUARD_KEY = 'ledgerx:errorBoundaryAutoReloaded';

// sessionStorage throws in some privacy-mode/locked-down browser configs.
// This is the app's ONLY error boundary — a throw inside its own error
// handling has no outer boundary to catch it, which would be worse than the
// no-boundary baseline this component exists to fix. Fail to "no guard
// recorded" rather than crash: worst case a reload is attempted more than
// once in such a browser, never a silent failure.
function safeSessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* see above */
  }
}

// Vite's dynamic import() throws this exact message when a chunk referenced
// by an already-loaded page no longer exists on the server — precisely what
// happens to any tab left open across a deploy, since rsync --delete removes
// the old hashed chunk files. A hard refresh fixes it because it re-fetches
// index.html and gets the current chunk map; this detects the same failure
// and does that refresh automatically, so the user never has to know to.
function isStaleChunkError(error: Error): boolean {
  return /Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
    error.message,
  );
}

/**
 * There is no error boundary anywhere else in this app. Without one, any
 * uncaught render-time exception — a stale lazy-loaded chunk after a deploy,
 * a malformed date, anything — unmounts the ENTIRE page to blank white with
 * zero on-screen signal. This turns that into a visible message (and, for the
 * specific stale-chunk case, a silent self-heal) instead of an untraceable
 * blank screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  // Local instance flag, deliberately NOT sessionStorage: true only for the
  // render right after WE just called reload() ourselves, so that one brief
  // frame shows nothing instead of flashing the fallback UI an instant before
  // the page navigates away. It must reset on every remount and must never
  // gate the fallback UI beyond that one attempt — a genuinely repeat crash
  // (the reload-guard above already having fired once this session) always
  // falls through to the real fallback UI below, never blank forever.
  private reloadTriggered = false;
  private reloadFallbackTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] caught:', error, info.componentStack);

    if (isStaleChunkError(error) && !safeSessionGet(RELOAD_GUARD_KEY)) {
      safeSessionSet(RELOAD_GUARD_KEY, '1');
      this.reloadTriggered = true;
      window.location.reload();
      // Safety net: if reload() is blocked or silently no-ops (some embedded
      // webviews), don't leave the page blank forever — show the real
      // fallback after a short grace period instead of trusting navigation
      // to actually happen.
      this.reloadFallbackTimer = setTimeout(() => {
        this.reloadTriggered = false;
        this.forceUpdate();
      }, 3000);
    }
  }

  componentWillUnmount() {
    if (this.reloadFallbackTimer) clearTimeout(this.reloadFallbackTimer);
  }

  render() {
    if (this.state.error) {
      if (this.reloadTriggered) {
        return null;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 mb-2">Something went wrong</h1>
            <p className="text-sm text-slate-500 mb-4">
              LedgerX hit an unexpected error. Reloading usually fixes it — if it keeps
              happening, screenshot this message for support.
            </p>
            <p className="text-xs font-mono text-slate-400 bg-slate-50 rounded-lg p-3 mb-5 text-left break-words">
              {this.state.error.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
