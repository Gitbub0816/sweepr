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
import {
  AnnouncementDeduper,
  APPROACHING_DISTANCE_METERS,
  classifyAnnouncementStage,
  EARLY_WARNING_DISTANCE_METERS,
  FINAL_DISTANCE_METERS,
} from "./maneuverController";

describe("classifyAnnouncementStage", () => {
  it("returns null when no announcement is due yet", () => {
    expect(classifyAnnouncementStage(EARLY_WARNING_DISTANCE_METERS + 1)).toBeNull();
  });

  it("returns early-warning at the early-warning threshold", () => {
    expect(classifyAnnouncementStage(EARLY_WARNING_DISTANCE_METERS)).toBe("early-warning");
  });

  it("returns approaching at the approaching threshold", () => {
    expect(classifyAnnouncementStage(APPROACHING_DISTANCE_METERS)).toBe("approaching");
  });

  it("returns final at the final threshold", () => {
    expect(classifyAnnouncementStage(FINAL_DISTANCE_METERS)).toBe("final");
  });
});

describe("AnnouncementDeduper", () => {
  it("does not re-fire the same key twice", () => {
    const deduper = new AnnouncementDeduper();
    const key = { routeVersion: 1, stepIndex: 0, stage: "approaching" as const };
    expect(deduper.hasAnnounced(key)).toBe(false);
    deduper.markAnnounced(key);
    expect(deduper.hasAnnounced(key)).toBe(true);
  });

  it("fires again after routeVersion changes", () => {
    const deduper = new AnnouncementDeduper();
    const key = { routeVersion: 1, stepIndex: 0, stage: "approaching" as const };
    deduper.markAnnounced(key);
    expect(deduper.hasAnnounced(key)).toBe(true);

    const newVersionKey = { ...key, routeVersion: 2 };
    expect(deduper.hasAnnounced(newVersionKey)).toBe(false);
  });
});
