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
import {
  ShieldCheck,
  IdCard,
  GraduationCap,
  FileText,
  Check,
  Clock,
  ExternalLink,
  User,
} from "lucide-react";
import { Button, Badge } from "@sweepr/ui";
import { cn } from "@sweepr/utils";
import { DemoChrome } from "../demo/DemoChrome";

const STEPS = ["Application review"];

const VERIFICATIONS = [
  { icon: FileText, label: "Profile & bio", state: "complete", note: "Complete" },
  { icon: GraduationCap, label: "Training", state: "complete", note: "3/3 passed" },
  { icon: ShieldCheck, label: "Background check", state: "complete", note: "Clear" },
  { icon: IdCard, label: "Identity (Didit)", state: "complete", note: "Verified" },
] as const;

const SCREENINGS = [
  { label: "SSN Trace", result: "clear" },
  { label: "National Criminal Search", result: "clear" },
  { label: "Sex Offender Registry", result: "clear" },
  { label: "Global Watchlist", result: "clear" },
  { label: "County Criminal (Travis, TX)", result: "review" },
  { label: "Motor Vehicle Record", result: "clear" },
] as const;

export function AdminReviewFlow() {
  const [decision, setDecision] = useState<"pending" | "approved" | "declined">("pending");
  const reset = () => setDecision("pending");

  return (
    <DemoChrome title="Application review" persona="Admin, read-only view" steps={STEPS} current={0} onReset={reset}>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        This mirrors what staff see on an applicant. Everything here is mock data. Approving or declining
        moves nothing real.
      </p>

      {/* Applicant header */}
      <div className="mb-5 flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-seafoam-100 text-lg font-bold text-seafoam-700 dark:bg-seafoam-900/40 dark:text-seafoam-300">JS</span>
        <div className="flex-1">
          <p className="text-lg font-bold text-charcoal dark:text-white">Jordan Smith</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Austin, TX · Applied 2 days ago · Individual cleaner</p>
        </div>
        <Badge variant={decision === "approved" ? "success" : decision === "declined" ? "error" : "warning"}>
          {decision === "approved" ? "Approved" : decision === "declined" ? "Declined" : "Pending review"}
        </Badge>
      </div>

      {/* Verification statuses */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        {VERIFICATIONS.map((v) => (
          <div key={v.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between">
              <v.icon className="h-4 w-4 text-slate-400" />
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600"><Check className="h-3 w-3 text-white" /></span>
            </div>
            <p className="text-sm font-semibold text-charcoal dark:text-white">{v.label}</p>
            <p className="text-xs text-emerald-600">{v.note}</p>
          </div>
        ))}
      </div>

      {/* Yardstik report panel */}
      <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-seafoam-600" />
            <p className="text-sm font-semibold text-charcoal dark:text-white">Background report</p>
            <span className="text-xs text-slate-400">(sample)</span>
          </div>
          <Badge variant="warning">Needs review</Badge>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {SCREENINGS.map((s) => (
            <div key={s.label} className="flex items-center justify-between px-5 py-2.5">
              <span className="text-sm text-charcoal dark:text-slate-200">{s.label}</span>
              {s.result === "clear" ? (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600"><Check className="h-3.5 w-3.5" /> Clear</span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-medium text-amber-600"><Clock className="h-3.5 w-3.5" /> Needs review</span>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between bg-slate-50 px-5 py-3 dark:bg-slate-950/40">
          <p className="text-xs text-slate-500 dark:text-slate-400">Package: Federal Premium · Adjudication: manual</p>
          <span className="flex items-center gap-1 text-xs font-medium text-slate-400"><ExternalLink className="h-3.5 w-3.5" /> Full report (disabled in demo)</span>
        </div>
      </div>

      {/* Decision */}
      {decision === "pending" ? (
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={() => setDecision("declined")}>Decline</Button>
          <Button fullWidth onClick={() => setDecision("approved")}><User className="h-4 w-4" /> Approve cleaner</Button>
        </div>
      ) : (
        <div className={cn("flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium", decision === "approved" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300")}>
          {decision === "approved" ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
          {decision === "approved" ? "Jordan is now an active cleaner (demo)." : "Application declined (demo)."}
          <button onClick={reset} className="ml-auto text-xs underline">Undo</button>
        </div>
      )}
    </DemoChrome>
  );
}
