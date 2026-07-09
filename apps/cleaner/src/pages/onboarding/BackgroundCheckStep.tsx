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
import { useUser } from "@clerk/clerk-react";
import { ShieldCheck, ExternalLink, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { Input, Button, Card } from "@sweepr/ui";
import { TrainingGate } from "../TrainingPage";
import { AdjudicationAckModal } from "./AdjudicationAckModal";
import type { ReportStatus } from "../../types/yardstik";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface Props {
  n: number;
  getToken: () => Promise<string | null>;
  onComplete: () => void;
  trainingComplete?: boolean;
  isPrelaunch?: boolean;
}

type Phase =
  | { kind: "intro" }
  | { kind: "loading" }
  | { kind: "embedded"; invitationUrl: string; expiresAt: string }
  | { kind: "waiting"; status: ReportStatus }
  | { kind: "error"; message: string };

export function BackgroundCheckStep({ n, getToken, onComplete, trainingComplete = false, isPrelaunch = false }: Props) {
  const { user } = useUser();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [ackOpen, setAckOpen] = useState(false);
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  /** Gate: the Adjudication Policy must be acknowledged before the check starts. */
  async function ensureAcknowledged(): Promise<boolean> {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/adjudication/acknowledgment`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const d = (await res.json()) as { acknowledged: boolean };
        if (d.acknowledged) return true;
      }
    } catch { /* fall through to the modal */ }
    setAckOpen(true);
    return false;
  }

  async function startInvitation() {
    if (!firstName.trim() || !lastName.trim() || !email) return;
    if (!(await ensureAcknowledged())) return;
    setPhase({ kind: "loading" });
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/yardstik/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }),
      });
      if (!res.ok) {
        // Surface the server's friendly `message` (e.g. "Background checks are
        // temporarily unavailable…"), never the raw JSON error envelope.
        const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
        throw new Error(
          body?.message ??
            "We couldn't start your background check right now. Please try again in a few minutes.",
        );
      }
      const data = (await res.json()) as {
        invitationUrl?: string;
        expiresAt?: string;
        alreadyStarted?: boolean;
        status?: ReportStatus;
      };
      // A cleaner who already ordered a report doesn't get a fresh apply URL
      // (Yardstik blocks a duplicate within 30 days). The server reconciles the
      // existing report and returns its status — show that instead of an iframe.
      if (data.invitationUrl && data.expiresAt) {
        setPhase({ kind: "embedded", invitationUrl: data.invitationUrl, expiresAt: data.expiresAt });
      } else {
        setPhase({ kind: "waiting", status: data.status ?? "pending" });
      }
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Something went wrong. Please try again.",
      });
    }
  }

  async function pollStatus() {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/yardstik/status`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) return;
      const data = (await res.json()) as { status: ReportStatus };
      if (data.status !== "not_started" && data.status !== "invited") setPhase({ kind: "waiting", status: data.status });
    } catch { /* no-op */ }
  }

  if (phase.kind === "intro") {
    if (!isPrelaunch && !trainingComplete) {
      return <div className="space-y-5"><StepHeader n={n} /><TrainingGate unlocked={false} /></div>;
    }
    return (
      <div className="space-y-5">
        <StepHeader n={n} />
        <FcraDisclosure />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Legal first name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
          <Input label="Legal last name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
        </div>
        <p className="text-xs text-slate-500">Sweepr creates your Yardstik candidate record and sends you to a secure, Yardstik-hosted page to complete your background check.</p>
        {!email && <Card className="border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">We could not read your account email yet. Refresh or sign in again before starting the check.</Card>}
        <Button onClick={startInvitation} disabled={!firstName.trim() || !lastName.trim() || !email} className="w-full">Continue to background check</Button>
        <AdjudicationAckModal
          open={ackOpen}
          onClose={() => setAckOpen(false)}
          onAcknowledged={() => { setAckOpen(false); void startInvitation(); }}
          getToken={getToken}
          apiUrl={API_URL}
        />
      </div>
    );
  }

  if (phase.kind === "loading") return <div className="flex flex-col items-center gap-4 py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-seafoam-400 border-t-transparent" /><p className="text-sm text-slate-500">Preparing your secure check…</p></div>;

  if (phase.kind === "embedded") {
    // Yardstik's hosted apply page can't be embedded in an iframe — it's a SPA
    // that relies on its own first-party cookies, which browsers block inside a
    // cross-site frame (the frame just renders blank). So we open it in a new
    // tab and poll for completion instead.
    return (
      <div className="space-y-5">
        <StepHeader n={n} />
        <Card className="space-y-4 p-6 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Your secure background-check form is ready. It opens in a new tab, hosted by Yardstik —
            enter your details there, then come back and continue.
          </p>
          <a
            href={phase.invitationUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setTimeout(pollStatus, 1500)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-seafoam-700 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-seafoam-500/30 transition hover:bg-seafoam-800"
          >
            <ExternalLink className="h-4 w-4" />
            Open background check form
          </a>
          <p className="text-xs text-slate-600">
            Secured by <a href="https://yardstik.com" target="_blank" rel="noopener noreferrer" className="underline">Yardstik</a>. Results are typically available within 1–3 business days.
          </p>
        </Card>
        <div className="flex">
          <Button variant="secondary" onClick={pollStatus} className="ml-auto">I've completed the form</Button>
        </div>
      </div>
    );
  }

  if (phase.kind === "waiting") return <StatusScreen status={phase.status} onContinue={onComplete} />;

  if (phase.kind === "error") return <div className="space-y-4"><StepHeader n={n} /><Card className="flex items-start gap-3 border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" /><div><p className="font-medium text-red-700 dark:text-red-300">Something went wrong</p><p className="mt-1 text-xs text-red-600 dark:text-red-400">{phase.message}</p></div></Card><Button variant="secondary" onClick={() => setPhase({ kind: "intro" })}>Try again</Button></div>;

  return null;
}

function StepHeader({ n }: { n: number }) {
  return <div><span className="text-xs font-semibold uppercase tracking-wide text-seafoam-700">Step {n}</span><h2 className="mt-1 text-xl font-bold text-charcoal dark:text-white">Background check</h2></div>;
}

function FcraDisclosure() {
  return (
    <Card className="space-y-2 border-seafoam-200 bg-seafoam-50 p-4 dark:border-seafoam-800 dark:bg-seafoam-900/20">
      <div className="flex items-center gap-2 font-semibold text-seafoam-800 dark:text-seafoam-200"><ShieldCheck className="h-5 w-5" /><span>Background check disclosure</span></div>
      <p className="text-sm text-seafoam-700 dark:text-seafoam-300">Sweepr will obtain a consumer report for screening purposes. You have the right to request a free copy of the report and to dispute inaccurate information.</p>
      <p className="text-sm text-seafoam-700 dark:text-seafoam-300">The background check is conducted by <a href="https://yardstik.com" target="_blank" rel="noopener noreferrer" className="font-medium underline">Yardstik, Inc.</a> (a consumer reporting agency).</p>
      <p className="text-xs text-seafoam-700 dark:text-seafoam-400">By clicking "Continue" you acknowledge receipt of this disclosure. Your authorization will be collected by Yardstik.</p>
    </Card>
  );
}

const STATUS_COPY: Record<string, { icon: React.ReactNode; title: string; body: string; cta?: string }> = {
  pending: { icon: <Clock className="h-10 w-10 text-amber-400" />, title: "Check in progress", body: "Your background check has been submitted. Results are typically available within 1–3 business days. We'll email you when it's done.", cta: "Continue — we'll notify you" },
  consider: { icon: <Clock className="h-10 w-10 text-amber-400" />, title: "Under review", body: "Your report requires additional review by our team. We'll reach out within 2 business days." },
  clear: { icon: <CheckCircle2 className="h-10 w-10 text-seafoam-500" />, title: "Check passed!", body: "Your background check is clear. You're one step closer to accepting jobs on Sweepr.", cta: "Continue" },
  pre_adverse_action: { icon: <AlertCircle className="h-10 w-10 text-amber-500" />, title: "Review notice", body: "Your report contains information that may affect your application. You should have received an email with a copy of the report and instructions to dispute any inaccuracies. You have at least 7 calendar days to respond." },
  adverse_action: { icon: <AlertCircle className="h-10 w-10 text-red-500" />, title: "Application not approved", body: "After review, we are unable to approve your application at this time. You received an email with a copy of the report, your rights under the FCRA, and information on how to dispute inaccuracies." },
};

function StatusScreen({ status, onContinue }: { status: ReportStatus; onContinue: () => void }) {
  const copy = STATUS_COPY[status] ?? STATUS_COPY.pending;
  return <div className="flex flex-col items-center gap-5 py-8 text-center">{copy.icon}<h3 className="text-xl font-bold text-charcoal dark:text-white">{copy.title}</h3><p className="max-w-sm text-sm text-slate-500">{copy.body}</p>{copy.cta && <Button onClick={onContinue} className="mt-2">{copy.cta}</Button>}</div>;
}
