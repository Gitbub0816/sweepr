import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { User, MapPin, Clock, CheckCircle2, Navigation, Play, CheckSquare } from "lucide-react";
import { getSession, type SessionState, type DayStatus } from "../api";

const STEPS: DayStatus[] = ["confirmed", "en_route", "arrived", "in_progress", "awaiting_checkout", "completed"];
const STEP_LABELS: Record<DayStatus, string> = {
  confirmed: "Booking confirmed",
  en_route: "Cleaner en route",
  arrived: "Cleaner arrived",
  in_progress: "Cleaning in progress",
  awaiting_checkout: "Finishing up",
  completed: "Completed",
};
const STEP_ICONS: Record<DayStatus, typeof Clock> = {
  confirmed: CheckCircle2,
  en_route: Navigation,
  arrived: MapPin,
  in_progress: Play,
  awaiting_checkout: CheckSquare,
  completed: CheckCircle2,
};
const STATUS_MSGS: Record<DayStatus, string> = {
  confirmed: "Your cleaner will be on their way on the scheduled day.",
  en_route: "Your cleaner is on their way. We'll notify you when they arrive.",
  arrived: "Your cleaner has arrived and is about to start.",
  in_progress: "Your home is being cleaned right now.",
  awaiting_checkout: "Your cleaner is wrapping up. Almost done!",
  completed: "Your clean is complete. Leave a review to let them know how it went.",
};

export function CustomerView() {
  const { txId } = useParams<{ txId: string }>();
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState("");
  const [pulse, setPulse] = useState(false);

  const load = useCallback(async () => {
    if (!txId) return;
    try {
      const next = await getSession(txId);
      setState((prev) => {
        if (prev && prev.dayStatus !== next.dayStatus) setPulse(true);
        return next;
      });
    } catch {
      setError("Session not found.");
    }
  }, [txId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (pulse) {
      const t = setTimeout(() => setPulse(false), 1200);
      return () => clearTimeout(t);
    }
  }, [pulse]);

  if (error) return <FullError msg={error} />;
  if (!state) return <Spinner />;

  const stepIdx = STEPS.indexOf(state.dayStatus);
  const isActive = state.dayStatus !== "completed" && state.dayStatus !== "confirmed";
  const StatusIcon = STEP_ICONS[state.dayStatus];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100">
          <User className="h-4 w-4 text-violet-600" />
        </span>
        <div>
          <p className="text-sm font-bold text-charcoal">Customer — {state.customer.name}</p>
          <p className="text-xs text-slate-400 font-mono">{txId?.slice(0, 8)}</p>
        </div>
        {isActive && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
        )}
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* Current status hero */}
        <div className={`rounded-xl p-5 text-center transition-all duration-500 ${
          pulse ? "bg-seafoam-100 border-2 border-seafoam-400" : "bg-white border border-slate-200"
        }`}>
          <div className={`inline-flex h-14 w-14 items-center justify-center rounded-full mb-3 ${
            state.dayStatus === "completed" ? "bg-emerald-100" : "bg-seafoam-100"
          }`}>
            <StatusIcon className={`h-7 w-7 ${state.dayStatus === "completed" ? "text-emerald-600" : "text-seafoam-600"}`} />
          </div>
          <p className="text-lg font-bold text-charcoal">{STEP_LABELS[state.dayStatus]}</p>
          <p className="mt-1 text-sm text-slate-500">{STATUS_MSGS[state.dayStatus]}</p>
        </div>

        {/* Cleaner info */}
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-seafoam-100 text-seafoam-700 font-bold text-base shrink-0">
            {state.cleaner.name.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold text-charcoal">{state.cleaner.name}</p>
            <p className="text-xs text-slate-400">★ {state.cleaner.rating} · {state.cleaner.jobs} jobs</p>
          </div>
        </div>

        {/* Timeline tracker */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Timeline</p>
          <ol className="space-y-0">
            {STEPS.map((step, i) => {
              const done = i < stepIdx;
              const current = i === stepIdx;
              const last = i === STEPS.length - 1;
              const StepIcon = STEP_ICONS[step];
              return (
                <li key={step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                      done ? "bg-emerald-500 text-white" : current ? "bg-seafoam-500 text-white" : "bg-slate-100 text-slate-300"
                    }`}>
                      <StepIcon className="h-3.5 w-3.5" />
                    </span>
                    {!last && (
                      <span className={`my-0.5 w-0.5 flex-1 ${done ? "bg-emerald-400" : "border-l border-dashed border-slate-200"}`}
                        style={{ minHeight: 20 }} />
                    )}
                  </div>
                  <p className={`pb-5 text-sm leading-tight pt-0.5 ${
                    done || current ? "font-medium text-charcoal" : "text-slate-300"
                  }`}>
                    {STEP_LABELS[step]}
                    {current && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-seafoam-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-seafoam-500 animate-pulse" /> now
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Job details */}
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          <DetailRow icon={Clock} label="Service" value={state.job.service_type} />
          <DetailRow icon={Clock} label="Scheduled" value={new Date(state.job.scheduled_at).toLocaleString()} />
          <DetailRow icon={MapPin} label="Address" value={state.customer.address} />
        </div>

        {state.dayStatus === "completed" && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            <p className="font-semibold text-emerald-800 text-sm">Your home is clean!</p>
            <p className="text-xs text-emerald-600 mt-0.5">Your cleaner has checked out. Review will be available shortly.</p>
          </div>
        )}

        <div className="text-center pt-2">
          <Link to="/" className="text-xs text-slate-400 hover:text-slate-600">← Back to demo landing</Link>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 shrink-0">
        <Icon className="h-4 w-4 text-slate-400" />
      </span>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-medium text-charcoal">{value}</p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="h-8 w-8 rounded-full border-4 border-seafoam-400 border-t-transparent animate-spin" />
    </div>
  );
}

function FullError({ msg }: { msg: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3">
        <p className="text-lg font-bold text-charcoal">{msg}</p>
        <Link to="/" className="text-sm text-seafoam-600 hover:underline">← Back to demo landing</Link>
      </div>
    </div>
  );
}
