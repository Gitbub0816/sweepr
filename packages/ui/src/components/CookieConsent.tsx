import { useEffect, useState } from "react";
import { getAnalyticsConsent, setAnalyticsConsent } from "../lib/analytics";

/** Stable anonymous id so consent records can be audited/updated (GDPR Art. 7). */
function anonymousId(): string | undefined {
  try {
    const k = "sweepr_anon_id";
    let v = localStorage.getItem(k);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return undefined;
  }
}

/** Fire-and-forget server-side consent record — proof of the choice made. */
export function persistConsentRecord(apiUrl: string, analytics: boolean, gpcDetected = false) {
  fetch(`${apiUrl}/privacy/consent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analytics, gpcDetected, anonymousId: anonymousId() }),
  }).catch(() => null);
}

/**
 * Cookie/analytics consent banner (GDPR opt-in, CCPA opt-out compatible).
 *
 *  • Shown only while no choice is stored and no GPC signal is present.
 *  • "Accept" starts analytics; "Decline" keeps the site fully functional
 *    with only essential storage (auth/session).
 *  • Honors Global Privacy Control automatically (banner never shows,
 *    analytics never start).
 *  • Accessible: region landmark, labelled buttons, keyboard operable,
 *    ≥24px targets, no focus trap (non-blocking banner).
 */
export function CookieConsent({
  privacyUrl = "https://legal.getsweepr.com/privacy",
  apiUrl = "https://api.getsweepr.com",
}: { privacyUrl?: string; apiUrl?: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getAnalyticsConsent() === "unset");
  }, []);

  if (!visible) return null;

  function choose(granted: boolean) {
    setAnalyticsConsent(granted);
    persistConsentRecord(apiUrl, granted);
    setVisible(false);
  }

  return (
    <section
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
    >
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-slate-700 dark:text-slate-200">
          We use analytics cookies to understand how the site is used and improve it.
          Essential cookies (sign-in, security) are always on.{" "}
          <a
            href={privacyUrl}
            className="font-medium text-seafoam-700 underline hover:text-seafoam-800 dark:text-seafoam-300"
          >
            Privacy policy
          </a>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => choose(false)}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-400 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => choose(true)}
            className="rounded-xl bg-seafoam-700 px-4 py-2 text-sm font-semibold text-white hover:bg-seafoam-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-400 focus-visible:ring-offset-2"
          >
            Accept analytics
          </button>
        </div>
      </div>
    </section>
  );
}
