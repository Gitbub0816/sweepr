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
import { ScrollText, ExternalLink, X } from "lucide-react";
import { Button } from "@sweepr/ui";

const LEGAL_URL = "https://legal.getsweepr.com/background-check-adjudication";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after the acknowledgment is recorded server-side. */
  onAcknowledged: () => void;
  getToken: () => Promise<string | null>;
  apiUrl: string;
}

/**
 * Required review-and-acknowledge modal for the Background Check Adjudication
 * Policy, shown immediately before the background check starts. The server
 * also enforces this (checkr/invite returns 403 policy_ack_required until the
 * acknowledgment is recorded), so skipping the modal client-side cannot skip
 * the requirement.
 */
export function AdjudicationAckModal({ open, onClose, onAcknowledged, getToken, apiUrl }: Props) {
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function acknowledge() {
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/adjudication/acknowledge`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error();
      onAcknowledged();
    } catch {
      setError("We couldn't record your acknowledgment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="adjudication-ack-title">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl dark:bg-slate-900 sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-700">
          <h2 id="adjudication-ack-title" className="flex items-center gap-2 text-lg font-bold text-charcoal dark:text-white">
            <ScrollText className="h-5 w-5 text-seafoam-600" /> Background Check Adjudication Policy
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5 text-sm text-slate-600 dark:text-slate-300">
          <p>
            Before your background check begins, please review how Sweepr evaluates background
            check results. In summary:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Convictions only.</strong> Arrests without conviction, dismissed charges, acquittals, and sealed or expunged records (where the law prohibits their use) are not held against you.</li>
            <li><strong>Objective standards.</strong> Convictions are evaluated by offense category and how long ago they occurred, under consistent written rules.</li>
            <li><strong>Individualized review.</strong> Many outcomes qualify for a discretionary review that considers time passed, rehabilitation, work history, and references.</li>
            <li><strong>Pending charges.</strong> Applications are placed on hold until any pending criminal charges are resolved.</li>
            <li><strong>Your rights.</strong> If information in your report may lead to a denial, you'll receive a copy of the report and a chance to dispute or explain it before any final decision (FCRA adverse-action process).</li>
          </ul>
          <p>
            The full policy — including every offense category and time window — is published at:
          </p>
          <a
            href={LEGAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-seafoam-700 underline underline-offset-2"
          >
            Background Check Adjudication Policy <ExternalLink className="h-3.5 w-3.5" />
          </a>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-seafoam-600"
            />
            <span className="text-sm">
              I have read and acknowledge the Sweepr Background Check Adjudication Policy.
            </span>
          </label>
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="border-t border-slate-200 p-5 dark:border-slate-700">
          <Button onClick={acknowledge} disabled={!checked || submitting} className="w-full">
            {submitting ? "Recording…" : "Acknowledge & continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
