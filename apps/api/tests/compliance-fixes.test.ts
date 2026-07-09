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
  assertQuietHoursAllowed,
  SMS_MESSAGE_CLASS,
  type SmsMessageType,
} from "../src/lib/sms";
import { responseDueDays } from "../src/routes/privacyPublic";

describe("sms quiet-hours guard", () => {
  it("every allowlisted type is transactional today", () => {
    for (const cls of Object.values(SMS_MESSAGE_CLASS)) {
      expect(cls).toBe("transactional");
    }
  });

  it("allows transactional sends at any hour", () => {
    const midnight = new Date("2026-07-01T05:00:00Z"); // any hour
    expect(() => assertQuietHoursAllowed("otp", { now: midnight })).not.toThrow();
    expect(() => assertQuietHoursAllowed("booking_confirmation")).not.toThrow();
  });

  it("fails closed for an unmapped (marketing-treated) type with no time zone", () => {
    const fakeMarketing = "promo_blast" as unknown as SmsMessageType;
    expect(() => assertQuietHoursAllowed(fakeMarketing, {})).toThrow(/requires recipientTimeZone/);
  });

  it("blocks a marketing-treated send outside 8am–9pm recipient-local time", () => {
    const fakeMarketing = "promo_blast" as unknown as SmsMessageType;
    // 2026-07-01T04:00:00Z = 00:00 in America/New_York (EDT, UTC-4) → blocked.
    const lateNight = new Date("2026-07-01T04:00:00Z");
    expect(() =>
      assertQuietHoursAllowed(fakeMarketing, { recipientTimeZone: "America/New_York", now: lateNight }),
    ).toThrow(/quiet hours/);
  });

  it("permits a marketing-treated send inside quiet hours", () => {
    const fakeMarketing = "promo_blast" as unknown as SmsMessageType;
    // 2026-07-01T16:00:00Z = 12:00 in America/New_York → allowed.
    const noon = new Date("2026-07-01T16:00:00Z");
    expect(() =>
      assertQuietHoursAllowed(fakeMarketing, { recipientTimeZone: "America/New_York", now: noon }),
    ).not.toThrow();
  });
});

describe("privacy DSAR response window", () => {
  it("grants CCPA/CPRA jurisdictions 45 days", () => {
    expect(responseDueDays("California")).toBe(45);
    expect(responseDueDays("CCPA")).toBe(45);
    expect(responseDueDays("United States")).toBe(45);
  });

  it("grants GDPR jurisdictions 30 days", () => {
    expect(responseDueDays("GDPR")).toBe(30);
    expect(responseDueDays("EU")).toBe(30);
    expect(responseDueDays("United Kingdom")).toBe(30);
  });

  it("defaults to the shorter 30-day clock when unknown", () => {
    expect(responseDueDays()).toBe(30);
    expect(responseDueDays("")).toBe(30);
    expect(responseDueDays("Mars")).toBe(30);
  });
});
