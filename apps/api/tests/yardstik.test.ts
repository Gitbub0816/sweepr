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
import { mapReportStatus, verifyYardstikSignature, adverseActionEarliestDate } from "../src/lib/yardstik";

describe("mapReportStatus", () => {
  it("maps positive terminal outcomes to clear", () => {
    expect(mapReportStatus("clear")).toBe("clear");
    expect(mapReportStatus("proceed")).toBe("clear");
    expect(mapReportStatus("pass")).toBe("clear");
  });

  it("maps final_adverse and fail to adverse_action", () => {
    expect(mapReportStatus("final_adverse")).toBe("adverse_action");
    expect(mapReportStatus("fail")).toBe("adverse_action");
  });

  it("maps pre_adverse to pre_adverse_action", () => {
    expect(mapReportStatus("pre_adverse")).toBe("pre_adverse_action");
  });

  it("maps consider and dispute straight through", () => {
    expect(mapReportStatus("consider")).toBe("consider");
    expect(mapReportStatus("dispute")).toBe("dispute");
  });

  it("maps canceled/expired to suspended and created to invited", () => {
    expect(mapReportStatus("canceled")).toBe("suspended");
    expect(mapReportStatus("expired")).toBe("suspended");
    expect(mapReportStatus("created")).toBe("invited");
  });

  it("falls back to pending for in-progress queue states and unknown strings", () => {
    expect(mapReportStatus("queued")).toBe("pending");
    expect(mapReportStatus("processing")).toBe("pending");
    expect(mapReportStatus("info_requested")).toBe("pending");
    expect(mapReportStatus("some_future_status")).toBe("pending");
  });
});

describe("verifyYardstikSignature", () => {
  it("accepts a signature computed with the correct secret", async () => {
    const body = JSON.stringify({ id: "evt_1", event: "updated", resource_type: "report" });
    const secret = "test-webhook-signature-key";
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(await verifyYardstikSignature(body, hex, secret)).toBe(true);
  });

  it("rejects a mismatched signature", async () => {
    const body = JSON.stringify({ id: "evt_1" });
    expect(await verifyYardstikSignature(body, "deadbeef", "some-secret")).toBe(false);
  });

  it("rejects a wrong-length signature without throwing", async () => {
    const body = JSON.stringify({ id: "evt_1" });
    expect(await verifyYardstikSignature(body, "short", "some-secret")).toBe(false);
  });
});

describe("adverseActionEarliestDate", () => {
  it("covers 5 business days plus a 2-day holiday buffer, skipping weekends", () => {
    // 2026-07-01 is a Wednesday. +5 business days = Wed 2026-07-08
    // (skips Sat 07-04 and Sun 07-05); +2 calendar buffer = 2026-07-10.
    const preAdverseAt = new Date("2026-07-01T00:00:00Z");
    const earliest = adverseActionEarliestDate(preAdverseAt);
    expect(earliest.toISOString()).toBe("2026-07-10T00:00:00.000Z");
  });

  it("always spans at least 5 business days regardless of start weekday", () => {
    const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
    for (let i = 0; i < 7; i++) {
      const start = new Date(Date.UTC(2026, 6, 1 + i, 0, 0, 0));
      const earliest = adverseActionEarliestDate(start);
      let businessDays = 0;
      const cursor = new Date(start.getTime());
      while (cursor.getTime() < earliest.getTime()) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        if (!isWeekend(cursor)) businessDays++;
      }
      expect(businessDays).toBeGreaterThanOrEqual(5);
    }
  });
});
