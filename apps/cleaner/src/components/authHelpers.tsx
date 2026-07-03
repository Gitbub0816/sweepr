import { Loader2 } from "lucide-react";

export const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-charcoal outline-none transition focus:border-seafoam-400 focus:ring-2 focus:ring-seafoam-400/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white";

export function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <p role="alert" aria-live="assertive" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
      {message}
    </p>
  );
}

export function SubmitButton({ loading, disabled, label }: { loading: boolean; disabled: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      aria-busy={loading}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-seafoam-700 py-3 text-sm font-semibold text-white shadow-md shadow-seafoam-500/30 transition hover:bg-seafoam-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-400 focus-visible:ring-offset-2"
    >
      {loading && (
        <span aria-live="polite" className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" focusable="false" />
          <span className="sr-only">Loading…</span>
        </span>
      )}
      {label}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-white">{label}</label>
      {children}
    </div>
  );
}
