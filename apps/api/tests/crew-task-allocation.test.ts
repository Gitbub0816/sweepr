/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { describe, it, expect } from "vitest";
import { buildColdStartConfig, computeQuoteV2 } from "../src/lib/quoteEngine";
import type { QuoteInputV2 } from "../src/lib/quoteEngine";
import {
  allocateTasks,
  decomposeBookingIntoTasks,
  reallocateForFinishedCleaner,
  type AllocatableTask,
  type CrewSeatInput,
  type LiveTask,
} from "../src/lib/crew/taskAllocation";

// Decomposition + allocation are PURE functions (no DB), so the makeSql() mock
// from audit §12 is not needed here; the crewTasks ROUTER is what touches the DB.
const cfg = { leadOverheadMinutes: 20 };

function seats(n: number, opts?: { qualifications?: Record<number, string[]> }): CrewSeatInput[] {
  return Array.from({ length: n }, (_, i) => ({
    assignmentId: `seat-${i}`,
    cleanerId: `cleaner-${i}`,
    role: i === 0 ? ("LEAD" as const) : ("MEMBER" as const),
    seatIndex: i,
    qualifications: opts?.qualifications?.[i] ?? [],
  }));
}

function tasksFrom(minutes: number[], quals: (string | null)[] = []): AllocatableTask[] {
  return minutes.map((m, i) => ({
    id: `t${i}`,
    estimatedMinutes: m,
    requiredQualification: quals[i] ?? null,
  }));
}

describe("allocateTasks — balances LABOR minutes, not room count", () => {
  it("splits ~133 vs ~139 across two cleaners with UNEQUAL room counts", () => {
    // One heavy room (139) + four small rooms (45,40,30,18) = 272 min total.
    // A labor balancer puts the single 139-min room on one cleaner and the four
    // smaller rooms (133 min) on the other: near-equal LABOR, 1 room vs 4 rooms.
    const tasks = tasksFrom([139, 45, 40, 30, 18]);
    // Two MEMBER-style seats (no lead overhead) to isolate the balance property.
    const crew: CrewSeatInput[] = [
      { cleanerId: "a", role: "MEMBER", seatIndex: 0 },
      { cleanerId: "b", role: "MEMBER", seatIndex: 1 },
    ];
    const { workloads } = allocateTasks(tasks, crew, cfg);

    const totals = workloads.map((w) => w.totalMinutes).sort((x, y) => x - y);
    expect(totals).toEqual([133, 139]);

    // Room COUNTS are deliberately unequal (1 vs 4) — proof it balanced labor.
    const counts = workloads.map((w) => w.taskIds.length).sort((x, y) => x - y);
    expect(counts).toEqual([1, 4]);

    // Conservation: nothing lost or invented.
    const sum = workloads.reduce((s, w) => s + w.taskMinutes, 0);
    expect(sum).toBe(272);
  });

  it("is deterministic (same inputs → identical allocation)", () => {
    const t = tasksFrom([60, 55, 50, 45, 30, 20]);
    const a = allocateTasks(t, seats(3), cfg);
    const b = allocateTasks(t, seats(3), cfg);
    expect(a.workloads).toEqual(b.workloads);
  });
});

describe("allocateTasks — lead overhead", () => {
  it("gives the LEAD a lighter CLEANING load than members", () => {
    // Five equal 40-min tasks across LEAD + one MEMBER. Lead seeded with 20 min
    // of coordination overhead, so it should clean fewer minutes.
    const tasks = tasksFrom([40, 40, 40, 40, 40]);
    const { workloads } = allocateTasks(tasks, seats(2), cfg);

    const lead = workloads.find((w) => w.role === "LEAD")!;
    const member = workloads.find((w) => w.role === "MEMBER")!;

    expect(lead.overheadMinutes).toBe(20);
    expect(member.overheadMinutes).toBe(0);
    // The lead does strictly LESS cleaning than the member.
    expect(lead.taskMinutes).toBeLessThan(member.taskMinutes);
    // But TOTAL load (overhead + cleaning) stays balanced within one task.
    expect(Math.abs(lead.totalMinutes - member.totalMinutes)).toBeLessThanOrEqual(40);
  });
});

describe("allocateTasks — qualification constraints", () => {
  it("routes a qualified task only to the qualified cleaner", () => {
    // Task t0 needs 'deep_clean_certified'; only seat 1 holds it.
    const tasks = tasksFrom([100, 30, 30], ["deep_clean_certified", null, null]);
    const crew = seats(2, { qualifications: { 1: ["deep_clean_certified"] } });
    const { workloads, unassignable } = allocateTasks(tasks, crew, cfg);

    expect(unassignable).toEqual([]);
    const owner = workloads.find((w) => w.taskIds.includes("t0"))!;
    expect(owner.cleanerId).toBe("cleaner-1");
  });

  it("marks a task unassignable when no crew member is qualified", () => {
    const tasks = tasksFrom([100, 30], ["hazmat", null]);
    const crew = seats(2); // nobody has 'hazmat'
    const { unassignable } = allocateTasks(tasks, crew, cfg);
    expect(unassignable).toContain("t0");
  });
});

describe("reallocateForFinishedCleaner — dynamic pickup (§29)", () => {
  it("lets a finished cleaner pick up remaining pending team tasks", () => {
    const live: LiveTask[] = [
      { id: "own1", estimatedMinutes: 30, requiredQualification: null, assignedCleanerId: "A", status: "complete" },
      { id: "own2", estimatedMinutes: 40, requiredQualification: null, assignedCleanerId: "A", status: "complete" },
      { id: "teamPending", estimatedMinutes: 50, requiredQualification: null, assignedCleanerId: "B", status: "pending" },
      { id: "teamActive", estimatedMinutes: 20, requiredQualification: null, assignedCleanerId: "B", status: "in_progress" },
    ];
    const plan = reallocateForFinishedCleaner(live, "A");
    // A (all own tasks complete) picks up B's PENDING task, but never the
    // in-progress one (don't yank work mid-task).
    expect(plan.reassignments.map((r) => r.taskId)).toEqual(["teamPending"]);
    expect(plan.reassignments[0].toCleanerId).toBe("A");
  });

  it("does not reassign while the finisher still has open work", () => {
    const live: LiveTask[] = [
      { id: "own1", estimatedMinutes: 30, requiredQualification: null, assignedCleanerId: "A", status: "in_progress" },
      { id: "teamPending", estimatedMinutes: 50, requiredQualification: null, assignedCleanerId: "B", status: "pending" },
    ];
    expect(reallocateForFinishedCleaner(live, "A").reassignments).toEqual([]);
  });

  it("respects qualification when picking up", () => {
    const live: LiveTask[] = [
      { id: "own", estimatedMinutes: 30, requiredQualification: null, assignedCleanerId: "A", status: "complete" },
      { id: "needsCert", estimatedMinutes: 50, requiredQualification: "cert", assignedCleanerId: "B", status: "pending" },
    ];
    expect(reallocateForFinishedCleaner(live, "A", []).reassignments).toEqual([]);
    expect(reallocateForFinishedCleaner(live, "A", ["cert"]).reassignments.map((r) => r.taskId)).toEqual(["needsCert"]);
  });
});

describe("decomposeBookingIntoTasks — derives minutes from the v2 quote", () => {
  it("builds room + extra + overhead units straight from computeQuoteV2 output", () => {
    const config = buildColdStartConfig();
    const input: QuoteInputV2 = {
      serviceArea: "default",
      currency: "usd",
      counts: { kitchen: 1, bathroom: 2, bedroom: 3, living_room: 1 },
      conditions: { kitchen: 3, bathroom: 3, bedroom: 2, living_room: 2 },
      extras: [{ key: "inside_oven", quantity: 1 }],
    };
    const quote = computeQuoteV2(config, input, { pricingVersionId: "ver-test" });

    const tasks = decomposeBookingIntoTasks({ cleaningLevel: "extra_attention" }, quote);

    // Rooms present in the quote each become a task (minutes match the quote).
    const roomTasks = tasks.filter((t) => t.taskType === "room");
    expect(roomTasks.length).toBe(quote.roomInference.length);
    for (const room of quote.roomInference) {
      const task = roomTasks.find((t) => t.roomType === room.roomType)!;
      expect(task).toBeDefined();
      // Minutes are the quote's per-room labor (plus any clutter) — never invented.
      expect(task.estimatedMinutes).toBeGreaterThanOrEqual(room.expectedLaborMinutes);
      expect(task.cleaningLevel).toBe("extra_attention");
    }

    // The inside_oven extra is its own unit with the config's minutes (34).
    const oven = tasks.find((t) => t.taskType === "extra" && /oven/i.test(t.areaLabel))!;
    expect(oven).toBeDefined();
    expect(oven.estimatedMinutes).toBe(34);
    expect(oven.parallelizable).toBe(true);

    // A single non-parallelizable whole-home overhead unit exists.
    const overhead = tasks.filter((t) => t.taskType === "operational");
    expect(overhead.length).toBe(1);
    expect(overhead[0].parallelizable).toBe(false);

    // Every task carries positive integer minutes.
    for (const t of tasks) {
      expect(Number.isInteger(t.estimatedMinutes)).toBe(true);
      expect(t.estimatedMinutes).toBeGreaterThan(0);
    }
  });

  it("returns no tasks for a legacy booking without a v2 quote", () => {
    expect(decomposeBookingIntoTasks({ cleaningLevel: null }, null)).toEqual([]);
  });

  it("allocates decomposed tasks across a crew by labor", () => {
    const config = buildColdStartConfig();
    const quote = computeQuoteV2(
      config,
      {
        serviceArea: "default",
        currency: "usd",
        counts: { kitchen: 1, bathroom: 3, bedroom: 4, living_room: 2 },
        conditions: { kitchen: 4, bathroom: 3, bedroom: 3, living_room: 2 },
        extras: [
          { key: "inside_oven", quantity: 1 },
          { key: "inside_fridge", quantity: 1 },
        ],
      },
      { pricingVersionId: "ver-test" },
    );
    const decomposed = decomposeBookingIntoTasks({ cleaningLevel: "significant_attention" }, quote);
    const allocatable: AllocatableTask[] = decomposed.map((t, i) => ({
      id: `task-${i}`,
      estimatedMinutes: t.estimatedMinutes,
      requiredQualification: t.requiredQualification,
    }));

    const { workloads, unassignable } = allocateTasks(allocatable, seats(2), cfg);
    expect(unassignable).toEqual([]);

    // Balanced by labor: with two seats the final spread is bounded by the
    // largest indivisible task plus the lead's coordination overhead.
    const totals = workloads.map((w) => w.totalMinutes);
    const spread = Math.max(...totals) - Math.min(...totals);
    const largest = Math.max(...decomposed.map((t) => t.estimatedMinutes));
    expect(spread).toBeLessThanOrEqual(largest + cfg.leadOverheadMinutes);
  });
});
