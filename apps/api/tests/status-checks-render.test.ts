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
 * Status engine — synthetic render checks (lib/statusChecks.ts).
 *
 * Covers the logic that can be exercised without a live Cloudflare account:
 * the hourly cadence gate, the render-check pass/fail classification (missing
 * binding, uncaught page error, console error, selector-never-appeared /
 * timeout, and the happy path), that the browser session is always closed,
 * and that render results land in the same status_checks-backed shape the
 * HTTP probes use (getComponentStatus / GET /status/components) rather than
 * a separate path. @cloudflare/puppeteer itself is mocked — there is no way
 * to invoke Cloudflare's real Browser Rendering service from this
 * environment; see the NOTE in statusChecks.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Sql } from "@sweepr/db";

const { launchMock } = vi.hoisted(() => ({ launchMock: vi.fn() }));

vi.mock("@cloudflare/puppeteer", () => ({
  default: { launch: launchMock },
}));

import {
  RENDER_COMPONENTS,
  STATUS_COMPONENTS,
  shouldRunRenderChecks,
  runStatusChecks,
  getComponentStatus,
} from "../src/lib/statusChecks";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

type EventHandler = (...args: unknown[]) => void;

interface FakePageOpts {
  gotoError?: Error;
  /** Simulates the SPA never mounting real content (waitForSelector times out). */
  selectorNeverAppears?: Error;
  /** Fired as page.on('pageerror', ...) during goto(), like an uncaught render crash. */
  pageErrors?: string[];
  /** Fired as page.on('console', ...) with type() === 'error' during goto(). */
  consoleErrors?: string[];
}

function makeFakePage(opts: FakePageOpts) {
  const handlers: Record<string, EventHandler[]> = {};
  return {
    on: vi.fn((event: string, cb: EventHandler) => {
      (handlers[event] ??= []).push(cb);
    }),
    goto: vi.fn(async () => {
      if (opts.gotoError) throw opts.gotoError;
      for (const message of opts.pageErrors ?? []) {
        for (const cb of handlers.pageerror ?? []) cb(new Error(message));
      }
      for (const text of opts.consoleErrors ?? []) {
        for (const cb of handlers.console ?? []) cb({ type: () => "error", text: () => text });
      }
    }),
    waitForSelector: vi.fn(async () => {
      if (opts.selectorNeverAppears) throw opts.selectorNeverAppears;
      return {};
    }),
  };
}

function makeFakeBrowser(pageOpts: FakePageOpts) {
  const closeMock = vi.fn(async () => undefined);
  const page = makeFakePage(pageOpts);
  const browser = { newPage: vi.fn(async () => page), close: closeMock };
  return { browser, page, closeMock };
}

/** Captures INSERT INTO status_checks rows; answers everything else with []. */
function makeCapturingSql() {
  const inserted: Array<{ component: string; ok: boolean; latencyMs: number; detail: string | null }> = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("INSERT INTO status_checks")) {
      const [component, ok, latencyMs, detail] = values as [string, boolean, number, string | null];
      inserted.push({ component, ok, latencyMs, detail });
    }
    return Promise.resolve([]);
  }) as unknown as Sql;
  return { sql, inserted };
}

// Cron fires at :00, :15, :30, :45 (wrangler.toml `*/15 * * * *`).
const ON_CADENCE_TIME = new Date("2026-01-05T09:00:00.000Z"); // top of the hour → render checks run
const OFF_CADENCE_TIME = new Date("2026-01-05T09:30:00.000Z"); // half past → render checks skipped

beforeEach(() => {
  launchMock.mockReset();
  // Every existing HTTP probe (STATUS_COMPONENTS) would otherwise hit real
  // production domains over the network — stub fetch so these tests are
  // hermetic and fast regardless of what this suite touches.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Cadence
// ---------------------------------------------------------------------------

describe("shouldRunRenderChecks — hourly cadence", () => {
  it("runs only on the top-of-the-hour cron tick, not every 15-minute tick", () => {
    expect(shouldRunRenderChecks(new Date("2026-01-05T09:00:00Z"))).toBe(true);
    expect(shouldRunRenderChecks(new Date("2026-01-05T09:14:59Z"))).toBe(true);
    expect(shouldRunRenderChecks(new Date("2026-01-05T09:15:00Z"))).toBe(false);
    expect(shouldRunRenderChecks(new Date("2026-01-05T09:30:00Z"))).toBe(false);
    expect(shouldRunRenderChecks(new Date("2026-01-05T09:45:00Z"))).toBe(false);
    expect(shouldRunRenderChecks(new Date("2026-01-05T09:59:00Z"))).toBe(false);
  });
});

describe("RENDER_COMPONENTS — the two pages named in the incident report", () => {
  it("checks the marketing homepage and the cleaner app, each with a real post-mount selector", () => {
    expect(RENDER_COMPONENTS.map((c) => c.key)).toEqual(["marketing_render", "cleaner_render"]);
    expect(RENDER_COMPONENTS.map((c) => c.url)).toEqual([
      "https://getsweepr.com/",
      "https://clean.getsweepr.com/",
    ]);
    for (const c of RENDER_COMPONENTS) {
      expect(c.waitForSelector.length).toBeGreaterThan(0);
    }
  });

  it("uses component keys distinct from the existing HTTP-probe components", () => {
    const httpKeys = new Set(STATUS_COMPONENTS.map((c) => c.key));
    for (const c of RENDER_COMPONENTS) {
      expect(httpKeys.has(c.key)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// runStatusChecks — cadence gating end-to-end
// ---------------------------------------------------------------------------

describe("runStatusChecks — render-check cadence", () => {
  it("skips render checks (and never launches a browser) off the hourly tick", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(OFF_CADENCE_TIME);
    const { sql, inserted } = makeCapturingSql();

    await runStatusChecks(sql, {} as Fetcher);

    expect(launchMock).not.toHaveBeenCalled();
    const renderKeys = inserted.filter((r) => r.component.endsWith("_render"));
    expect(renderKeys).toHaveLength(0);
    // The pre-existing HTTP/db checks still ran as before.
    expect(inserted.map((r) => r.component)).toEqual(STATUS_COMPONENTS.map((c) => c.key));
  });

  it("runs render checks on the hourly tick, alongside the unchanged HTTP checks", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(ON_CADENCE_TIME);
    const { sql, inserted } = makeCapturingSql();
    const { browser } = makeFakeBrowser({});
    launchMock.mockResolvedValue(browser);

    await runStatusChecks(sql, {} as Fetcher);

    expect(launchMock).toHaveBeenCalledTimes(RENDER_COMPONENTS.length);
    const renderRows = inserted.filter((r) => r.component.endsWith("_render"));
    expect(renderRows.map((r) => r.component)).toEqual(RENDER_COMPONENTS.map((c) => c.key));
    for (const row of renderRows) {
      expect(row.ok).toBe(true);
      expect(row.detail).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// renderProbe classification, exercised through runStatusChecks
// ---------------------------------------------------------------------------

describe("render-check result classification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(ON_CADENCE_TIME);
  });

  it("fails closed (unhealthy) with a clear reason when MYBROWSER isn't bound", async () => {
    const { sql, inserted } = makeCapturingSql();

    await runStatusChecks(sql, undefined);

    expect(launchMock).not.toHaveBeenCalled();
    const renderRows = inserted.filter((r) => r.component.endsWith("_render"));
    expect(renderRows).toHaveLength(RENDER_COMPONENTS.length);
    for (const row of renderRows) {
      expect(row.ok).toBe(false);
      expect(row.detail).toMatch(/MYBROWSER/);
    }
  });

  it("marks the component unhealthy on an uncaught client-side page error, and still closes the browser", async () => {
    const { sql, inserted } = makeCapturingSql();
    const { browser, closeMock } = makeFakeBrowser({ pageErrors: ["TypeError: Cannot read properties of undefined"] });
    launchMock.mockResolvedValue(browser);

    await runStatusChecks(sql, {} as Fetcher);

    const row = inserted.find((r) => r.component === "marketing_render");
    expect(row?.ok).toBe(false);
    expect(row?.detail).toMatch(/uncaught page error/);
    expect(row?.detail).toContain("Cannot read properties of undefined");
    // Same mock browser instance answers both render checks in this fixture
    // (marketing_render, then cleaner_render) — each session must still be
    // closed, i.e. never leaked, regardless of outcome.
    expect(closeMock).toHaveBeenCalled();
  });

  it("marks the component unhealthy on a console.error emitted during load", async () => {
    const { sql, inserted } = makeCapturingSql();
    const { browser } = makeFakeBrowser({ consoleErrors: ["Uncaught ReferenceError: map is not defined"] });
    launchMock.mockResolvedValue(browser);

    await runStatusChecks(sql, {} as Fetcher);

    const row = inserted.find((r) => r.component === "marketing_render");
    expect(row?.ok).toBe(false);
    expect(row?.detail).toMatch(/console error/);
  });

  it("marks the component unhealthy when the post-mount selector never appears (static shell loaded, SPA never rendered)", async () => {
    const { sql, inserted } = makeCapturingSql();
    const { browser, closeMock } = makeFakeBrowser({
      selectorNeverAppears: new Error("waiting for selector `#main-content` failed: timeout 10000ms exceeded"),
    });
    launchMock.mockResolvedValue(browser);

    await runStatusChecks(sql, {} as Fetcher);

    const row = inserted.find((r) => r.component === "cleaner_render");
    expect(row?.ok).toBe(false);
    expect(row?.detail).toContain("timeout");
    expect(closeMock).toHaveBeenCalled();
  });

  it("closes the browser even when navigation itself throws", async () => {
    const { sql, inserted } = makeCapturingSql();
    const { browser, closeMock } = makeFakeBrowser({ gotoError: new Error("net::ERR_CONNECTION_REFUSED") });
    launchMock.mockResolvedValue(browser);

    await runStatusChecks(sql, {} as Fetcher);

    const row = inserted.find((r) => r.component === "marketing_render");
    expect(row?.ok).toBe(false);
    expect(row?.detail).toContain("ERR_CONNECTION_REFUSED");
    expect(closeMock).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getComponentStatus — same table, same path, no parallel display mechanism
// ---------------------------------------------------------------------------

describe("getComponentStatus — render components surface through the existing path", () => {
  it("includes the render components in the enumerated component list (GET /status/components)", async () => {
    const sql = (() => Promise.resolve([])) as unknown as Sql;
    const components = await getComponentStatus(sql);

    const keys = components.map((c) => c.key);
    for (const rc of RENDER_COMPONENTS) {
      expect(keys).toContain(rc.key);
    }
    const renderEntry = components.find((c) => c.key === "marketing_render");
    expect(renderEntry?.ok).toBeNull(); // no checks recorded yet in this fixture
    expect(renderEntry?.label).toBe(RENDER_COMPONENTS[0].label);
  });
});
