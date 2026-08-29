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
 * Ordinal room-condition inference (Pricing v2, spec §5.2).
 *
 * The customer reports ONE maximum condition per room type; room counts are
 * known. The remaining same-type rooms are latent. This module computes the
 * posterior expected number of rooms at each level, per type, by:
 *
 *  1. Consensus rule: identical selections across every applicable room type
 *     apply that level to every counted room with probability 1.
 *  2. Otherwise: a cumulative-logit ordinal model with a latent whole-home
 *     tendency H. The reported maxima enter through the exact
 *     order-statistic likelihood P(max = s | H, N) = F(s)^N − F(s−1)^N; the
 *     posterior over H (discrete Gaussian grid) is combined with the exact
 *     conditional expected counts, truncated so no room exceeds its type's
 *     reported maximum.
 *
 * Everything here is deterministic, closed-form, and pure — identical inputs
 * and parameters always produce identical distributions. Probabilities are
 * floats by nature; they never touch currency directly (the engine converts
 * expected minutes to integers at one documented boundary).
 */

import type {
  ConditionLevel,
  InferenceParamsV2,
  RoomTypeV2,
} from "./types";
import { ROOM_TYPES_V2 } from "./types";

const EPS = 1e-12;

function sigmoid(x: number): number {
  // Numerically stable in both tails.
  return x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
}

/** CDF F(k | H) = P(L <= k) for k = 0..4 (F(0)=0, F(4)=1). */
function conditionCdf(
  params: InferenceParamsV2,
  type: RoomTypeV2,
  h: number,
): [number, number, number, number, number] {
  const t = params.thresholds[type];
  const b = params.betaHome[type];
  const f1 = sigmoid(t[0] - b * h);
  const f2 = sigmoid(t[1] - b * h);
  const f3 = sigmoid(t[2] - b * h);
  // Enforce monotonicity against tiny numeric wobble.
  const c1 = Math.min(Math.max(f1, EPS), 1 - EPS);
  const c2 = Math.min(Math.max(f2, c1), 1 - EPS);
  const c3 = Math.min(Math.max(f3, c2), 1 - EPS);
  return [0, c1, c2, c3, 1];
}

/** Exact order-statistic likelihood P(max = s | H, N) = F(s)^N − F(s−1)^N,
 *  computed in log space for stability at large N / tiny F. */
function maxLikelihood(cdf: number[], s: ConditionLevel, n: number): number {
  const fs = cdf[s];
  const fPrev = cdf[s - 1];
  if (n <= 0) return 1;
  const hi = fs <= 0 ? 0 : Math.exp(n * Math.log(fs));
  const lo = fPrev <= 0 ? 0 : Math.exp(n * Math.log(fPrev));
  return Math.max(0, hi - lo);
}

/**
 * Exact conditional expected counts given max = s and N rooms (spec §5.2.3):
 *   E[C_s] = N · p_s · F_s^(N−1) / D
 *   E[C_k] = N · p_k · (F_s^(N−1) − F_{s−1}^(N−1)) / D   for k < s
 *   E[C_k] = 0                                            for k > s
 * where D = F_s^N − F_{s−1}^N. Degenerate D falls back to "all rooms at s",
 * which is the correct limit when the max is (nearly) impossible under H —
 * the observation dominates.
 */
function conditionalExpectedCounts(
  cdf: number[],
  s: ConditionLevel,
  n: number,
): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  if (n === 1) {
    out[s - 1] = 1;
    return out;
  }
  const fs = cdf[s];
  const fPrev = cdf[s - 1];
  const d = maxLikelihood(cdf, s, n);
  if (d < EPS) {
    out[s - 1] = n;
    return out;
  }
  const fsPow = fs <= 0 ? 0 : Math.exp((n - 1) * Math.log(fs));
  const fPrevPow = fPrev <= 0 ? 0 : Math.exp((n - 1) * Math.log(fPrev));
  for (let k = 1 as ConditionLevel; k <= s; k = (k + 1) as ConditionLevel) {
    const pk = cdf[k] - cdf[k - 1];
    out[k - 1] =
      k === s ? (n * pk * fsPow) / d : (n * pk * (fsPow - fPrevPow)) / d;
  }
  // Renormalize the tiny numeric drift so counts sum to exactly N.
  const sum = out[0] + out[1] + out[2] + out[3];
  if (sum > EPS) {
    const scale = n / sum;
    for (let i = 0; i < 4; i++) out[i] *= scale;
  } else {
    out[s - 1] = n;
  }
  return out;
}

/** Discrete Gaussian grid for the latent whole-home tendency H. */
function hGrid(params: InferenceParamsV2): Array<{ h: number; w: number }> {
  const points = Math.max(3, Math.min(51, Math.round(params.hGridPoints)));
  const span = Math.max(0.5, Math.min(5, params.hGridSpan));
  const nodes: Array<{ h: number; w: number }> = [];
  let total = 0;
  for (let i = 0; i < points; i++) {
    const h = -span + (2 * span * i) / (points - 1);
    const w = Math.exp(-0.5 * h * h);
    nodes.push({ h, w });
    total += w;
  }
  for (const node of nodes) node.w /= total;
  return nodes;
}

export interface TypeObservation {
  type: RoomTypeV2;
  count: number;
  reportedMax: ConditionLevel;
  /** Direct counts-by-level override (already validated by the caller). */
  directCounts?: [number, number, number, number];
}

export interface TypeInference {
  type: RoomTypeV2;
  count: number;
  reportedMax: ConditionLevel;
  expectedConditionCounts: [number, number, number, number];
  method: "single_room" | "consensus" | "direct_counts" | "inferred";
}

export interface InferenceOutput {
  perType: TypeInference[];
  /**
   * Posterior weights over the H grid alongside each grid point's per-type
   * conditional expected counts — the engine uses these to build the
   * scheduling percentile without re-deriving the model.
   */
  posterior: Array<{
    h: number;
    weight: number;
    countsByType: Partial<Record<RoomTypeV2, [number, number, number, number]>>;
  }>;
}

/** Validate a counts-by-level override: non-negative integers, sums to the
 *  room count, nothing above the reported max, at least one AT the max. */
export function isValidDirectCounts(
  counts: [number, number, number, number],
  roomCount: number,
  reportedMax: ConditionLevel,
): boolean {
  let sum = 0;
  for (let k = 1; k <= 4; k++) {
    const c = counts[k - 1];
    if (!Number.isInteger(c) || c < 0) return false;
    if (k > reportedMax && c > 0) return false;
    sum += c;
  }
  return sum === roomCount && counts[reportedMax - 1] >= 1;
}

/**
 * Run the full inference for a home. `observations` must contain every room
 * type with count >= 1 (types with zero rooms are omitted entirely).
 */
export function inferConditionCounts(
  params: InferenceParamsV2,
  observations: TypeObservation[],
): InferenceOutput {
  const active = observations.filter((o) => o.count >= 1);

  // Direct overrides and single-room types are observed, not inferred — but
  // single rooms still inform the whole-home posterior below.
  const resolved = new Map<RoomTypeV2, TypeInference>();
  for (const o of active) {
    if (o.directCounts && isValidDirectCounts(o.directCounts, o.count, o.reportedMax)) {
      resolved.set(o.type, {
        type: o.type,
        count: o.count,
        reportedMax: o.reportedMax,
        expectedConditionCounts: [...o.directCounts] as [number, number, number, number],
        method: "direct_counts",
      });
    }
  }

  // Consensus rule (spec §5.2.1): every applicable selection at the same
  // level q → every counted room is q with probability 1. Direct-count
  // overrides are direct observations and exempt themselves from consensus.
  const nonDirect = active.filter((o) => !resolved.has(o.type));
  const allSame =
    nonDirect.length > 0 && nonDirect.every((o) => o.reportedMax === nonDirect[0].reportedMax);
  if (allSame && resolved.size === 0) {
    const q = nonDirect[0].reportedMax;
    const perType = active.map((o): TypeInference => {
      const counts: [number, number, number, number] = [0, 0, 0, 0];
      counts[q - 1] = o.count;
      return {
        type: o.type,
        count: o.count,
        reportedMax: o.reportedMax,
        expectedConditionCounts: counts,
        method: o.count === 1 ? "single_room" : "consensus",
      };
    });
    return {
      perType,
      posterior: [
        {
          h: 0,
          weight: 1,
          countsByType: Object.fromEntries(perType.map((p) => [p.type, p.expectedConditionCounts])),
        },
      ],
    };
  }

  // Floor rule (companion to the consensus rule, and what makes labor
  // monotone in every reported level): no room is estimated BELOW the
  // lightest condition reported anywhere in the home. When every type
  // reports q this reduces exactly to the consensus rule; when reports are
  // mixed it only truncates impossible-feeling low tails (e.g. a home
  // reporting 3/2/2/2 never has rooms estimated at level 1).
  const qMin = Math.min(...active.map((o) => o.reportedMax)) as ConditionLevel;
  const applyFloor = (
    counts: [number, number, number, number],
    n: number,
    max: ConditionLevel,
  ): [number, number, number, number] => {
    const out = [...counts] as [number, number, number, number];
    for (let k = 1; k < qMin; k++) {
      out[qMin - 1] += out[k - 1];
      out[k - 1] = 0;
    }
    let sum = out[0] + out[1] + out[2] + out[3];
    if (sum > EPS) {
      const scale = n / sum;
      for (let i = 0; i < 4; i++) out[i] *= scale;
    } else {
      out[max - 1] = n;
    }
    return out;
  };

  // Mixed signals: posterior over H from every reported maximum (including
  // single-room and direct-count types — their maxima are evidence too).
  const grid = hGrid(params);
  const posterior: InferenceOutput["posterior"] = [];
  let totalWeight = 0;
  for (const { h, w } of grid) {
    let logLik = 0;
    for (const o of active) {
      const cdf = conditionCdf(params, o.type, h);
      const lik = maxLikelihood(cdf, o.reportedMax, o.count);
      logLik += Math.log(Math.max(lik, EPS));
    }
    const weight = w * Math.exp(logLik);
    const countsByType: Partial<Record<RoomTypeV2, [number, number, number, number]>> = {};
    for (const o of active) {
      const cdf = conditionCdf(params, o.type, h);
      countsByType[o.type] = applyFloor(
        conditionalExpectedCounts(cdf, o.reportedMax, o.count),
        o.count,
        o.reportedMax,
      );
    }
    posterior.push({ h, weight, countsByType });
    totalWeight += weight;
  }
  // Normalize; a fully degenerate posterior falls back to the prior weights.
  if (totalWeight < EPS) {
    let priorTotal = 0;
    for (let i = 0; i < posterior.length; i++) {
      posterior[i].weight = grid[i].w;
      priorTotal += grid[i].w;
    }
    totalWeight = priorTotal;
  }
  for (const node of posterior) node.weight /= totalWeight;

  const perType: TypeInference[] = [];
  for (const o of active) {
    const already = resolved.get(o.type);
    if (already) {
      perType.push(already);
      continue;
    }
    if (o.count === 1) {
      const counts: [number, number, number, number] = [0, 0, 0, 0];
      counts[o.reportedMax - 1] = 1;
      perType.push({
        type: o.type,
        count: 1,
        reportedMax: o.reportedMax,
        expectedConditionCounts: counts,
        method: "single_room",
      });
      continue;
    }
    const expected: [number, number, number, number] = [0, 0, 0, 0];
    for (const node of posterior) {
      const c = node.countsByType[o.type]!;
      for (let i = 0; i < 4; i++) expected[i] += node.weight * c[i];
    }
    // Invariants: nothing above the reported max (structural), counts sum to
    // N (renormalized), and at least one room AT the reported max — the
    // customer observed that room. Enforce the floor by shifting mass from
    // the largest lower level if posterior averaging dipped below 1.
    for (let k = o.reportedMax + 1; k <= 4; k++) expected[k - 1] = 0;
    let sum = expected[0] + expected[1] + expected[2] + expected[3];
    if (sum > EPS) {
      const scale = o.count / sum;
      for (let i = 0; i < 4; i++) expected[i] *= scale;
    } else {
      expected[o.reportedMax - 1] = o.count;
    }
    if (expected[o.reportedMax - 1] < 1) {
      let deficit = 1 - expected[o.reportedMax - 1];
      expected[o.reportedMax - 1] = 1;
      for (let k = o.reportedMax - 1; k >= 1 && deficit > EPS; k--) {
        const take = Math.min(deficit, expected[k - 1]);
        expected[k - 1] -= take;
        deficit -= take;
      }
    }
    perType.push({
      type: o.type,
      count: o.count,
      reportedMax: o.reportedMax,
      expectedConditionCounts: expected,
      method: "inferred",
    });
  }

  // Stable output order regardless of observation order.
  perType.sort(
    (a, b) => ROOM_TYPES_V2.indexOf(a.type) - ROOM_TYPES_V2.indexOf(b.type),
  );
  return { perType, posterior };
}
