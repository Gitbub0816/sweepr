/**
 * BackgroundCheckStep — Checkr Native Invitation (Hosted) flow.
 *
 * FCRA compliance:
 *  • Sweepr never collects SSN, DOB, or address.
 *  • Checkr's hosted form presents the federally-required standalone
 *    Disclosure & Authorization to the candidate and obtains explicit consent
 *    before collecting any PII.
 *  • This component only passes first/last name + work state to our API,
 *    which forwards name + email (from Clerk) to Checkr to create the candidate.
 *  • All sensitive data entry happens inside the Checkr iframe.
 */

import { useState } from "react";
import { ShieldCheck, ExternalLink, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { Input, Button, Card } from "@sweepr/ui";
import { TrainingGate } from "../TrainingPage";
import type { CheckrStatus } from "../../types/checkr";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface Props {
  n: number;
  workState?: string;
  getToken: () => Promise<string | null>;
  onComplete: () => void;
  trainingComplete?: boolean;
  isPrelaunch?: boolean;
}

type Phase =
  | { kind: "intro" }
  | { kind: "form" }
  | { kind: "loading" }
  | { kind: "embedded"; invitationUrl: string; expiresAt: string }
  | { kind: "waiting"; status: CheckrStatus }
  | { kind: "error"; message: string };

export function BackgroundCheckStep({ n, workState = "CA", getToken, onComplete, trainingComplete = false, isPrelaunch = false }: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });

  async function startInvitation() {
    if (!firstName.trim() || !lastName.trim()) return;
    setPhase({ kind: "loading" });
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/checkr/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), workState }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { invitationUrl: string; expiresAt: string };
      setPhase({ kind: "embedded", invitationUrl: data.invitationUrl, expiresAt: data.expiresAt });
    } catch (err) {
      setPhase({ kind: "error", message: String(err) });
    }
  }

  async function pollStatus() {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/checkr/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const data = (await res.json()) as { status: CheckrStatus };
      if (data.status !== "not_started" && data.status !== "invited") {
        setPhase({ kind: "waiting", status: data.status });
      }
    } catch {
      // silent — user can manually proceed
    }
  }

  if (phase.kind === "intro") {
    if (!isPrelaunch && !trainingComplete) {
      return (
        <div className="space-y-5">
          <StepHeader n={n} />
          <TrainingGate unlocked={false} />
        </div>
      );
    }
    return (
      <div className="space-y-5">
        <StepHeader n={n} />
        <FcraDisclosure />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Legal first name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
          />
          <Input
            label="Legal last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
          />
        </div>
        <p className="text-xs text-slate-500">
          Your SSN, date of birth, and address will be collected securely by our
          background-check partner Checkr — they never pass through Sweepr servers.
        </p>
        <Button
          onClick={startInvitation}
          disabled={!firstName.trim() || !lastName.trim()}
          className="w-full"
        >
          Continue to background check
        </Button>
      </div>
    );
  }

  if (phase.kind === "loading") {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-seafoam-400 border-t-transparent" />
        <p className="text-sm text-slate-500">Preparing your secure check…</p>
      </div>
    );
  }

  if (phase.kind === "embedded") {
    return (
      <div className="space-y-3">
        <StepHeader n={n} />
        <p className="text-sm text-slate-500">
          Complete the form below. All information is transmitted directly to
          Checkr — Sweepr does not see or store your personal details.
        </p>
        {/* Checkr hosted apply iframe */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <iframe
            src={phase.invitationUrl}
            title="Background check — powered by Checkr"
            className="h-[640px] w-full"
            allow="camera; microphone"
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-top-navigation-by-user-activation"
            onLoad={pollStatus}
          />
        </div>
        <p className="text-center text-xs text-slate-400">
          Secured by{" "}
          <a
            href="https://checkr.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Checkr
          </a>
          . Results are typically available within 1–3 business days.
        </p>
        <div className="flex gap-3">
          <a
            href={phase.invitationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-seafoam-600 underline underline-offset-2 hover:text-seafoam-700"
          >
            <ExternalLink className="h-4 w-4" />
            Open in new tab
          </a>
          <Button variant="secondary" onClick={pollStatus} className="ml-auto">
            I've completed the form
          </Button>
        </div>
      </div>
    );
  }

  if (phase.kind === "waiting") {
    return <StatusScreen status={phase.status} onContinue={onComplete} />;
  }

  if (phase.kind === "error") {
    return (
      <div className="space-y-4">
        <StepHeader n={n} />
        <Card className="flex items-start gap-3 border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <div>
            <p className="font-medium text-red-700 dark:text-red-300">Something went wrong</p>
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{phase.message}</p>
          </div>
        </Card>
        <Button variant="secondary" onClick={() => setPhase({ kind: "intro" })}>
          Try again
        </Button>
      </div>
    );
  }

  return null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepHeader({ n }: { n: number }) {
  return (
    <div>
      <span className="text-xs font-semibold uppercase tracking-wide text-seafoam-600">
        Step {n}
      </span>
      <h2 className="mt-1 text-xl font-bold text-charcoal dark:text-white">
        Background check
      </h2>
    </div>
  );
}

function FcraDisclosure() {
  return (
    <Card className="space-y-2 border-seafoam-200 bg-seafoam-50 p-4 dark:border-seafoam-800 dark:bg-seafoam-900/20">
      <div className="flex items-center gap-2 font-semibold text-seafoam-800 dark:text-seafoam-200">
        <ShieldCheck className="h-5 w-5" />
        <span>Background check disclosure (FCRA)</span>
      </div>
      <p className="text-sm text-seafoam-700 dark:text-seafoam-300">
        Sweepr will obtain a consumer report (background check) for employment
        purposes. This report may include criminal history, motor vehicle records,
        and other public records. You have the right to request a free copy of
        the report and to dispute inaccurate information.
      </p>
      <p className="text-sm text-seafoam-700 dark:text-seafoam-300">
        The background check is conducted by{" "}
        <a
          href="https://checkr.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline"
        >
          Checkr, Inc.
        </a>{" "}
        (a consumer reporting agency). Checkr will present you with a full
        Disclosure &amp; Authorization form before collecting any personal
        information.
      </p>
      <p className="text-xs text-seafoam-600 dark:text-seafoam-400">
        By clicking "Continue" you acknowledge receipt of this disclosure. Your
        authorization will be collected on the next screen.
      </p>
    </Card>
  );
}

const STATUS_COPY: Record<string, { icon: React.ReactNode; title: string; body: string; cta?: string }> = {
  pending: {
    icon: <Clock className="h-10 w-10 text-amber-400" />,
    title: "Check in progress",
    body: "Your background check has been submitted. Results are typically available within 1–3 business days. We'll email you when it's done.",
    cta: "Continue — we'll notify you",
  },
  consider: {
    icon: <Clock className="h-10 w-10 text-amber-400" />,
    title: "Under review",
    body: "Your report requires additional review by our team. We'll reach out within 2 business days.",
  },
  clear: {
    icon: <CheckCircle2 className="h-10 w-10 text-seafoam-500" />,
    title: "Check passed!",
    body: "Your background check is clear. You're one step closer to accepting jobs on Sweepr.",
    cta: "Continue",
  },
  pre_adverse_action: {
    icon: <AlertCircle className="h-10 w-10 text-amber-500" />,
    title: "Review notice",
    body: "Your report contains information that may affect your application. You should have received an email with a copy of the report and instructions to dispute any inaccuracies. You have at least 7 calendar days to respond.",
  },
  adverse_action: {
    icon: <AlertCircle className="h-10 w-10 text-red-500" />,
    title: "Application not approved",
    body: "After review, we are unable to approve your application at this time. You received an email with a copy of the report, your rights under the FCRA, and information on how to dispute inaccuracies.",
  },
};

function StatusScreen({ status, onContinue }: { status: CheckrStatus; onContinue: () => void }) {
  const copy = STATUS_COPY[status] ?? STATUS_COPY.pending;
  return (
    <div className="flex flex-col items-center gap-5 py-8 text-center">
      {copy.icon}
      <h3 className="text-xl font-bold text-charcoal dark:text-white">{copy.title}</h3>
      <p className="max-w-sm text-sm text-slate-500">{copy.body}</p>
      {copy.cta && (
        <Button onClick={onContinue} className="mt-2">
          {copy.cta}
        </Button>
      )}
    </div>
  );
}
