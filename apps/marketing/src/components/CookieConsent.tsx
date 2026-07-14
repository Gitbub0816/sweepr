/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { initAnalytics, persistConsentRecord, setAdvertisingConsent, enforceCookiePolicy } from "@sweepr/ui";

const STORAGE_KEY = "sweepr_cookie_consent";

/** Global Privacy Control — treat as a standing opt-out signal (CCPA/CPRA). */
function gpcSignaled(): boolean {
  try {
    return (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  } catch {
    return false;
  }
}

type Consent = "all" | "essential" | "custom";

interface ConsentRecord {
  choice: Consent;
  analytics: boolean;
  marketing: boolean;
  at: string;
}

function read(): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ConsentRecord) : null;
  } catch {
    return null;
  }
}

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

function save(record: ConsentRecord) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* ignore storage errors */
  }
  // The cookie engine gates writes and sweeps anything a denied category
  // already dropped (advertising = the "marketing" toggle here).
  setAdvertisingConsent(record.marketing);
  enforceCookiePolicy();
  // Server-side consent record (GDPR Art. 7 accountability) — fire-and-forget.
  persistConsentRecord(API_URL, record.analytics);
}

/**
 * GDPR/CCPA cookie banner. Non-blocking: it renders on top of the page and
 * never prevents content from loading. Persists the choice to localStorage.
 */
export function CookieConsent() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [managing, setManaging] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const existing = read();
    if (existing) {
      if (existing.analytics) void initAnalytics();
      return;
    }
    if (gpcSignaled()) {
      // Global Privacy Control is a legally-recognized opt-out signal
      // (CCPA/CPRA) — record it as a reject-non-essential choice and skip
      // the prompt instead of asking the visitor to opt in anyway.
      save({ choice: "essential", analytics: false, marketing: false, at: new Date().toISOString() });
      return;
    }
    setVisible(true);
  }, []);

  if (!visible) return null;

  const commit = (choice: Consent, a: boolean, m: boolean) => {
    save({ choice, analytics: a, marketing: m, at: new Date().toISOString() });
    setVisible(false);
    if (a) void initAnalytics();
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-modal="false"
      className="fixed inset-x-0 bottom-0 z-50 p-4"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-semibold text-charcoal dark:text-white">
          {t("cookies.title")}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {t("cookies.body")}{" "}
          <a href="https://legal.getsweepr.com/privacy?ref=marketing" target="_blank" rel="noreferrer" className="font-medium text-seafoam-700 underline">
            {t("footer.privacy")}
          </a>
          .
        </p>

        {managing && (
          <div className="mt-4 space-y-2 rounded-xl bg-offwhite p-3 dark:bg-slate-800">
            <label className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">
                {t("cookies.essential")}
              </span>
              <input type="checkbox" checked disabled aria-label="Essential cookies" />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">{t("cookies.analytics")}</span>
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                aria-label="Analytics cookies"
              />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">{t("cookies.marketing")}</span>
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
                aria-label="Marketing cookies"
              />
            </label>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => commit("all", true, true)}
            className="rounded-xl bg-seafoam-700 px-4 py-2 text-sm font-bold text-white hover:bg-seafoam-800"
          >
            {t("cookies.acceptAll")}
          </button>
          <button
            onClick={() => commit("essential", false, false)}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
          >
            {t("cookies.rejectNonEssential")}
          </button>
          {managing ? (
            <button
              onClick={() => commit("custom", analytics, marketing)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
            >
              {t("cookies.savePreferences")}
            </button>
          ) : (
            <button
              onClick={() => setManaging(true)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
            >
              {t("cookies.managePreferences")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default CookieConsent;
