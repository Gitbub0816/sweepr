/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

// Shared helper: build a mailto-like deep link into the admin Mail tab.
// Format defined in the mail/IT/security rework contract:
//   /mail?box=<it|security>&compose=1&to=<urlenc>&subject=<urlenc>&body=<urlenc>

export interface EmailReporterOptions {
  box: "it" | "security";
  to: string | null | undefined;
  caseCode?: string | null;
  subject?: string | null;
  /** Pre-filled body (e.g. from a chosen response template). Falls back to a generic greeting. */
  body?: string | null;
}

export function buildReporterGreeting(caseCode?: string | null): string {
  return caseCode
    ? `Hi,\n\nRegarding your report (Case ${caseCode}):\n\n`
    : `Hi,\n\nRegarding your report:\n\n`;
}

export function buildMailDeepLink({ box, to, caseCode, subject, body }: EmailReporterOptions): string {
  const params = new URLSearchParams();
  params.set("box", box);
  params.set("compose", "1");
  if (to) params.set("to", to);
  const subj = subject ? `Re: ${caseCode ? `[${caseCode}] ` : ""}${subject}` : caseCode ? `Re: [${caseCode}]` : "Re:";
  params.set("subject", subj);
  params.set("body", body && body.trim() ? body : buildReporterGreeting(caseCode));
  return `/mail?${params.toString()}`;
}
