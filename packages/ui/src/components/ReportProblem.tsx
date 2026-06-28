import { useState } from "react";
import { LifeBuoy, X, CheckCircle2 } from "lucide-react";

export type ReportApp = "customer" | "cleaner" | "admin" | "service";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "bug", label: "Something is broken" },
  { value: "billing", label: "Billing or payment" },
  { value: "account", label: "Account or login" },
  { value: "technical", label: "Technical issue" },
  { value: "safety", label: "Safety concern" },
  { value: "feature_request", label: "Feature request" },
  { value: "other", label: "Something else" },
];

interface Props {
  /** App name recorded on the ticket. */
  app: ReportApp;
  /** API base URL, e.g. import.meta.env.VITE_API_URL. */
  apiUrl: string;
  /** Returns a fresh Clerk token (useAuth().getToken). */
  getToken: () => Promise<string | null>;
}

/**
 * Floating "Report a problem" button + modal that files an IT help-desk ticket.
 * Drop into any authenticated app shell (not marketing).
 */
export function ReportProblem({ app, apiUrl, getToken }: Props) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState("");

  function reset() {
    setCategory("bug"); setTitle(""); setDescription(""); setDone(null); setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 3) { setError("Please add a short summary."); return; }
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/it-tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          app,
          context: { url: typeof window !== "undefined" ? window.location.href : undefined },
        }),
      });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { ticket?: { ticket_number?: number } };
      setDone(d.ticket?.ticket_number ?? 0);
    } catch {
      setError("Couldn't submit right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { reset(); setOpen(true); }}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-charcoal px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-slate-800 dark:bg-slate-700"
        aria-label="Report a problem"
      >
        <LifeBuoy className="h-4 w-4" /> Report a problem
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl dark:bg-slate-900 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-charcoal dark:text-white">
                <LifeBuoy className="h-5 w-5" /> Report a problem
              </h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {done !== null ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-seafoam-500" />
                <p className="mt-3 font-semibold text-charcoal dark:text-white">Thanks — we're on it.</p>
                <p className="mt-1 text-sm text-slate-500">
                  {done ? `Ticket #${done} created. ` : ""}Our team will follow up if needed.
                </p>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-6 rounded-xl bg-seafoam-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-seafoam-600"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-charcoal dark:text-slate-200">What kind of issue?</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-charcoal dark:text-slate-200">Summary</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Briefly, what happened?"
                    maxLength={200}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-charcoal dark:text-slate-200">Details (optional)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="Steps to reproduce, what you expected, etc."
                    maxLength={5000}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-seafoam-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-seafoam-600 disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "Submit to IT Help Desk"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
