/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Team Cleans — task decomposition + labor-balanced allocation.
 *
 * Two pure, deterministic, DB-free stages (docs/team-cleans-audit.md §26–29):
 *
 *  1. decomposeBookingIntoTasks(booking, v2Quote) — turn a Pricing v2 quote into
 *     discrete work units. Minutes are NEVER invented: rooms come from the
 *     quote's per-room labor (roomInference / room.* components), extras from
 *     the quote's extra.* components, and whole-home setup/size from the
 *     operational + size components. Solo/legacy bookings (no v2 quote) yield no
 *     tasks and keep behaving as before.
 *
 *  2. allocateTasks(tasks, crewSeats, cfg) — a greedy longest-processing-time
 *     load balancer (§75): sort tasks by minutes DESC; assign each to the
 *     ELIGIBLE crew member (respecting required_qualification) with the lowest
 *     current workload; the LEAD's workload is SEEDED with
 *     cfg.leadOverheadMinutes (walkthrough / coordination / completion) so the
 *     lead ends up cleaning less. A bounded rebalance pass then swaps tasks to
 *     shrink the workload spread. Balance is over LABOR MINUTES, not room count.
 *
 * Plus reallocateForFinishedCleaner(...) for the dynamic §29 pickup: when a
 * cleaner finishes their own tasks they absorb remaining pending team tasks.
 *
 * All minutes are integers. No floats reach a stored value.
 */

import type { CrewConfig } from "./crewConfig";
import type { CrewRole } from "./types";
import type { QuoteResultV2 } from "@sweepr/quote-engine";

// ─── Decomposition ───────────────────────────────────────────────────────────

export type TaskType = "room" | "extra" | "operational" | "clutter" | "size";

/** A decomposed unit of work, mirroring a cleaning_tasks row (pre-persist). */
export interface DecomposedTask {
  /** Canonical v2 room type for room tasks; null for extras / overhead. */
  roomType: string | null;
  areaLabel: string;
  /** Booking cleaning level or inferred condition band; null where N/A. */
  cleaningLevel: string | null;
  taskType: TaskType;
  estimatedMinutes: number;
  parallelizable: boolean;
  requiredQualification: string | null;
}

/** Minimal booking shape the decomposer needs (no DB row coupling). */
export interface DecomposeBookingInput {
  /** refresh / extra_attention / significant_attention — stamped onto rooms. */
  cleaningLevel?: string | null;
}

const ROOM_LABELS: Record<string, string> = {
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  bedroom: "Bedroom",
  living_room: "Living Room",
};

function roomLabel(roomType: string, count: number): string {
  const base = ROOM_LABELS[roomType] ?? roomType;
  return count > 1 ? `${base} ×${count}` : base;
}

/**
 * Build reasonably-grouped work units from a v2 quote. Rooms fold in their
 * matching clutter minutes (same room type stays one unit); extras are their
 * own units; whole-home setup/pack-down and the size adjustment fold into a
 * single non-parallelizable overhead unit. Every minute value is taken from the
 * quote engine — nothing is fabricated.
 */
export function decomposeBookingIntoTasks(
  booking: DecomposeBookingInput,
  v2Quote: QuoteResultV2 | null | undefined,
): DecomposedTask[] {
  if (!v2Quote) return [];

  const components = v2Quote.components ?? [];
  const tasks: DecomposedTask[] = [];

  // Index clutter minutes by room type so they can fold into the room unit.
  const clutterByType = new Map<string, number>();
  for (const c of components) {
    if (c.code.startsWith("clutter.")) {
      const roomType = c.code.split(".")[1] ?? "";
      clutterByType.set(roomType, (clutterByType.get(roomType) ?? 0) + c.laborMinutes);
    }
  }

  // Rooms — driven by the quote's per-room inference (authoritative minutes).
  for (const room of v2Quote.roomInference ?? []) {
    const clutter = clutterByType.get(room.roomType) ?? 0;
    const minutes = Math.round(room.expectedLaborMinutes + clutter);
    if (minutes <= 0) continue;
    tasks.push({
      roomType: room.roomType,
      areaLabel: roomLabel(room.roomType, room.count),
      cleaningLevel: booking.cleaningLevel ?? `level_${room.reportedMaximumLevel}`,
      taskType: "room",
      estimatedMinutes: minutes,
      parallelizable: true,
      requiredQualification: null,
    });
  }

  // Extras — one unit each (inside_oven, inside_fridge, …). Labor + fixed-only
  // extras both surface here; only ones with real work minutes become tasks.
  for (const c of components) {
    if (!c.code.startsWith("extra.")) continue;
    const minutes = Math.round(c.laborMinutes);
    if (minutes <= 0) continue;
    tasks.push({
      roomType: null,
      areaLabel: c.label,
      cleaningLevel: null,
      taskType: "extra",
      estimatedMinutes: minutes,
      parallelizable: true,
      requiredQualification: null,
    });
  }

  // Whole-home overhead: setup / pack-down / transitions + size adjustment,
  // combined into one non-parallelizable unit.
  let overheadMinutes = 0;
  for (const c of components) {
    if (c.code === "operational.setup_packdown" || c.code === "size.adjustment") {
      overheadMinutes += c.laborMinutes;
    }
  }
  overheadMinutes = Math.round(overheadMinutes);
  if (overheadMinutes > 0) {
    tasks.push({
      roomType: null,
      areaLabel: "Setup, transitions & home size",
      cleaningLevel: null,
      taskType: "operational",
      estimatedMinutes: overheadMinutes,
      parallelizable: false,
      requiredQualification: null,
    });
  }

  return tasks;
}

// ─── Allocation ──────────────────────────────────────────────────────────────

/** A task fed to the allocator (only the fields allocation reasons about). */
export interface AllocatableTask {
  /** Stable identity (a cleaning_tasks id, or a synthetic index). */
  id: string;
  estimatedMinutes: number;
  requiredQualification: string | null;
}

/** A crew seat available to take tasks. */
export interface CrewSeatInput {
  /** Stable seat identity (booking_crew_assignments id) — optional. */
  assignmentId?: string;
  /** The cleaner in the seat; null seats are skipped (unfilled). */
  cleanerId: string | null;
  role: CrewRole;
  seatIndex: number;
  /** Qualifications this cleaner holds (matched against requiredQualification). */
  qualifications?: string[];
}

/** Resulting workload for one crew member (explainable). */
export interface CleanerWorkload {
  cleanerId: string;
  seatIndex: number;
  role: CrewRole;
  /** Non-cleaning overhead seeded onto the lead (0 for members). */
  overheadMinutes: number;
  /** Sum of assigned task minutes (cleaning only). */
  taskMinutes: number;
  /** overheadMinutes + taskMinutes — the balanced quantity. */
  totalMinutes: number;
  taskIds: string[];
}

export interface AllocationResult {
  /** taskId → the seat/cleaner it was assigned to (null cleaner = unassignable). */
  assignments: Array<{ taskId: string; cleanerId: string | null; seatIndex: number | null }>;
  workloads: CleanerWorkload[];
  /** Tasks no eligible seat could take (missing qualification). */
  unassignable: string[];
}

interface Bucket {
  cleanerId: string;
  seatIndex: number;
  role: CrewRole;
  qualifications: Set<string>;
  overheadMinutes: number;
  taskMinutes: number;
  taskIds: string[];
}

function bucketTotal(b: Bucket): number {
  return b.overheadMinutes + b.taskMinutes;
}

function eligible(b: Bucket, task: AllocatableTask): boolean {
  if (!task.requiredQualification) return true;
  return b.qualifications.has(task.requiredQualification);
}

/**
 * Deterministic greedy longest-processing-time allocation with a rebalance
 * pass. Balances TOTAL minutes (lead overhead included), so the lead — seeded
 * with cfg.leadOverheadMinutes — ends up cleaning less than the members.
 */
export function allocateTasks(
  tasks: AllocatableTask[],
  crewSeats: CrewSeatInput[],
  cfg: Pick<CrewConfig, "leadOverheadMinutes">,
): AllocationResult {
  // Only filled seats can take work; keep a stable order by seatIndex.
  const buckets: Bucket[] = crewSeats
    .filter((s) => s.cleanerId != null)
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((s) => ({
      cleanerId: s.cleanerId as string,
      seatIndex: s.seatIndex,
      role: s.role,
      qualifications: new Set(s.qualifications ?? []),
      overheadMinutes: s.role === "LEAD" ? Math.max(0, Math.round(cfg.leadOverheadMinutes)) : 0,
      taskMinutes: 0,
      taskIds: [],
    }));

  const assignments: AllocationResult["assignments"] = [];
  const unassignable: string[] = [];

  if (buckets.length === 0) {
    for (const t of tasks) {
      assignments.push({ taskId: t.id, cleanerId: null, seatIndex: null });
      unassignable.push(t.id);
    }
    return { assignments, workloads: [], unassignable };
  }

  // Sort tasks by minutes DESC; tie-break on id for full determinism.
  const ordered = [...tasks].sort(
    (a, b) => b.estimatedMinutes - a.estimatedMinutes || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const bucketOf = new Map<string, Bucket>(); // taskId → bucket
  const taskById = new Map<string, AllocatableTask>();

  for (const task of ordered) {
    taskById.set(task.id, task);
    const candidates = buckets.filter((b) => eligible(b, task));
    if (candidates.length === 0) {
      assignments.push({ taskId: task.id, cleanerId: null, seatIndex: null });
      unassignable.push(task.id);
      continue;
    }
    // Lowest current workload wins; tie → lowest seatIndex (candidates already
    // ordered by seatIndex, so a stable min is deterministic).
    let best = candidates[0];
    for (const b of candidates) {
      if (bucketTotal(b) < bucketTotal(best)) best = b;
    }
    best.taskMinutes += task.estimatedMinutes;
    best.taskIds.push(task.id);
    bucketOf.set(task.id, best);
  }

  // ─── Rebalance pass: move a task from the heaviest bucket to a lighter,
  // eligible bucket when doing so strictly shrinks the (max − min) spread.
  // Bounded iterations → deterministic and terminating.
  const MAX_PASSES = tasks.length * buckets.length + 8;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let heaviest = buckets[0];
    for (const b of buckets) if (bucketTotal(b) > bucketTotal(heaviest)) heaviest = b;

    const spreadBefore = bucketTotal(heaviest) - Math.min(...buckets.map(bucketTotal));
    if (spreadBefore === 0) break;

    let moved = false;
    // Try moving the SMALLEST task on the heaviest bucket first (least disruptive).
    const movable = [...heaviest.taskIds].sort((a, b) => {
      const ma = taskById.get(a)?.estimatedMinutes ?? 0;
      const mb = taskById.get(b)?.estimatedMinutes ?? 0;
      return ma - mb || (a < b ? -1 : 1);
    });

    for (const taskId of movable) {
      const task = taskById.get(taskId);
      if (!task) continue;
      // Candidate destination buckets: eligible, lighter, not the source.
      const dests = buckets
        .filter((b) => b !== heaviest && eligible(b, task))
        .sort((a, b) => bucketTotal(a) - bucketTotal(b) || a.seatIndex - b.seatIndex);
      for (const dest of dests) {
        const newHeavy = bucketTotal(heaviest) - task.estimatedMinutes;
        const newDest = bucketTotal(dest) + task.estimatedMinutes;
        // The spread after the move (recomputed over all buckets).
        const totalsAfter = buckets.map((b) =>
          b === heaviest ? newHeavy : b === dest ? newDest : bucketTotal(b),
        );
        const spreadAfter = Math.max(...totalsAfter) - Math.min(...totalsAfter);
        if (spreadAfter < spreadBefore) {
          heaviest.taskMinutes -= task.estimatedMinutes;
          heaviest.taskIds = heaviest.taskIds.filter((id) => id !== taskId);
          dest.taskMinutes += task.estimatedMinutes;
          dest.taskIds.push(taskId);
          bucketOf.set(taskId, dest);
          moved = true;
          break;
        }
      }
      if (moved) break;
    }
    if (!moved) break;
  }

  for (const [taskId, b] of bucketOf) {
    assignments.push({ taskId, cleanerId: b.cleanerId, seatIndex: b.seatIndex });
  }

  const workloads: CleanerWorkload[] = buckets
    .map((b) => ({
      cleanerId: b.cleanerId,
      seatIndex: b.seatIndex,
      role: b.role,
      overheadMinutes: b.overheadMinutes,
      taskMinutes: b.taskMinutes,
      totalMinutes: bucketTotal(b),
      taskIds: b.taskIds,
    }))
    .sort((a, b) => a.seatIndex - b.seatIndex);

  return { assignments, workloads, unassignable };
}

// ─── Dynamic pickup (§29) ────────────────────────────────────────────────────

/** A live task row for dynamic reallocation. */
export interface LiveTask {
  id: string;
  estimatedMinutes: number;
  requiredQualification: string | null;
  assignedCleanerId: string | null;
  status: "pending" | "in_progress" | "complete";
}

export interface ReassignmentPlan {
  /** taskId → cleaner who should now own it. */
  reassignments: Array<{ taskId: string; fromCleanerId: string | null; toCleanerId: string }>;
}

/**
 * When `finishedCleanerId` has completed all of their own tasks, let them pick
 * up remaining PENDING tasks currently owned by still-working teammates, most
 * expensive first, subject to qualification. Deterministic; returns the plan so
 * the caller persists it (and can rebalance the underlying seats). Only pending
 * (not started/complete) tasks move — never take work out of someone's hands
 * mid-task.
 */
export function reallocateForFinishedCleaner(
  tasks: LiveTask[],
  finishedCleanerId: string,
  finishedQualifications: string[] = [],
): ReassignmentPlan {
  const quals = new Set(finishedQualifications);

  // The finisher only picks up work if they truly have nothing pending/active.
  const finisherHasOpenWork = tasks.some(
    (t) => t.assignedCleanerId === finishedCleanerId && t.status !== "complete",
  );
  if (finisherHasOpenWork) return { reassignments: [] };

  const pickable = tasks
    .filter(
      (t) =>
        t.status === "pending" &&
        t.assignedCleanerId !== finishedCleanerId &&
        (!t.requiredQualification || quals.has(t.requiredQualification)),
    )
    .sort((a, b) => b.estimatedMinutes - a.estimatedMinutes || (a.id < b.id ? -1 : 1));

  return {
    reassignments: pickable.map((t) => ({
      taskId: t.id,
      fromCleanerId: t.assignedCleanerId,
      toCleanerId: finishedCleanerId,
    })),
  };
}
