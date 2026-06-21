import { useState } from "react";
import { format } from "date-fns";
import { Modal } from "../primitives/Modal";
import { Button } from "../primitives/Button";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// 30-min increments, 6am–10pm.
function buildTimes(): string[] {
  const out: string[] = [];
  for (let m = 6 * 60; m <= 22 * 60; m += 30) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return out;
}
const TIMES = buildTimes();

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

export interface AddSlotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date?: Date | null;
  onCreate: (params: {
    type: "recurring" | "flexible" | "available_now";
    daysOfWeek: number[];
    startTime: string;
    endTime: string;
    date: Date | null;
  }) => void;
}

export function AddSlotModal({
  open,
  onOpenChange,
  date,
  onCreate,
}: AddSlotModalProps) {
  const [mode, setMode] = useState<"recurring" | "flexible" | "available_now">(
    "flexible"
  );
  const [days, setDays] = useState<number[]>(
    date ? [date.getDay()] : [1, 3, 5]
  );
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("16:00");

  const toggleDay = (d: number) =>
    setDays((cur) =>
      cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()
    );

  const preview =
    mode === "available_now"
      ? "You'll appear available right now for same-day jobs."
      : mode === "recurring"
        ? `You'll appear available ${
            days.length
              ? days.map((d) => DAY_LABELS[d]).join(", ")
              : "(pick days)"
          } ${fmtTime(start)} – ${fmtTime(end)}`
        : `You'll appear available ${
            date ? format(date, "EEEE, MMM d") : "(pick a date)"
          } ${fmtTime(start)} – ${fmtTime(end)}`;

  const canSave =
    mode === "available_now" ||
    (mode === "recurring" ? days.length > 0 : !!date);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add availability"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSave}
            onClick={() => {
              onCreate({
                type: mode,
                daysOfWeek: days,
                startTime: start,
                endTime: end,
                date: date ?? null,
              });
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["recurring", "Repeats weekly"],
              ["flexible", "Just this date"],
              ["available_now", "Available now"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${
                mode === value
                  ? "border-seafoam-400 bg-seafoam-50 text-seafoam-700 dark:bg-seafoam-900/20"
                  : "border-slate-200 text-slate-500 hover:border-seafoam-300 dark:border-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "recurring" && (
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">
              Days of week
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`h-9 w-11 rounded-lg border text-xs font-medium transition-colors ${
                    days.includes(i)
                      ? "border-seafoam-400 bg-seafoam-500 text-white"
                      : "border-slate-200 text-slate-400 hover:border-seafoam-300 dark:border-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode !== "available_now" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-500">
              Start time
              <select
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {TIMES.map((t) => (
                  <option key={t} value={t}>
                    {fmtTime(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500">
              End time
              <select
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {TIMES.map((t) => (
                  <option key={t} value={t}>
                    {fmtTime(t)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <p className="rounded-lg bg-seafoam-50 px-3 py-2 text-xs text-seafoam-700 dark:bg-slate-800 dark:text-seafoam-300">
          {preview}
        </p>
      </div>
    </Modal>
  );
}
