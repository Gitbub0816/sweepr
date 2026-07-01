import { useState } from "react";
import { SUPPORT_EMAIL } from "../docs";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

/** Sans-serif stack — this page matches the main website, not the legal mono standard. */
const SANS =
  '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const MESSAGE_TYPES = [
  "Account verification",
  "One-time passcodes",
  "Password resets",
  "Login verification",
  "Booking confirmations",
  "Cleaner assignment",
  "Arrival notifications",
  "Cleaning status",
  "Receipts",
  "Customer support",
];

/**
 * Public SMS opt-in page (getsweepr.com/sms/consent) — the live consent form
 * carriers verify for A2P registration. Styled like the main website.
 */
export function SMSConsentPolicy() {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!consent) {
      setError("Please check the consent box to opt in.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/sms/opt-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, consent: true }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ fontFamily: SANS }} className="min-h-screen bg-gradient-to-br from-seafoam-50 via-white to-seafoam-100">
      <div className="mx-auto max-w-xl px-4 py-16">
        {/* Brand header */}
        <div className="mb-8 text-center">
          <a href="https://getsweepr.com" className="text-3xl font-black tracking-tight text-seafoam-600" style={{ fontFamily: SANS }}>
            Sweepr
          </a>
          <h1 className="mt-4 text-2xl font-bold text-slate-900" style={{ fontFamily: SANS }}>
            Receive SMS Updates from Sweepr
          </h1>
          <p className="mt-2 text-slate-500">
            Get booking confirmations, cleaner arrival alerts, and account
            security codes by text.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {done ? (
            <div className="space-y-3 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-seafoam-100 text-2xl">✓</div>
              <h2 className="text-lg font-semibold text-slate-900" style={{ fontFamily: SANS }}>You're all set</h2>
              <p className="text-sm text-slate-500">
                If this number is linked to a Sweepr account, your SMS
                preferences have been updated and you'll receive a confirmation
                text shortly. Reply STOP at any time to opt out, or HELP for
                assistance.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5" noValidate>
              <div>
                <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Mobile phone number
                </label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  placeholder="(555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-seafoam-400 focus:ring-2 focus:ring-seafoam-200"
                  style={{ fontFamily: SANS }}
                />
              </div>

              {/* Never pre-checked — express consent is affirmative. */}
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-teal-500"
                />
                <span className="text-slate-600">
                  I agree to receive SMS messages from Sweepr regarding account
                  verification, one-time passcodes (OTP), booking
                  confirmations, cleaner assignment, arrival notifications,
                  service updates, receipts, and customer support. Message
                  frequency varies. Message and data rates may apply. Reply
                  STOP to opt out or HELP for assistance.
                </span>
              </label>

              {error && (
                <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-seafoam-500 px-4 py-3 font-semibold text-white transition-colors hover:bg-seafoam-600 disabled:opacity-60"
                style={{ fontFamily: SANS }}
              >
                {submitting ? "Submitting…" : "Opt in to SMS updates"}
              </button>
            </form>
          )}
        </div>

        {/* Disclosures — carriers verify this content on this page. */}
        <div className="mt-8 space-y-6 text-sm text-slate-600">
          <div>
            <h2 className="mb-2 font-semibold text-slate-900" style={{ fontFamily: SANS }}>
              What you'll receive
            </h2>
            <p className="mb-2">
              By checking the SMS consent box during registration or booking,
              you agree to receive SMS messages regarding:
            </p>
            <ul className="grid list-disc grid-cols-1 gap-x-6 gap-y-1 pl-5 sm:grid-cols-2">
              {MESSAGE_TYPES.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-slate-900" style={{ fontFamily: SANS }}>
              The fine print
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Message frequency varies.</li>
              <li>Message and data rates may apply.</li>
              <li>Reply <strong>STOP</strong> to unsubscribe.</li>
              <li>Reply <strong>HELP</strong> for assistance.</li>
              <li>Consent is not a condition of purchasing services.</li>
            </ul>
          </div>

          <p className="border-t border-slate-200 pt-4 text-xs text-slate-400">
            See our{" "}
            <a href="/privacy" className="text-seafoam-600 underline">Privacy Policy</a> and{" "}
            <a href="/terms" className="text-seafoam-600 underline">Terms of Service</a>.
            Questions? Contact{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-seafoam-600 underline">{SUPPORT_EMAIL}</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
