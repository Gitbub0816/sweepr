import { useState } from "react";
import { DashboardShell, Card, Button, toast } from "@sweepr/ui";
import { cn } from "@sweepr/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"];

export function SchedulePage() {
  const [available, setAvailable] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    DAYS.forEach((d) =>
      SLOTS.forEach((s) => {
        init[`${d}-${s}`] = !["Sat", "Sun"].includes(d) && s !== "18:00";
      })
    );
    return init;
  });

  const toggle = (key: string) =>
    setAvailable((a) => ({ ...a, [key]: !a[key] }));

  return (
    <DashboardShell
      title="Availability"
      description="Tap slots to mark when you're available to work."
      actions={
        <Button onClick={() => toast.success("Availability saved")}>
          Save
        </Button>
      }
    >
      <Card className="overflow-x-auto">
        <table className="w-full text-center text-sm">
          <thead>
            <tr>
              <th className="p-2" />
              {DAYS.map((d) => (
                <th key={d} className="p-2 text-slate-500">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((s) => (
              <tr key={s}>
                <td className="p-2 text-xs text-slate-400">{s}</td>
                {DAYS.map((d) => {
                  const key = `${d}-${s}`;
                  const on = available[key];
                  return (
                    <td key={key} className="p-1">
                      <button
                        onClick={() => toggle(key)}
                        className={cn(
                          "h-9 w-full rounded-lg border text-xs transition-colors",
                          on
                            ? "border-seafoam-400 bg-seafoam-500 text-white"
                            : "border-slate-200 text-slate-300 hover:border-seafoam-300 dark:border-slate-700"
                        )}
                      >
                        {on ? "On" : "—"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </DashboardShell>
  );
}
