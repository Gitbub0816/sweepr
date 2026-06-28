import { useState } from "react";
import { Download, ShieldOff, Trash2, AlertTriangle, BellOff, CheckCircle2 } from "lucide-react";

interface Props {
  apiUrl: string;
  getToken: () => Promise<string | null>;
  /** The signed-in user's email — required to confirm destructive actions. */
  email: string;
  /** Called after the account is fully deleted (e.g. sign out + redirect). */
  onAccountDeleted?: () => void;
}

type Tier = "pii" | "account" | "account_and_data";

const TIER_LABEL: Record<Tier, string> = {
  pii: "Delete my personal info (keep account)",
  account: "Delete my account (download a copy first)",
  account_and_data: "Delete my account and all data",
};

/**
 * GDPR/CCPA self-service danger zone. Every destructive action requires typing
 * your exact email to re-confirm and shows an irreversible-warning. Deletes are
 * HARD (data is actually removed). Only ever affects the signed-in user.
 */
export function AccountPrivacy({ apiUrl, getToken, email, onAccountDeleted }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirmTier, setConfirmTier] = useState<Tier | null>(null);
  const [typed, setTyped] = useState("");

  async function authed(path: string, body?: unknown) {
    const token = await getToken();
    return fetch(`${apiUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function exportData() {
    setBusy(true); setNote(null);
    try {
      const res = await authed("/account/export");
      if (!res.ok) throw new Error();
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `sweepr-data-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
      setNote("✓ Your data was downloaded.");
    } catch {
      setNote("Couldn't export right now. Please try again.");
    } finally { setBusy(false); }
  }

  async function unsubscribe() {
    setBusy(true); setNote(null);
    try {
      const res = await authed("/account/unsubscribe", {});
      setNote(res.ok ? "✓ You've been unsubscribed from marketing communications." : "Couldn't unsubscribe right now.");
    } finally { setBusy(false); }
  }

  async function runDelete(tier: Tier) {
    if (typed.trim().toLowerCase() !== email.toLowerCase()) {
      setNote("The email you typed doesn't match your account email.");
      return;
    }
    setBusy(true); setNote(null);
    try {
      if (tier === "account") await exportData(); // download a copy first
      const res =
        tier === "pii"
          ? await authed("/account/delete-pii", { confirmEmail: typed.trim() })
          : await authed("/account/delete", { confirmEmail: typed.trim(), scope: tier });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setNote((d as { error?: string }).error ?? "Action failed."); return; }
      if (tier === "pii") {
        setNote("✓ Your personal information was permanently deleted.");
        setConfirmTier(null); setTyped("");
      } else {
        setNote("✓ Your account and data were permanently deleted.");
        onAccountDeleted?.();
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      {/* Your data */}
      <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
        <h3 className="font-semibold text-charcoal dark:text-white">Your data</h3>
        <p className="mt-1 text-sm text-slate-500">Download everything we hold about you, or opt out of marketing.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={exportData} disabled={busy} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">
            <Download className="h-4 w-4" /> Download my data
          </button>
          <button onClick={unsubscribe} disabled={busy} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">
            <BellOff className="h-4 w-4" /> Unsubscribe from communications
          </button>
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-red-200 bg-red-50/50 p-5 dark:border-red-900/40 dark:bg-red-950/10">
        <h3 className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4" /> Danger zone
        </h3>
        <p className="mt-1 text-sm text-red-600/80">
          These actions are <strong>permanent and cannot be undone</strong>. Deleted data is removed for good.
        </p>

        <div className="mt-4 space-y-2">
          {(["pii", "account", "account_and_data"] as Tier[]).map((tier) => (
            <button
              key={tier}
              onClick={() => { setConfirmTier(tier); setTyped(""); setNote(null); }}
              className="flex w-full items-center gap-3 rounded-lg border border-red-200 bg-white px-4 py-3 text-left text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:bg-slate-900"
            >
              {tier === "pii" ? <ShieldOff className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
              {TIER_LABEL[tier]}
            </button>
          ))}
        </div>
      </section>

      {note && (
        <p className={`text-sm ${note.startsWith("✓") ? "text-emerald-600" : "text-red-500"}`}>
          {note.startsWith("✓") && <CheckCircle2 className="mr-1 inline h-4 w-4" />}
          {note}
        </p>
      )}

      {/* Re-confirmation modal */}
      {confirmTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmTier(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <h2 className="flex items-center gap-2 text-lg font-bold text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" /> This can't be undone
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {confirmTier === "pii"
                ? "Your name, phone, photo and addresses will be permanently erased. Your account stays active."
                : confirmTier === "account"
                ? "We'll download a copy of your data, then permanently delete your account and everything in it."
                : "Your account and ALL of your data will be permanently deleted. This includes bookings, history, and payouts records."}
            </p>
            <label className="mt-4 block text-sm font-medium text-charcoal dark:text-slate-200">
              Type your email <span className="font-mono text-slate-500">{email}</span> to confirm
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={email}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmTier(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700">
                Cancel
              </button>
              <button
                onClick={() => runDelete(confirmTier)}
                disabled={busy || typed.trim().toLowerCase() !== email.toLowerCase()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Working…" : "Permanently delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
