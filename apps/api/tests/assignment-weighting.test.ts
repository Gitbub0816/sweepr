import { describe, it, expect } from "vitest";
import { weightedAssignmentOrder, type MatchScore } from "../src/lib/matching";

function mk(id: string, score: number): MatchScore {
  return {
    cleanerId: id,
    score,
    breakdown: {
      availability: 0, serviceArea: 0, rating: 0,
      acceptance: 0, pastInteraction: 0, tier: 0, fairness: 0,
    },
  };
}

describe("weightedAssignmentOrder", () => {
  it("returns every candidate exactly once (a permutation)", () => {
    const input = [mk("a", 90), mk("b", 60), mk("c", 30), mk("d", 10)];
    const out = weightedAssignmentOrder(input);
    expect(out).toHaveLength(4);
    expect(new Set(out.map((s) => s.cleanerId))).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("passes through 0 or 1 candidates unchanged", () => {
    expect(weightedAssignmentOrder([])).toEqual([]);
    const one = [mk("solo", 42)];
    expect(weightedAssignmentOrder(one).map((s) => s.cleanerId)).toEqual(["solo"]);
  });

  it("leans toward higher scores but is NOT deterministic (mostly chance)", () => {
    const input = [mk("top", 100), mk("mid", 55), mk("low", 20)];
    const firstPickCounts: Record<string, number> = { top: 0, mid: 0, low: 0 };
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const winner = weightedAssignmentOrder(input)[0].cleanerId;
      firstPickCounts[winner]++;
    }
    // The best score should win most often...
    expect(firstPickCounts.top).toBeGreaterThan(firstPickCounts.mid);
    expect(firstPickCounts.mid).toBeGreaterThan(firstPickCounts.low);
    // ...but every candidate keeps a real shot (floor weight): the lowest still
    // wins a meaningful share, and the top does NOT win every time.
    expect(firstPickCounts.low / N).toBeGreaterThan(0.05);
    expect(firstPickCounts.top / N).toBeLessThan(0.9);
  });

  it("gives near-equal scores near-equal odds", () => {
    const input = [mk("x", 70), mk("y", 71)];
    const counts: Record<string, number> = { x: 0, y: 0 };
    const N = 3000;
    for (let i = 0; i < N; i++) counts[weightedAssignmentOrder(input)[0].cleanerId]++;
    // Within ~15% of a coin flip.
    expect(Math.abs(counts.x - counts.y) / N).toBeLessThan(0.15);
  });
});
