import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State {
  hasError: boolean;
  message?: string;
}

/** Catches render-time errors in the subtree and shows a clean recovery UI. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        role="alert"
        className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center"
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-seafoam-50 text-2xl">
          🧹
        </div>
        <h1 className="text-2xl font-black text-charcoal dark:text-white">
          Something went wrong
        </h1>
        <p className="mt-2 max-w-sm text-slate-500">
          We hit an unexpected snag. Try reloading — your booking progress is
          saved.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 rounded-2xl bg-seafoam-500 px-6 py-3 font-bold text-white hover:bg-seafoam-600"
        >
          Reload
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
