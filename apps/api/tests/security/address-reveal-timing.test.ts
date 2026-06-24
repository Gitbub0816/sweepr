/**
 * P1-5: Address reveal timing
 * Verifies that the address is only revealed within the configurable window
 * before the scheduled start time.
 */

import { describe, it, expect } from "vitest";

interface RevealSettings {
  reveal_hours_before: number;
  allow_same_day_only: boolean;
}

function checkAddressRevealAllowed(
  settings: RevealSettings,
  scheduledAt: Date,
  now: Date
): { allowed: boolean; reason?: string } {
  const revealWindowStart = new Date(scheduledAt.getTime() - settings.reveal_hours_before * 60 * 60 * 1000);

  if (settings.allow_same_day_only) {
    const sameDay = now.toDateString() === scheduledAt.toDateString();
    if (!sameDay) {
      return { allowed: false, reason: "must be same day as scheduled clean" };
    }
  }

  if (now < revealWindowStart) {
    const hoursUntil = Math.ceil((revealWindowStart.getTime() - now.getTime()) / (60 * 60 * 1000));
    return { allowed: false, reason: `available ${hoursUntil}h before scheduled start` };
  }

  return { allowed: true };
}

describe("Address reveal timing", () => {
  const settings: RevealSettings = { reveal_hours_before: 4, allow_same_day_only: true };

  it("allows reveal within the window on same day", () => {
    const scheduledAt = new Date("2026-06-24T14:00:00Z");
    const now = new Date("2026-06-24T11:00:00Z"); // 3h before, within 4h window
    const result = checkAddressRevealAllowed(settings, scheduledAt, now);
    expect(result.allowed).toBe(true);
  });

  it("blocks reveal before the window opens", () => {
    const scheduledAt = new Date("2026-06-24T14:00:00Z");
    const now = new Date("2026-06-24T08:00:00Z"); // 6h before, outside 4h window
    const result = checkAddressRevealAllowed(settings, scheduledAt, now);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("before scheduled start");
  });

  it("blocks reveal on a different day when allow_same_day_only is true", () => {
    const scheduledAt = new Date("2026-06-25T14:00:00Z");
    const now = new Date("2026-06-24T12:00:00Z"); // day before
    const result = checkAddressRevealAllowed(settings, scheduledAt, now);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("same day");
  });

  it("allows reveal on a different day when allow_same_day_only is false", () => {
    const flexSettings: RevealSettings = { reveal_hours_before: 24, allow_same_day_only: false };
    const scheduledAt = new Date("2026-06-25T14:00:00Z");
    const now = new Date("2026-06-24T14:30:00Z"); // within 24h window
    const result = checkAddressRevealAllowed(flexSettings, scheduledAt, now);
    expect(result.allowed).toBe(true);
  });

  it("allows reveal exactly at window start", () => {
    const scheduledAt = new Date("2026-06-24T14:00:00Z");
    const now = new Date("2026-06-24T10:00:00Z"); // exactly 4h before
    const result = checkAddressRevealAllowed(settings, scheduledAt, now);
    expect(result.allowed).toBe(true);
  });
});
