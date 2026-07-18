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
  Check,
  Truck,
  Home as HomeIcon,
  Sparkles,
  CalendarClock,
  Star,
  Heart,
  RefreshCw,
  XCircle,
  Play,
} from "lucide-react";
import { Button, Badge, Textarea, SuccessCheck } from "@sweepr/ui";
import { JOB_STATUS_LABELS, TRACKING_STEPS, formatCurrency, cn } from "@sweepr/utils";
import type { JobStatus } from "@sweepr/types";
import { DemoChrome } from "../demo/DemoChrome";

const STEPS = ["Scheduled", "On the way", "In progress", "Complete", "Review"];

const STATUS_ICON: Partial<Record<JobStatus, typeof Truck>> = {
  booked: CalendarClock,
  confirmed: Check,
  cleaner_on_the_way: Truck,
  arrived: HomeIcon,
  in_progress: Sparkles,
  completed: Check,
};

const TIP_PRESETS = [10, 15, 20];
const BASE_TOTAL = 249;

export function ManageFlow() {
  const [statusIdx, setStatusIdx] = useState(0);
  const [tip, setTip] = useState<number | null>(null);
  const [tipSent, setTipSent] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewSent, setReviewSent] = useState(false);
  const [rescheduled, setRescheduled] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const reset = () => {
    setStatusIdx(0);
    setTip(null);
    setTipSent(false);
    setRating(0);
    setReviewText("");
    setReviewSent(false);
    setRescheduled(false);
    setCancelled(false);
  };

  const status = TRACKING_STEPS[statusIdx];
  const done = status === "completed";
  const stepperIdx = Math.min(4, done ? (reviewSent ? 4 : 3) : Math.max(0, statusIdx - 1));

  if (cancelled) {
    return (
      <DemoChrome title="Manage a booking" persona="Customer, Alex Rivera" steps={STEPS} current={0} onReset={reset}>
        <div className="mx-auto max-w-md py-10 text-center">
          <XCircle className="mx-auto h-14 w-14 text-slate-300" />
          <h2 className="mt-4 text-xl font-bold text-charcoal dark:text-white">Booking cancelled</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Your authorized hold was released. No charge was made.</p>
          <Button className="mt-6" variant="secondary" onClick={reset}>Restore booking</Button>
        </div>
      </DemoChrome>
    );
  }

  return (
    <DemoChrome title="Manage a booking" persona="Customer, Alex Rivera" steps={STEPS} current={stepperIdx} onReset={reset}>
      <div className="space-y-5">
        {/* Summary header */}
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Deep Clean</p>
            <p className="mt-1 text-lg font-bold text-charcoal dark:text-white">742 Evergreen Terrace</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {rescheduled ? "Sat, rescheduled to 2:00 PM" : "Thu · 10:00 AM"} · with Jordan S.
            </p>
          </div>
          <Badge variant={done ? "success" : "info"}>{JOB_STATUS_LABELS[status]}</Badge>
        </div>

        {/* Live tracker */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-4 text-sm font-semibold text-charcoal dark:text-white">Live status</p>
          <ol className="space-y-0">
            {TRACKING_STEPS.map((st, i) => {
              const reached = i <= statusIdx;
              const active = i === statusIdx;
              const Icon = STATUS_ICON[st] ?? Check;
              return (
                <li key={st} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-300", reached ? "bg-seafoam-600 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800")}>
                      <Icon className="h-4 w-4" />
                    </span>
                    {i < TRACKING_STEPS.length - 1 && <span className={cn("my-0.5 w-0.5 flex-1 rounded-full transition-colors duration-300", i < statusIdx ? "bg-seafoam-400" : "bg-slate-200 dark:bg-slate-800")} style={{ minHeight: 20 }} />}
                  </div>
                  <div className={cn("pb-4 pt-1", !reached && "opacity-50")}>
                    <p className="text-sm font-medium text-charcoal dark:text-white">{JOB_STATUS_LABELS[st]}</p>
                    {active && <p className="text-xs text-seafoam-700 dark:text-seafoam-300">Happening now</p>}
                  </div>
                </li>
              );
            })}
          </ol>

          {!done ? (
            <Button fullWidth variant="secondary" className="mt-1" onClick={() => setStatusIdx((i) => Math.min(TRACKING_STEPS.length - 1, i + 1))}>
              <Play className="h-4 w-4" /> Advance cleaner (demo)
            </Button>
          ) : (
            <div className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-seafoam-50 py-2.5 text-sm font-medium text-seafoam-800 dark:bg-seafoam-950/40 dark:text-seafoam-200">
              <Check className="h-4 w-4" /> Clean complete
            </div>
          )}
        </div>

        {/* Pre-completion affordances */}
        {!done && (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setRescheduled(true)}>
              <RefreshCw className="h-4 w-4" /> {rescheduled ? "Rescheduled" : "Reschedule"}
            </Button>
            <Button variant="ghost" onClick={() => setCancelled(true)}>
              <XCircle className="h-4 w-4" /> Cancel
            </Button>
          </div>
        )}

        {/* Tip */}
        {done && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 motion-safe:animate-[demo-fade_320ms_ease-out]">
            {tipSent ? (
              <div className="flex items-center gap-3">
                <Heart className="h-6 w-6 fill-rose-400 text-rose-400" />
                <div>
                  <p className="text-sm font-semibold text-charcoal dark:text-white">Tip sent to Jordan</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{formatCurrency(tipAmount(tip, BASE_TOTAL))} · 100% goes to your cleaner</p>
                </div>
              </div>
            ) : (
              <>
                <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-charcoal dark:text-white"><Heart className="h-4 w-4 text-rose-400" /> Add a tip</p>
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Tips are separate, charged immediately, and go 100% to Jordan.</p>
                <div className="flex flex-wrap gap-2">
                  {TIP_PRESETS.map((p) => (
                    <button key={p} type="button" onClick={() => setTip(p)} className={cn("rounded-full border px-4 py-1.5 text-sm font-medium transition-colors", tip === p ? "border-seafoam-500 bg-seafoam-600 text-white" : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300")}>
                      {p}% · {formatCurrency(tipAmount(p, BASE_TOTAL))}
                    </button>
                  ))}
                  <button type="button" onClick={() => setTip(0)} className={cn("rounded-full border px-4 py-1.5 text-sm font-medium transition-colors", tip === 0 ? "border-slate-400 bg-slate-100 text-charcoal dark:bg-slate-800 dark:text-white" : "border-slate-200 text-slate-500 dark:border-slate-700")}>No tip</button>
                </div>
                <Button className="mt-4" fullWidth disabled={tip === null} onClick={() => setTipSent(true)}>
                  {tip ? `Send ${formatCurrency(tipAmount(tip, BASE_TOTAL))} tip` : "Continue without tip"}
                </Button>
              </>
            )}
          </div>
        )}

        {/* Review */}
        {done && tipSent && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 motion-safe:animate-[demo-fade_320ms_ease-out]">
            {reviewSent ? (
              <div className="py-2 text-center">
                <div className="flex justify-center"><SuccessCheck size={56} label="Review submitted" /></div>
                <p className="mt-3 text-sm font-semibold text-charcoal dark:text-white">Thanks for the review</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{rating} star{rating !== 1 ? "s" : ""} for Jordan. This flow is complete.</p>
              </div>
            ) : (
              <>
                <p className="mb-3 text-sm font-semibold text-charcoal dark:text-white">How was your clean?</p>
                <div className="mb-3 flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} stars`} className="transition-transform duration-100 [@media(hover:hover)]:hover:scale-110 [@media(hover:hover)]:active:scale-95">
                      <Star className={cn("h-8 w-8", n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600")} />
                    </button>
                  ))}
                </div>
                <Textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="Tell others what stood out (optional)" rows={3} />
                <Button className="mt-3" fullWidth disabled={rating === 0} onClick={() => setReviewSent(true)}>Submit review</Button>
              </>
            )}
          </div>
        )}
      </div>
    </DemoChrome>
  );
}

function tipAmount(pct: number | null, base: number) {
  return Math.round(((pct ?? 0) / 100) * base);
}
