import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * App-level error boundary. Catches render errors and (via the static install
 * helper) unhandled promise rejections, showing a recovery UI instead of a
 * blank screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught error:", error, info);
  }

  reset = () => {
    this.setState({ hasError: false });
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-offwhite px-6 text-center dark:bg-slate-950">
        <h1 className="text-xl font-bold text-charcoal dark:text-white">
          Something went wrong
        </h1>
        <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          We hit an unexpected error. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="mt-6 rounded-xl bg-seafoam-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-seafoam-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-500 focus-visible:ring-offset-2"
        >
          Reload
        </button>
      </div>
    );
  }
}

/**
 * Install a global handler for unhandled promise rejections. Call once at
 * startup. Logs the rejection; visual recovery is handled by ErrorBoundary
 * for render-time errors.
 */
export function installGlobalErrorHandlers() {
  if (typeof window === "undefined") return;
  window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled promise rejection:", event.reason);
  });
}
