// App-wide error boundary. React requires a class component for the
// componentDidCatch lifecycle, so this is the one place we still write
// classes. Anything that throws inside the tree gets caught here and
// rendered as a friendly fallback instead of a blank white screen.
//
// The fallback offers two recovery paths:
//   1. "Try again" — resets local state, re-renders the original tree
//   2. "Reload page" — full reload, last resort if the error is in app
//      state that survives a reset
//
// In dev we surface the error message + stack so the developer can
// debug. In prod we hide it (no user-relevant info) and just log to the
// console so it shows up in browser devtools / error tracking.

import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Hook for future error tracking (Sentry etc.) — for now just log.
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    const isDev = import.meta.env.DEV;

    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-neutral-950 p-6">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6"
            >
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-neutral-200">
              Something went wrong
            </h1>
            <p className="text-sm text-slate-500 dark:text-neutral-400">
              An unexpected error broke this page. You can try again, or
              reload — your data isn't lost.
            </p>
          </div>
          {isDev && (
            <pre className="text-left text-[11px] bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-md p-3 overflow-auto max-h-48 text-slate-700 dark:text-neutral-300">
              {this.state.error.message}
              {this.state.error.stack && "\n\n" + this.state.error.stack}
            </pre>
          )}
          <div className="flex items-center justify-center gap-2">
            <Button type="button" onClick={this.reset}>
              Try again
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Reload page
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
