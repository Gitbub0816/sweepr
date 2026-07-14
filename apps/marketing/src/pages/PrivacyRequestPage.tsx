/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useState } from "react";
import { useSeo } from "../lib/useSeo";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

const REQUEST_TYPES = [
  { value: "opt_out", label: "Do not sell or share my personal information" },
  { value: "know", label: "Tell me what personal information you have about me" },
  { value: "access", label: "Send me a copy of my personal information" },
  { value: "delete", label: "Delete my personal information" },
  { value: "correct", label: "Correct my personal information" },
  { value: "portability", label: "Export my data in a portable format" },
];

/**
 * Public privacy request (DSAR) intake — works for anyone, with or without a
 * Sweepr account (GDPR Arts. 15–20, CCPA/CPRA §1798.100+). Also serves as the
 * "Do Not Sell or Share" opt-out mechanism the footer links to.
 */
export default function PrivacyRequestPage() {
  useSeo({ title: 'Submit a privacy request, Sweepr', description: 'Submit a CCPA/GDPR data access, deletion, or do-not-sell request to Sweepr.', canonical: "https://getsweepr.com/privacy-request" });
  const params = new URLSearchParams(window.location.search);
  const [email, setEmail] = useState("");
  const [requestType, setRequestType] = useState(params.get("type") ?? "opt_out");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch(`${API}/privacy/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, requestType, details: details || undefined }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-3xl font-bold text-charcoal">Privacy requests</h1>
      <p className="mt-3 text-slate-600">
        Use this form to exercise your privacy rights under the GDPR, CCPA/CPRA,
        and similar laws, whether or not you have a Sweepr account. We respond
        within 30 days. You can also email{" "}
        <a href="mailto:security@getsweepr.com" className="text-seafoam-700 underline">
          security@getsweepr.com
        </a>.
      </p>

      {state === "done" ? (
        <div role="status" className="mt-8 rounded-xl border border-seafoam-200 bg-seafoam-50 p-5">
          <p className="font-semibold text-seafoam-800">Request received.</p>
          <p className="mt-1 text-sm text-seafoam-700">
            We'll verify your identity by email and respond within 30 days.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="pr-email" className="mb-1.5 block text-sm font-medium text-charcoal">
              Your email address
            </label>
            <input
              id="pr-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-500"
            />
          </div>

          <div>
            <label htmlFor="pr-type" className="mb-1.5 block text-sm font-medium text-charcoal">
              What would you like us to do?
            </label>
            <select
              id="pr-type"
              value={requestType}
              onChange={(e) => setRequestType(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-500"
            >
              {REQUEST_TYPES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="pr-details" className="mb-1.5 block text-sm font-medium text-charcoal">
              Anything else we should know? <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <textarea
              id="pr-details"
              rows={4}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-500"
            />
          </div>

          {state === "error" && (
            <p role="alert" className="text-sm font-medium text-red-700">
              Something went wrong. Please try again or email security@getsweepr.com.
            </p>
          )}

          <button
            type="submit"
            disabled={state === "sending"}
            className="rounded-xl bg-seafoam-700 px-6 py-3 text-sm font-semibold text-white hover:bg-seafoam-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-500 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {state === "sending" ? "Submitting…" : "Submit request"}
          </button>
        </form>
      )}
    </main>
  );
}
