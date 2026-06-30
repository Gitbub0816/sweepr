import { useState, useEffect } from "react";
import { LifeBuoy, ShieldAlert, X, CheckCircle2 } from "lucide-react";

export type ReportApp = "customer" | "cleaner" | "admin" | "service";

// Canonical issue-type labels (fallback if /report/issue-types is unavailable).
const IT_FALLBACK = [
  "Account Access", "Authentication", "Device Issue", "Network", "Email", "Application",
  "Database", "API / Integration", "Operations Tooling", "Slack", "Payments System",
  "Printer / Peripheral", "Security-Related IT", "Software Bug", "Configuration", "Other",
];
const SECURITY_FALLBACK = [
  "Account Security", "Authentication", "Credential Exposure", "Phishing", "Malware",
  "Vulnerability", "Security Bug", "Privacy Concern", "Fraud", "Abuse Report",
  "Policy Violation", "Misdirected Email", "Spam", "Internal Security Matter", "Other",
];

interface Props {
  /** App name recorded on the ticket. */
  app: ReportApp;
  /** API base URL, e.g. import.meta.env.VITE_API_URL. */
  apiUrl: string;
  /** Returns a fresh Clerk token (useAuth().getToken). May resolve to null when signed out. */
  getToken: () => Promise<string | null>;
}

type Kind = "it" | "security";

/**
 * Floating "Report a problem" button + modal. Files an IT help-desk ticket or a
 * Security report. Logs the signed-in submitter automatically; requires an email
 * address when signed out.
 */
export function ReportProblem({ app, apiUrl, getToken }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("it");
  const [itTypes, setItTypes] = useState<string[]>(IT_FALLBACK);
  const [secTypes, setSecTypes] = useState<string[]>(SECURITY_FALLBACK);
  const [category, setCategory] = useState(IT_FALLBACK[0]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${apiUrl}/report/issue-types`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { it?: string[]; security?: string[] } | null) => {
        if (d?.it?.length) setItTypes(d.it);
        if (d?.security?.length) setSecTypes(d.security);
      })
      .catch(() => {});
  }, [apiUrl]);

  function reset() {
    setKind("it"); setCategory(IT_FALLBACK[0]); setTitle(""); setDescription("");
    setEmail(""); setDone(null); setError("");
  }

  async function openModal() {
    reset();
    setOpen(true);
    try {
      const t = await getToken();
      setLoggedIn(!!t);
    } catch {
      setLoggedIn(false);
    }
  }

  function switchKind(k: Kind) {
    setKind(k);
    setCategory((k === "it" ? itTypes : secTypes)[0]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 3) { setError("Please add a short summary."); return; }
    if (loggedIn === false && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Please enter your email so we can follow up.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${apiUrl}/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          kind,
          category,
          title: title.trim(),
          description: description.trim() || undefined,
          app,
          email: email.trim() || undefined,
          context: { url: typeof window !== "undefined" ? window.location.href : undefined },
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "");
      }
      const d = (await res.json()) as { case_code?: string };
      setDone(d.case_code ?? "");
    } catch (err) {
      setError((err as Error).message || "Couldn't submit right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const types = kind === "it" ? itTypes : secTypes;
  const Icon = kind === "security" ? ShieldAlert : LifeBuoy;

  return (
    <>
      {/* Desktop: full pill label. Mobile: icon-only at bottom-left to stay clear of scroll gestures. */}
      <button
        type="button"
        onClick={openModal}
        className="fixed bottom-16 right-3 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-charcoal shadow-lg hover:bg-slate-800 dark:bg-slate-700 sm:bottom-4 sm:right-4 sm:h-auto sm:w-auto sm:gap-2 sm:rounded-full sm:px-4 sm:py-2.5"
        aria-label="Report a problem"
      >
        <LifeBuoy className="h-5 w-5 text-white sm:h-4 sm:w-4" />
        <span className="hidden text-sm font-medium text-white sm:inline">Report a problem</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl dark:bg-slate-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-charcoal dark:text-white">
                <Icon className="h-5 w-5" /> Report a problem
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
                  {done ? <>Your Case Code is <span className="font-mono font-semibold text-charcoal dark:text-white">{done}</span>. Reference it if you contact us. </> : ""}
                  We'll follow up by email if needed.
                </p>
                <button onClick={() => setOpen(false)} className="mt-6 rounded-xl bg-seafoam-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-seafoam-600">
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-4 space-y-4">
                {/* Department toggle */}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => switchKind("it")}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${kind === "it" ? "border-seafoam-500 bg-seafoam-50 text-seafoam-700" : "border-slate-200 text-slate-500 dark:border-slate-700"}`}>
                    IT / Support
                  </button>
                  <button type="button" onClick={() => switchKind("security")}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${kind === "security" ? "border-amber-500 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-500 dark:border-slate-700"}`}>
                    Security report
                  </button>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-charcoal dark:text-slate-200">
                    {kind === "security" ? "Security issue type" : "What kind of issue?"}
                  </label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                    {types.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-charcoal dark:text-slate-200">Summary</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Briefly, what happened?" maxLength={200}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-charcoal dark:text-slate-200">Details (optional)</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
                    placeholder={kind === "security" ? "What did you observe? Avoid sharing secrets here." : "Steps to reproduce, what you expected, etc."}
                    maxLength={5000}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
                </div>

                {loggedIn === false && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-charcoal dark:text-slate-200">Your email</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
                    <p className="mt-1 text-xs text-slate-400">Required so we can send your Case Code and follow up.</p>
                  </div>
                )}

                {error && <p className="text-sm text-red-500">{error}</p>}
                <button type="submit" disabled={submitting}
                  className="w-full rounded-xl bg-seafoam-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-seafoam-600 disabled:opacity-50">
                  {submitting ? "Submitting…" : kind === "security" ? "Submit Security Report" : "Submit to IT Help Desk"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
