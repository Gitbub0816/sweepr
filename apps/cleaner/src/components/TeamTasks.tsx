/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Button, toast } from "@sweepr/ui";
import { CheckCircle2, Circle, ListChecks, Clock } from "lucide-react";

type Fetcher = (path: string, opts?: RequestInit) => Promise<Response>;

interface Task {
  id: string;
  roomType: string | null;
  areaLabel: string;
  taskType: string;
  estimatedMinutes: number;
  assignedCleanerId: string | null;
  status: "pending" | "in_progress" | "complete";
}

/** Humanize a snake/lower task or room token for display. */
function humanize(v: string): string {
  return v.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * The caller's own task board for a team clean: the labor-balanced tasks the
 * backend assigned to them. Marking one done can hand them a remaining team task
 * (the backend reallocates), so we always reload after a completion. Renders
 * nothing when task allocation is off or there are no tasks for this cleaner.
 */
export function TeamTasks({
  bookingId,
  authFetch,
  myCleanerId,
}: {
  bookingId: string;
  authFetch: Fetcher;
  myCleanerId: string | null;
}) {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`/jobs/bookings/${bookingId}/tasks`);
      if (!res.ok) {
        setTasks([]);
        return;
      }
      const data = (await res.json()) as { tasks: Task[] };
      setTasks(data.tasks ?? []);
    } catch {
      setTasks([]);
    }
  }, [authFetch, bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  async function complete(taskId: string) {
    setBusyId(taskId);
    try {
      const res = await authFetch(`/jobs/bookings/${bookingId}/tasks/${taskId}/complete`, { method: "POST" });
      if (!res.ok) {
        toast.error(t("cleaner.team.taskError"));
        return;
      }
      await load();
    } catch {
      toast.error(t("cleaner.team.taskError"));
    } finally {
      setBusyId(null);
    }
  }

  if (!tasks) return null;
  const mine = myCleanerId ? tasks.filter((t) => t.assignedCleanerId === myCleanerId) : [];
  if (mine.length === 0) return null;

  const remaining = mine.filter((t) => t.status !== "complete").length;

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-600">
          <ListChecks className="h-4 w-4 text-seafoam-700" /> {t("cleaner.team.tasks")}
        </p>
        <span className="text-xs text-slate-500">
          {t("cleaner.team.tasksRemaining", { count: remaining })}
        </span>
      </div>
      <ul className="space-y-2">
        {mine.map((task) => {
          const done = task.status === "complete";
          return (
            <li
              key={task.id}
              className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800"
            >
              <span aria-hidden className={done ? "text-emerald-500" : "text-slate-300"}>
                {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${done ? "text-slate-400 line-through" : "text-charcoal dark:text-white"}`}>
                  {task.areaLabel || humanize(task.roomType ?? "")}
                </p>
                <p className="flex items-center gap-1 text-xs text-slate-500">
                  {humanize(task.taskType)}
                  <span aria-hidden>·</span>
                  <Clock className="h-3 w-3" aria-hidden />
                  {t("cleaner.team.taskMinutes", { minutes: task.estimatedMinutes })}
                </p>
              </div>
              {done ? (
                <span className="text-xs font-medium text-emerald-600">{t("cleaner.team.taskDone")}</span>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => complete(task.id)} loading={busyId === task.id}>
                  {t("cleaner.team.markDone")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
