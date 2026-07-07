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
 * Unit tests for the admin alert prefs-defaulting logic: given an admin's
 * pref rows and a category, which channels fire.
 *
 * Pure unit tests — no DB, no network.
 */
import { describe, it, expect } from "vitest";
import {
  ALERT_CATEGORIES,
  ALERT_CHANNELS,
  CATEGORY_NAV_PATHS,
  defaultChannelEnabled,
  effectiveChannels,
  type AlertPrefRow,
} from "../src/lib/adminAlerts";

describe("defaultChannelEnabled", () => {
  it("defaults in-app ON for every category", () => {
    for (const cat of ALERT_CATEGORIES) {
      expect(defaultChannelEnabled(cat, "inapp")).toBe(true);
    }
  });

  it("defaults email ON only for errors and security", () => {
    expect(defaultChannelEnabled("errors", "email")).toBe(true);
    expect(defaultChannelEnabled("security", "email")).toBe(true);
    for (const cat of ALERT_CATEGORIES.filter((c) => c !== "errors" && c !== "security")) {
      expect(defaultChannelEnabled(cat, "email")).toBe(false);
    }
  });

  it("defaults SMS OFF for every category", () => {
    for (const cat of ALERT_CATEGORIES) {
      expect(defaultChannelEnabled(cat, "sms")).toBe(false);
    }
  });
});

describe("effectiveChannels — no pref rows (pure defaults)", () => {
  it("fires in-app + email for errors and security", () => {
    expect(effectiveChannels("errors", [])).toEqual(["inapp", "email"]);
    expect(effectiveChannels("security", [])).toEqual(["inapp", "email"]);
  });

  it("fires in-app only for every other category", () => {
    for (const cat of ALERT_CATEGORIES.filter((c) => c !== "errors" && c !== "security")) {
      expect(effectiveChannels(cat, [])).toEqual(["inapp"]);
    }
  });
});

describe("effectiveChannels — explicit pref rows override defaults", () => {
  it("an explicit disable turns a default-on channel off", () => {
    const prefs: AlertPrefRow[] = [
      { category: "errors", channel: "email", enabled: false },
    ];
    expect(effectiveChannels("errors", prefs)).toEqual(["inapp"]);
  });

  it("an explicit enable turns a default-off channel on", () => {
    const prefs: AlertPrefRow[] = [
      { category: "it", channel: "sms", enabled: true },
      { category: "it", channel: "email", enabled: true },
    ];
    expect(effectiveChannels("it", prefs)).toEqual(["inapp", "email", "sms"]);
  });

  it("disabling every channel silences the category entirely", () => {
    const prefs: AlertPrefRow[] = ALERT_CHANNELS.map((channel) => ({
      category: "security",
      channel,
      enabled: false,
    }));
    expect(effectiveChannels("security", prefs)).toEqual([]);
  });

  it("rows for other categories don't leak into the requested one", () => {
    const prefs: AlertPrefRow[] = [
      { category: "mail", channel: "sms", enabled: true },
      { category: "mail", channel: "inapp", enabled: false },
    ];
    expect(effectiveChannels("approvals", prefs)).toEqual(["inapp"]);
    expect(effectiveChannels("mail", prefs)).toEqual(["sms"]);
  });

  it("partial rows fall back to defaults for missing combinations", () => {
    const prefs: AlertPrefRow[] = [
      { category: "errors", channel: "sms", enabled: true },
    ];
    // inapp (default on) + email (default on for errors) + sms (explicit on)
    expect(effectiveChannels("errors", prefs)).toEqual(["inapp", "email", "sms"]);
  });
});

describe("category → nav path map", () => {
  it("covers every alert category", () => {
    for (const cat of ALERT_CATEGORIES) {
      expect(CATEGORY_NAV_PATHS[cat]).toMatch(/^\//);
    }
  });
});
