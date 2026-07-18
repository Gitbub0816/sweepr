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
  User,
  MapPin,
  GraduationCap,
  ShieldCheck,
  IdCard,
  Check,
  X,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Clock,
} from "lucide-react";
import { Button, Input, Textarea, SuccessCheck } from "@sweepr/ui";
import { cn } from "@sweepr/utils";
import { DemoChrome, StepPanel } from "../demo/DemoChrome";

const STEPS = ["Profile", "Service area", "Training", "Background", "Identity", "Submit"];

const QUIZ = [
  {
    q: "A customer isn't home and you can't reach them at check-in. What do you do?",
    options: ["Let yourself in with the code and start", "Wait, then follow the no-contact protocol in the app", "Cancel and leave immediately"],
    answer: 1,
  },
  {
    q: "You notice the home needs far more work than the booked scope. What's correct?",
    options: ["Do everything anyway for a good review", "Submit an additional-attention request with photos", "Skip the dirty rooms silently"],
    answer: 1,
  },
  {
    q: "When are tips paid out to you?",
    options: ["Never, Sweepr keeps tips", "100% to you, released at payout", "Only if the customer rates 5 stars"],
    answer: 1,
  },
];

type Sim = "idle" | "running" | "done";

export function OnboardingFlow() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("Jordan Smith");
  const [bio, setBio] = useState("Six years of residential cleaning. Detail-obsessed, pet friendly.");
  const [city, setCity] = useState("Austin, TX");
  const [radius, setRadius] = useState(15);
  const [answers, setAnswers] = useState<(number | null)[]>([null, null, null]);
  const [quizChecked, setQuizChecked] = useState(false);
  const [bg, setBg] = useState<Sim>("idle");
  const [idv, setIdv] = useState<Sim>("idle");

  const reset = () => {
    setStep(0);
    setAnswers([null, null, null]);
    setQuizChecked(false);
    setBg("idle");
    setIdv("idle");
  };

  const quizScore = answers.filter((a, i) => a === QUIZ[i].answer).length;
  const quizPass = quizScore === QUIZ.length;

  const canAdvance = (() => {
    if (step === 2) return quizChecked && quizPass;
    if (step === 3) return bg === "done";
    if (step === 4) return idv === "done";
    return true;
  })();

  const runSim = (setter: (v: Sim) => void) => {
    setter("running");
    window.setTimeout(() => setter("done"), 1600);
  };

  if (step >= STEPS.length) {
    return (
      <DemoChrome title="Cleaner onboarding" persona="Applicant, Jordan Smith" steps={STEPS} current={STEPS.length - 1} onReset={reset}>
        <div className="mx-auto max-w-md py-8 text-center motion-safe:animate-[demo-pop_400ms_cubic-bezier(0.23,1,0.32,1)]">
          <div className="flex justify-center"><SuccessCheck size={84} label="Application submitted" /></div>
          <h2 className="mt-6 text-2xl font-bold text-charcoal dark:text-white">Application submitted</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Nice work, Jordan. Your profile, training, background check, and identity check are in.
            Our team reviews new cleaners within a couple of business days.
          </p>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <StatusLine label="Profile & service area" ok />
            <StatusLine label="Training quiz" ok note={`${quizScore}/${QUIZ.length} correct`} />
            <StatusLine label="Background check (simulated)" ok note="Clear" />
            <StatusLine label="Identity verification (simulated)" ok note="Verified" />
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              <Clock className="h-3.5 w-3.5" /> Pending staff review
            </div>
          </div>
          <Button className="mt-6" variant="ghost" onClick={reset}>Run it again</Button>
        </div>
      </DemoChrome>
    );
  }

  return (
    <DemoChrome title="Cleaner onboarding" persona="Applicant, Jordan Smith" steps={STEPS} current={step} onReset={reset}>
      <StepPanel stepKey={step}>
        {step === 0 && (
          <StepWrap icon={User} title="Your profile" sub="Customers see your name, photo, and bio when they're matched.">
            <div className="space-y-3">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Short bio" />
            </div>
          </StepWrap>
        )}

        {step === 1 && (
          <StepWrap icon={MapPin} title="Service area" sub="Where you'll accept jobs. You can change this any time.">
            <div className="space-y-4">
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Home base city" />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200">Radius: <span className="tabular-nums text-seafoam-700 dark:text-seafoam-300">{radius} mi</span></span>
                <input type="range" min={5} max={40} step={5} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full accent-seafoam-600" />
              </label>
              <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-emerald-50 to-seafoam-100 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900">
                <span className="absolute rounded-full border-2 border-seafoam-500/60 bg-seafoam-400/15" style={{ width: `${radius * 4}px`, height: `${radius * 4}px` }} />
                <MapPin className="relative z-10 h-6 w-6 text-seafoam-700" />
              </div>
            </div>
          </StepWrap>
        )}

        {step === 2 && (
          <StepWrap icon={GraduationCap} title="Training check" sub="A quick sample of the full training. Pass to continue.">
            <div className="space-y-5">
              {QUIZ.map((item, qi) => (
                <div key={qi}>
                  <p className="mb-2 text-sm font-semibold text-charcoal dark:text-white">{qi + 1}. {item.q}</p>
                  <div className="space-y-2">
                    {item.options.map((opt, oi) => {
                      const picked = answers[qi] === oi;
                      const correct = item.answer === oi;
                      const showState = quizChecked && (picked || correct);
                      return (
                        <button
                          key={oi}
                          type="button"
                          onClick={() => { setAnswers((a) => a.map((v, i) => (i === qi ? oi : v))); setQuizChecked(false); }}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-xl border p-3 text-left text-sm transition-colors",
                            !showState && picked && "border-seafoam-500 bg-seafoam-50 dark:border-seafoam-600 dark:bg-seafoam-950/40",
                            !showState && !picked && "border-slate-200 hover:border-slate-300 dark:border-slate-700",
                            showState && correct && "border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40",
                            showState && picked && !correct && "border-red-400 bg-red-50 dark:border-red-600 dark:bg-red-950/40"
                          )}
                        >
                          <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", picked || (showState && correct) ? "border-transparent" : "border-slate-300 dark:border-slate-600")}>
                            {showState && correct && <Check className="h-4 w-4 text-emerald-600" />}
                            {showState && picked && !correct && <X className="h-4 w-4 text-red-500" />}
                            {!showState && picked && <span className="h-2.5 w-2.5 rounded-full bg-seafoam-600" />}
                          </span>
                          <span className="text-charcoal dark:text-slate-200">{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {!quizChecked ? (
                <Button variant="secondary" fullWidth disabled={answers.some((a) => a === null)} onClick={() => setQuizChecked(true)}>Check answers</Button>
              ) : quizPass ? (
                <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-600"><Check className="h-4 w-4" /> All correct. You can continue.</p>
              ) : (
                <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-red-500"><X className="h-4 w-4" /> {quizScore}/{QUIZ.length} correct. Fix your answers to continue.</p>
              )}
            </div>
          </StepWrap>
        )}

        {step === 3 && (
          <StepWrap icon={ShieldCheck} title="Background check (simulated)" sub="In production this hands off to our background-check partner. Here it completes instantly, with no real data.">
            <SimPanel
              state={bg}
              idleLabel="Start background check (simulated)"
              runningLabel="Running screenings…"
              doneTitle="Background check clear"
              doneSub="SSN trace, national criminal, and sex-offender registry all cleared."
              onRun={() => runSim(setBg)}
            />
          </StepWrap>
        )}

        {step === 4 && (
          <StepWrap icon={IdCard} title="Identity verification (simulated)" sub="Normally you'd scan a government ID and take a selfie. This simulated step needs nothing real.">
            <SimPanel
              state={idv}
              idleLabel="Verify identity (simulated)"
              runningLabel="Matching ID to selfie…"
              doneTitle="Identity verified"
              doneSub="Document authenticity and liveness check passed."
              onRun={() => runSim(setIdv)}
            />
          </StepWrap>
        )}

        {step === 5 && (
          <StepWrap icon={Check} title="Review & submit" sub="Everything checks out. Submit your application for staff review.">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <StatusLine label="Profile" ok note={name} />
              <StatusLine label="Service area" ok note={`${city} · ${radius} mi`} />
              <StatusLine label="Training quiz" ok note={`${quizScore}/${QUIZ.length}`} />
              <StatusLine label="Background check" ok note="Clear (simulated)" />
              <StatusLine label="Identity" ok note="Verified (simulated)" />
            </div>
          </StepWrap>
        )}
      </StepPanel>

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((v) => Math.max(0, v - 1))} disabled={step === 0}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button onClick={() => setStep((v) => v + 1)} disabled={!canAdvance}>
          {step === STEPS.length - 1 ? "Submit application" : "Continue"} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </DemoChrome>
  );
}

function StepWrap({ icon: Icon, title, sub, children }: { icon: typeof User; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-2 text-seafoam-700 dark:text-seafoam-300">
          <Icon className="h-5 w-5" />
          <h2 className="text-lg font-bold text-charcoal dark:text-white">{title}</h2>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function SimPanel({ state, idleLabel, runningLabel, doneTitle, doneSub, onRun }: { state: Sim; idleLabel: string; runningLabel: string; doneTitle: string; doneSub: string; onRun: () => void }) {
  if (state === "done") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/30 motion-safe:animate-[demo-fade_300ms_ease-out]">
        <Check className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-emerald-600 p-1 text-white" />
        <div>
          <p className="text-sm font-semibold text-charcoal dark:text-white">{doneTitle}</p>
          <p className="text-xs text-emerald-700 dark:text-emerald-300">{doneSub}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
      {state === "running" ? (
        <p className="flex items-center justify-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> {runningLabel}
        </p>
      ) : (
        <Button onClick={onRun}>{idleLabel}</Button>
      )}
    </div>
  );
}

function StatusLine({ label, ok, note }: { label: string; ok?: boolean; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="flex items-center gap-2 text-sm text-charcoal dark:text-slate-200">
        <span className={cn("flex h-4 w-4 items-center justify-center rounded-full", ok ? "bg-emerald-600" : "bg-slate-300")}><Check className="h-3 w-3 text-white" /></span>
        {label}
      </span>
      {note && <span className="text-xs text-slate-400">{note}</span>}
    </div>
  );
}
