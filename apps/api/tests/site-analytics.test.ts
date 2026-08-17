/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isValidLinkCode,
  normalizeDestination,
  parseUserAgent,
  referrerToSource,
  slugifyLinkCode,
} from "@sweepr/utils";
import {
  isAllowedOrigin,
  normalizeBatch,
  parseTrackerCookies,
} from "../../analytics/src/normalize";

// ---------------------------------------------------------------------------
// Destination validation — THE open-redirect gate for /go/{code}
// ---------------------------------------------------------------------------

describe("normalizeDestination", () => {
  it("accepts a path and anchors it to getsweepr.com", () => {
    expect(normalizeDestination("/pricing?x=1")).toBe("https://getsweepr.com/pricing?x=1");
    expect(normalizeDestination("/")).toBe("https://getsweepr.com/");
  });

  it("accepts absolute https URLs on getsweepr.com subdomains", () => {
    expect(normalizeDestination("https://clean.getsweepr.com/apply")).toBe(
      "https://clean.getsweepr.com/apply",
    );
    expect(normalizeDestination("https://getsweepr.com/business")).toBe(
      "https://getsweepr.com/business",
    );
  });

  it("rejects foreign hosts, lookalikes, and scheme tricks", () => {
    expect(normalizeDestination("https://evil.com/")).toBeNull();
    expect(normalizeDestination("https://getsweepr.com.evil.com/")).toBeNull();
    expect(normalizeDestination("https://notgetsweepr.com/")).toBeNull();
    expect(normalizeDestination("http://getsweepr.com/")).toBeNull();
    expect(normalizeDestination("//evil.com/")).toBeNull();
    expect(normalizeDestination("\\\\evil.com")).toBeNull();
    expect(normalizeDestination("javascript:alert(1)")).toBeNull();
    expect(normalizeDestination("")).toBeNull();
  });
});

describe("link codes", () => {
  it("validates shape", () => {
    expect(isValidLinkCode("google")).toBe(true);
    expect(isValidLinkCode("fb-spring26")).toBe(true);
    expect(isValidLinkCode("a")).toBe(false);
    expect(isValidLinkCode("-bad")).toBe(false);
    expect(isValidLinkCode("has space")).toBe(false);
    expect(isValidLinkCode("a".repeat(70))).toBe(false);
  });

  it("slugifies labels", () => {
    expect(slugifyLinkCode("Facebook Spring '26!")).toBe("facebook-spring-26");
    expect(slugifyLinkCode("  Nextdoor / April  ")).toBe("nextdoor-april");
  });
});

// ---------------------------------------------------------------------------
// UA parsing + referrer classification
// ---------------------------------------------------------------------------

describe("parseUserAgent", () => {
  it("parses desktop Chrome on Windows", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    );
    expect(r).toMatchObject({ browser: "Chrome", os: "Windows", deviceType: "desktop", isBot: false });
    expect(r.browserVer).toBe("126.0");
  });

  it("parses mobile Safari on iOS", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    );
    expect(r).toMatchObject({ browser: "Safari", os: "iOS", osVer: "17.5", deviceType: "mobile" });
  });

  it("parses Android tablets vs phones", () => {
    const phone = parseUserAgent(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
    );
    expect(phone.deviceType).toBe("mobile");
    expect(phone.os).toBe("Android");
    const tablet = parseUserAgent(
      "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    );
    expect(tablet.deviceType).toBe("tablet");
  });

  it("flags bots and empty UAs", () => {
    expect(parseUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)").isBot).toBe(true);
    expect(parseUserAgent("curl/8.0").isBot).toBe(true);
    expect(parseUserAgent("").isBot).toBe(true);
    expect(parseUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)").deviceType).toBe("bot");
  });
});

describe("referrerToSource", () => {
  it("classifies known referrers", () => {
    expect(referrerToSource("https://www.google.com/search?q=x")).toBe("google");
    expect(referrerToSource("https://chatgpt.com/")).toBe("chatgpt");
    expect(referrerToSource("https://nextdoor.com/news_feed")).toBe("nextdoor");
    expect(referrerToSource("https://m.facebook.com/")).toBe("facebook");
    expect(referrerToSource("https://t.co/abc")).toBe("x");
  });

  it("returns null for direct/internal, referral:<host> for unknown", () => {
    expect(referrerToSource("")).toBeNull();
    expect(referrerToSource(null)).toBeNull();
    expect(referrerToSource("https://app.getsweepr.com/book")).toBeNull();
    expect(referrerToSource("https://someblog.example/post")).toBe("referral:someblog.example");
  });
});

// ---------------------------------------------------------------------------
// Worker ingest normalization
// ---------------------------------------------------------------------------

describe("normalizeBatch", () => {
  const NOW = Date.parse("2026-08-17T12:00:00Z");
  const vid = "11111111-2222-3333-4444-555555555555";
  const sid = "66666666-7777-8888-9999-000000000000";

  it("accepts a valid batch and clamps timestamps", () => {
    const batch = normalizeBatch(
      {
        vid,
        sid,
        events: [
          { type: "pageview", app: "marketing", path: "/pricing", ts: NOW - 60 * 60_000 },
          { type: "click", app: "marketing", clickText: "Book now" },
        ],
      },
      NOW,
    );
    expect(batch).not.toBeNull();
    expect(batch!.events).toHaveLength(2);
    // An hour-old client timestamp is clamped into the 10-minute window.
    expect(Date.parse(batch!.events[0].occurred_at)).toBe(NOW - 10 * 60_000);
    expect(batch!.events[1].click_text).toBe("Book now");
  });

  it("drops events with unknown apps/types but keeps the rest", () => {
    const batch = normalizeBatch(
      {
        vid,
        sid,
        events: [
          { type: "pageview", app: "not-an-app" },
          { type: "steal-data", app: "marketing" },
          { type: "pageview", app: "customer", path: "/book" },
        ],
      },
      NOW,
    );
    expect(batch!.events).toHaveLength(1);
    expect(batch!.events[0].app).toBe("customer");
  });

  it("rejects malformed ids and empty batches", () => {
    expect(normalizeBatch({ vid: "x", sid, events: [{ type: "pageview", app: "marketing" }] }, NOW)).toBeNull();
    expect(normalizeBatch({ vid, sid, events: [] }, NOW)).toBeNull();
    expect(normalizeBatch("nope", NOW)).toBeNull();
    expect(normalizeBatch(null, NOW)).toBeNull();
  });

  it("caps batch size at 25 and truncates long strings", () => {
    const events = Array.from({ length: 40 }, () => ({
      type: "pageview",
      app: "marketing",
      path: "/x".repeat(600),
    }));
    const batch = normalizeBatch({ vid, sid, events }, NOW);
    expect(batch!.events).toHaveLength(25);
    expect(batch!.events[0].path!.length).toBeLessThanOrEqual(512);
  });

  it("drops oversized meta objects", () => {
    const batch = normalizeBatch(
      { vid, sid, events: [{ type: "custom", app: "marketing", meta: { blob: "y".repeat(5000) } }] },
      NOW,
    );
    expect(batch!.events[0].meta).toEqual({});
  });
});

describe("isAllowedOrigin", () => {
  it("allows only https getsweepr.com origins", () => {
    expect(isAllowedOrigin("https://getsweepr.com")).toBe(true);
    expect(isAllowedOrigin("https://app.getsweepr.com")).toBe(true);
    expect(isAllowedOrigin("https://dashboard.getsweepr.com")).toBe(true);
    expect(isAllowedOrigin("http://getsweepr.com")).toBe(false);
    expect(isAllowedOrigin("https://evilgetsweepr.com")).toBe(false);
    expect(isAllowedOrigin("https://getsweepr.com.evil.com")).toBe(false);
    expect(isAllowedOrigin(null)).toBe(false);
  });
});

describe("parseTrackerCookies", () => {
  it("extracts swa ids and ignores junk", () => {
    const parsed = parseTrackerCookies(
      "theme=dark; swa_vid=11111111-2222-3333-4444-555555555555; swa_sid=66666666-7777-8888-9999-000000000000; other=1",
    );
    expect(parsed.vid).toBe("11111111-2222-3333-4444-555555555555");
    expect(parsed.sid).toBe("66666666-7777-8888-9999-000000000000");
    expect(parseTrackerCookies("swa_vid=<script>")).toEqual({ vid: null, sid: null });
    expect(parseTrackerCookies(null)).toEqual({ vid: null, sid: null });
  });
});

// ---------------------------------------------------------------------------
// Admin tracking-links routes (mocked DB/auth)
// ---------------------------------------------------------------------------

const sqlCalls: Array<{ text: string; values: unknown[] }> = [];
type Handler = (text: string, values: unknown[]) => unknown;
let handler: Handler = () => [];

vi.mock("../src/lib/db", () => ({
  getDb: () =>
    ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      sqlCalls.push({ text, values });
      return Promise.resolve(handler(text, values) ?? []);
    }),
}));
vi.mock("../src/middleware/auth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { clerkId: "admin_1" });
    await next();
  },
}));
vi.mock("../src/middleware/adminRoles", () => ({
  requireAdminRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
  requireAdmin: async (_c: unknown, next: () => Promise<void>) => next(),
}));

const ENV = { DATABASE_URL: "postgres://fake" } as never;

describe("admin tracking links", () => {
  beforeEach(() => {
    sqlCalls.length = 0;
    handler = () => [];
  });

  async function router() {
    const { adminSiteAnalyticsRouter } = await import("../src/routes/adminSiteAnalytics");
    return adminSiteAnalyticsRouter;
  }

  it("rejects off-domain destinations", async () => {
    const r = await router();
    const res = await r.request(
      "/links",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Evil", source: "google", destination: "https://evil.com/steal" }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    // Nothing was inserted.
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO tracking_links"))).toBe(false);
  });

  it("creates a link with a generated code and returns the public URL", async () => {
    handler = (text) => {
      if (text.includes("SELECT 1 FROM tracking_links")) return [];
      if (text.includes("INSERT INTO tracking_links")) {
        return [{ id: "id-1", code: "nextdoor-spring", active: true }];
      }
      return [];
    };
    const r = await router();
    const res = await r.request(
      "/links",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Nextdoor Spring", source: "Nextdoor", destination: "/" }),
      },
      ENV,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe("https://getsweepr.com/go/nextdoor-spring");
    // Source is lowercased by the schema.
    const insert = sqlCalls.find((c) => c.text.includes("INSERT INTO tracking_links"));
    expect(insert?.values).toContain("nextdoor");
  });

  it("409s on an explicit code collision", async () => {
    handler = (text) => (text.includes("SELECT 1 FROM tracking_links") ? [{ one: 1 }] : []);
    const r = await router();
    const res = await r.request(
      "/links",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Dup", source: "google", destination: "/", code: "taken" }),
      },
      ENV,
    );
    expect(res.status).toBe(409);
  });

  it("rejects invalid explicit codes", async () => {
    const r = await router();
    const res = await r.request(
      "/links",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Bad", source: "google", destination: "/", code: "!!bad!!" }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
  });

  it("PATCH validates destination too", async () => {
    const r = await router();
    const res = await r.request(
      "/links/abc",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination: "https://phish.example/" }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
  });
});
