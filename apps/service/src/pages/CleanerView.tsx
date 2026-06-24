import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Navigation, MapPin, Play, Camera, CheckSquare, RotateCcw,
  CheckCircle2, Lock, Clock, Truck,
} from "lucide-react";
import { getSession, sendAction, type SessionState, type DayStatus, type DemoAction } from "../api";

const STEPS: DayStatus[] = ["confirmed", "en_route", "arrived", "in_progress", "awaiting_checkout", "completed"];
const STEP_LABELS: Record<DayStatus, string> = {
  confirmed: "Confirmed", en_route: "En Route", arrived: "Arrived",
  in_progress: "Cleaning", awaiting_checkout: "Finishing up", completed: "Completed",
};

export function CleanerView() {
  const { txId } = useParams<{ txId: string }>();
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastErr, setLastErr] = useState("");

  const load = useCallback(async () => {
    if (!txId) return;
    try {
      setState(await getSession(txId));
    } catch {
      setError("Session not found.");
    }
  }, [txId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  async function act(action: DemoAction) {
    if (!txId) return;
    setBusy(true);
    setLastErr("");
    try {
      await sendAction(txId, action);
      await load();
    } catch (e: unknown) {
      setLastErr((e as Error).message ?? "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <FullError msg={error} />;
  if (!state) return <Spinner />;

  const stepIdx = STEPS.indexOf(state.dayStatus);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-seafoam-100">
            <Truck className="h-4 w-4 text-seafoam-600" />
          </span>
          <div>
            <p className="text-sm font-bold text-charcoal">Cleaner — {state.cleaner.name}</p>
            <p className="text-xs text-slate-400 font-mono">{txId?.slice(0, 8)}</p>
          </div>
        </div>
        <button onClick={() => act("reset")} disabled={busy}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-40">
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* Stepper */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-0">
            {STEPS.map((step, i) => {
              const done = i < stepIdx;
              const active = i === stepIdx;
              return (
                <div key={step} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center gap-0.5">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                      done ? "bg-emerald-500 text-white" : active ? "bg-seafoam-500 text-white" : "bg-slate-100 text-slate-400"
                    }`}>
                      {done ? "✓" : i + 1}
                    </div>
                    <span className={`text-[9px] text-center leading-tight ${active ? "text-seafoam-600 font-semibold" : "text-slate-300"}`}>
                      {STEP_LABELS[step]}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mb-3.5 mx-0.5 ${i < stepIdx ? "bg-emerald-400" : "bg-slate-100"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Job info */}
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          <InfoRow icon={Clock} label="Service" value={state.job.service_type} />
          <InfoRow icon={Clock} label="Scheduled" value={new Date(state.job.scheduled_at).toLocaleString()} />
          {state.dayStatus !== "confirmed" ? (
            <InfoRow icon={MapPin} label="Address" value={state.customer.address} />
          ) : (
            <InfoRow icon={MapPin} label="Address" value="Revealed when you start route" muted />
          )}
          {state.accessCodeRevealed && (
            <div className="px-4 py-3 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 shrink-0">
                <Lock className="h-4 w-4 text-amber-500" />
              </span>
              <div>
                <p className="text-xs text-slate-400">Access code</p>
                <p className="text-sm font-semibold text-amber-800">
                  {state.job.access_code.type}: {state.job.access_code.value}
                </p>
                <p className="text-xs text-slate-400">{state.job.access_code.notes}</p>
              </div>
            </div>
          )}
          {state.photoCount > 0 && (
            <InfoRow icon={Camera} label="Photos taken" value={`${state.photoCount}`} />
          )}
        </div>

        {/* Action buttons */}
        {lastErr && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600">{lastErr}</div>
        )}

        <div className="space-y-2">
          {state.dayStatus === "confirmed" && (
            <ActionBtn icon={Navigation} label="Start Route — reveal address" onClick={() => act("start_route")} busy={busy} />
          )}
          {state.dayStatus === "en_route" && (
            <>
              <div className="rounded-lg bg-seafoam-50 border border-seafoam-200 px-4 py-3 text-sm text-seafoam-700 flex items-center gap-2">
                <Navigation className="h-4 w-4 animate-pulse" /> Simulated GPS tracking active…
              </div>
              <ActionBtn icon={MapPin} label="Simulate arrival (bypass GPS)" onClick={() => act("simulate_arrival")} busy={busy} variant="secondary" />
            </>
          )}
          {state.dayStatus === "arrived" && (
            <ActionBtn icon={Play} label="Start Clean — reveal access code" onClick={() => act("start_clean")} busy={busy} />
          )}
          {state.dayStatus === "in_progress" && (
            <>
              <ActionBtn icon={Camera} label="Add photo" onClick={() => act("add_photo")} busy={busy} variant="secondary" />
              <ActionBtn icon={CheckSquare} label="Finish Clean" onClick={() => act("finish_clean")} busy={busy} />
            </>
          )}
          {state.dayStatus === "awaiting_checkout" && (
            <ActionBtn icon={Camera} label="Take checkout photo & complete job" onClick={() => act("checkout")} busy={busy} />
          )}
          {state.dayStatus === "completed" && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3">
              <CheckCircle2 className="h-7 w-7 text-emerald-500 shrink-0" />
              <div>
                <p className="font-semibold text-emerald-800 text-sm">Job complete!</p>
                <p className="text-xs text-emerald-600">Payment will be released after review.</p>
              </div>
            </div>
          )}
        </div>

        <div className="text-center pt-2">
          <Link to="/" className="text-xs text-slate-400 hover:text-slate-600">← Back to demo landing</Link>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  icon: Icon, label, onClick, busy, variant = "primary",
}: {
  icon: typeof Navigation;
  label: string;
  onClick: () => void;
  busy: boolean;
  variant?: "primary" | "secondary";
}) {
  const cls = variant === "primary"
    ? "bg-seafoam-500 hover:bg-seafoam-600 text-white"
    : "bg-white hover:bg-slate-50 text-charcoal border border-slate-200";
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${cls}`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function InfoRow({ icon: Icon, label, value, muted }: { icon: typeof Clock; label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-seafoam-50 shrink-0">
        <Icon className="h-4 w-4 text-seafoam-600" />
      </span>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className={`text-sm font-medium ${muted ? "text-slate-400 italic" : "text-charcoal"}`}>{value}</p>
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
