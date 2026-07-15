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
import { evaluateArrival } from "./arrivalController";

describe("evaluateArrival", () => {
  it("does not arrive from one noisy near-destination sample", () => {
    const result = evaluateArrival(10, 10, 1, 0);
    expect(result.arrived).toBe(false);
    expect(result.nextConsecutiveCount).toBe(1);
  });

  it("arrives after enough consecutive qualifying samples", () => {
    let count = 0;
    let result = evaluateArrival(10, 10, 0, count);
    count = result.nextConsecutiveCount;
    result = evaluateArrival(10, 10, 0, count);
    count = result.nextConsecutiveCount;
    result = evaluateArrival(10, 10, 0, count);
    expect(result.arrived).toBe(true);
  });

  it("requires BOTH route distance and straight-line distance under the threshold", () => {
    // Route distance looks close, but straight-line distance is far — e.g. a
    // complex intersection confusing the route-relative calculation.
    const result = evaluateArrival(10, 500, 0, 5);
    expect(result.arrived).toBe(false);
    expect(result.nextConsecutiveCount).toBe(0);
  });

  it("resets the consecutive count once a sample no longer qualifies", () => {
    let result = evaluateArrival(10, 10, 0, 0);
    result = evaluateArrival(10, 10, 0, result.nextConsecutiveCount);
    result = evaluateArrival(500, 500, 0, result.nextConsecutiveCount);
    expect(result.nextConsecutiveCount).toBe(0);
  });
});
