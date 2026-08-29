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
import { buildColdStartConfig } from "@sweepr/quote-engine";
import { callTool, TOOL_DEFS, type ToolContext } from "../src/mcp/tools";
import { handleMcpMessage } from "../src/mcp/protocol";
import type { Sql } from "../src/lib/db";
import type { Env } from "../src/types";

const ENV = {
  MCP_ENABLED: "true",
  DATABASE_URL: "postgres://unused",
  CLERK_ADMIN_SECRET_KEY: "sk_test_unused",
  MCP_TOKEN_SECRET: "test-secret",
} as Env;

function makeSql(handler: (text: string, values: unknown[]) => unknown) {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    calls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  }) as unknown as Sql;
  return { sql, calls };
}

function ctxWith(handler: (text: string, values: unknown[]) => unknown): {
  ctx: ToolContext;
  calls: Array<{ text: string; values: unknown[] }>;
} {
  const { sql, calls } = makeSql(handler);
  return { ctx: { sql, env: ENV, adminEmail: "admin@getsweepr.com" }, calls };
}

describe("get_payload_template", () => {
  it("returns a valid cold-start template with instructions and upload guidance", async () => {
    const { ctx, calls } = ctxWith(() => []);
    const out = (await callTool(ctx, "get_payload_template", {})) as Record<string, unknown>;
    expect(out.template).toEqual(buildColdStartConfig());
    const instructions = out.instructions as Record<string, string>;
    expect(instructions.laborMatrix).toContain("minutes");
    expect(instructions["rates.customerLaborRateCentsPerHour"]).toContain("cents");
    // Purely static: no DB access.
    expect(calls.length).toBe(0);
  });
});

describe("simulate_quote", () => {
  const input = {
    counts: { kitchen: 1, bathroom: 2, bedroom: 3, living_room: 1 },
    conditions: { kitchen: 2, bathroom: 2, bedroom: 2, living_room: 2 },
    sqft: 1600,
    extras: [],
  };

  it("falls back to cold-start defaults when no sandbox config is stored", async () => {
    const { ctx } = ctxWith(() => []); // sandbox SELECT returns no rows
    const out = (await callTool(ctx, "simulate_quote", { input })) as {
      source: string;
      result: { totalCents: number; expectedLaborMinutes: number };
      customerSummary: { total: string };
    };
    expect(out.source).toContain("cold-start defaults");
    expect(out.result.totalCents).toBeGreaterThan(0);
    expect(out.result.expectedLaborMinutes).toBeGreaterThan(0);
    expect(out.customerSummary.total).toMatch(/^\$\d+\.\d{2}$/);
  });

  it("uses the stored sandbox config when present", async () => {
    const config = buildColdStartConfig();
    const { ctx } = ctxWith((text) =>
      text.includes("FROM mcp_simulator_configs")
        ? [{ config, notes: null, updated_at: "2026-08-29" }]
        : [],
    );
    const out = (await callTool(ctx, "simulate_quote", { input, name: "proposal-a" })) as {
      source: string;
      result: { pricingVersionId: string };
    };
    expect(out.source).toContain('sandbox config "proposal-a"');
    expect(out.result.pricingVersionId).toBe("mcp-sim");
  });
});

describe("set_simulator_config", () => {
  it("refuses an invalid config (errors) without writing", async () => {
    const bad = buildColdStartConfig();
    bad.rates.customerLaborRateCentsPerHour = 1; // below the $20/hr floor
    const { ctx, calls } = ctxWith(() => []);
    const out = (await callTool(ctx, "set_simulator_config", { config: bad })) as {
      stored: boolean;
      ok: boolean;
      errors: string[];
    };
    expect(out.stored).toBe(false);
    expect(out.ok).toBe(false);
    expect(out.errors.length).toBeGreaterThan(0);
    expect(calls.some((c) => c.text.includes("INSERT INTO mcp_simulator_configs"))).toBe(false);
  });

  it("stores a valid config via upsert keyed by admin_email", async () => {
    const { ctx, calls } = ctxWith(() => []);
    const out = (await callTool(ctx, "set_simulator_config", {
      config: buildColdStartConfig(),
      notes: "test",
    })) as { stored: boolean };
    expect(out.stored).toBe(true);
    const ins = calls.find((c) => c.text.includes("INSERT INTO mcp_simulator_configs"));
    expect(ins).toBeDefined();
    expect(ins!.values).toContain("admin@getsweepr.com");
    expect(ins!.text).toContain("ON CONFLICT (admin_email, name)");
  });
});

describe("set_simulator_config completeness (defaults merge)", () => {
  it("fills a missing field from cold-start defaults and stores the completed config", async () => {
    // A partial config from the LLM: a complete cold-start config minus one field.
    const partial = buildColdStartConfig() as unknown as { rates: Record<string, unknown> };
    delete partial.rates.extraCleanerFeeCentsPer100Sqft;
    const { ctx, calls } = ctxWith(() => []);
    const out = (await callTool(ctx, "set_simulator_config", { config: partial })) as {
      stored: boolean;
      ok: boolean;
      defaultedFields: string[];
    };
    expect(out.ok).toBe(true);
    expect(out.stored).toBe(true);
    // The tool reports which fields it filled from defaults.
    expect(out.defaultedFields).toContain("rates.extraCleanerFeeCentsPer100Sqft");
    // The completed config is what gets stored — the missing field is present.
    const ins = calls.find((c) => c.text.includes("INSERT INTO mcp_simulator_configs"));
    expect(ins).toBeDefined();
    const storedJson = ins!.values.find(
      (v) => typeof v === "string" && v.includes("extraCleanerFeeCentsPer100Sqft"),
    ) as string;
    expect(storedJson).toBeDefined();
    const stored = JSON.parse(storedJson) as { rates: { extraCleanerFeeCentsPer100Sqft: number } };
    expect(stored.rates.extraCleanerFeeCentsPer100Sqft).toBe(100);
  });

  it("completes a heavily partial config so it validates and stores", async () => {
    // Only one field supplied; everything else must come from defaults.
    const partial = { rates: { customerLaborRateCentsPerHour: 7000 } };
    const { ctx, calls } = ctxWith(() => []);
    const out = (await callTool(ctx, "set_simulator_config", { config: partial })) as {
      stored: boolean;
      ok: boolean;
      defaultedFields: string[];
    };
    expect(out.ok).toBe(true);
    expect(out.stored).toBe(true);
    // Whole missing subtrees (e.g. laborMatrix, inference) are reported.
    expect(out.defaultedFields).toContain("laborMatrix");
    expect(calls.some((c) => c.text.includes("INSERT INTO mcp_simulator_configs"))).toBe(true);
  });

  it("still rejects an out-of-bounds value even after the defaults merge", async () => {
    // The one field the caller DID set is invalid — merging defaults must not
    // paper over a hard error.
    const partial = { rates: { customerLaborRateCentsPerHour: 1 } }; // below the $20/hr floor
    const { ctx, calls } = ctxWith(() => []);
    const out = (await callTool(ctx, "set_simulator_config", { config: partial })) as {
      stored: boolean;
      ok: boolean;
      errors: string[];
    };
    expect(out.stored).toBe(false);
    expect(out.ok).toBe(false);
    expect(out.errors.length).toBeGreaterThan(0);
    expect(calls.some((c) => c.text.includes("INSERT INTO mcp_simulator_configs"))).toBe(false);
  });
});

describe("introducing a brand-new add-on via the payload", () => {
  // A key that does NOT exist in the cold-start catalog.
  const NEW_EXTRA = {
    key: "inside_windows_test",
    label: "Interior windows",
    mode: "both" as const,
    minutesPerUnit: 4,
    fixedCentsPerUnit: 300,
    unitLabel: "window",
    minQuantity: 1,
    maxQuantity: 30,
    payoutTreatment: "standard" as const,
    active: true,
  };

  function configWithNewExtra() {
    const cfg = buildColdStartConfig();
    // Ensure the key is genuinely new.
    expect(cfg.extras.some((e) => e.key === NEW_EXTRA.key)).toBe(false);
    cfg.extras = [...cfg.extras, NEW_EXTRA];
    return cfg;
  }

  it("validates and stores a config that introduces a new add-on", async () => {
    const { ctx, calls } = ctxWith(() => []);
    const out = (await callTool(ctx, "set_simulator_config", {
      config: configWithNewExtra(),
      name: "new-addon",
    })) as { stored: boolean; ok: boolean; errors: string[] };
    expect(out.ok).toBe(true);
    expect(out.stored).toBe(true);
    expect(calls.some((c) => c.text.includes("INSERT INTO mcp_simulator_configs"))).toBe(true);
  });

  it("prices the new add-on in a simulation", async () => {
    const cfg = configWithNewExtra();
    const { ctx } = ctxWith((text) =>
      text.includes("FROM mcp_simulator_configs")
        ? [{ config: cfg, notes: null, updated_at: "2026-08-29" }]
        : [],
    );
    const base = (await callTool(ctx, "simulate_quote", {
      name: "new-addon",
      input: { counts: { kitchen: 1, bathroom: 1, bedroom: 1, living_room: 1 },
        conditions: { kitchen: 2, bathroom: 2, bedroom: 2, living_room: 2 }, extras: [] },
    })) as { result: { totalCents: number } };
    const withExtra = (await callTool(ctx, "simulate_quote", {
      name: "new-addon",
      input: { counts: { kitchen: 1, bathroom: 1, bedroom: 1, living_room: 1 },
        conditions: { kitchen: 2, bathroom: 2, bedroom: 2, living_room: 2 },
        extras: [{ key: NEW_EXTRA.key, quantity: 5 }] },
    })) as { result: { totalCents: number } };
    // The brand-new add-on actually adds to the price.
    expect(withExtra.result.totalCents).toBeGreaterThan(base.result.totalCents);
  });

  it("carries the new add-on into the drafted upload payload", async () => {
    const cfg = configWithNewExtra();
    const { ctx } = ctxWith((text) =>
      text.includes("FROM mcp_simulator_configs")
        ? [{ config: cfg, notes: "adds interior windows", updated_at: "2026-08-29" }]
        : [],
    );
    const out = (await callTool(ctx, "draft_pricing_payload", { name: "new-addon" })) as {
      ok: boolean;
      payload: { config: { extras: Array<{ key: string }> } };
    };
    expect(out.ok).toBe(true);
    expect(out.payload.config.extras.some((e) => e.key === NEW_EXTRA.key)).toBe(true);
  });
});

describe("MCP protocol dispatch", () => {
  it("initialize advertises tools/resources/prompts", async () => {
    const { ctx } = ctxWith(() => []);
    const out = await handleMcpMessage(ctx, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });
    expect(out.status).toBe(200);
    const result = (out.body as { result: { capabilities: object; protocolVersion: string } }).result;
    expect(Object.keys(result.capabilities)).toEqual(["tools", "resources", "prompts"]);
  });

  it("notifications/initialized is accepted with 202 and no body", async () => {
    const { ctx } = ctxWith(() => []);
    const out = await handleMcpMessage(ctx, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(out.status).toBe(202);
    expect(out.body).toBeNull();
  });

  it("tools/list matches the tool defs and tools/call dispatches + audit-logs", async () => {
    const { ctx, calls } = ctxWith(() => []);
    const listed = await handleMcpMessage(ctx, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tools = (listed.body as { result: { tools: Array<{ name: string }> } }).result.tools;
    expect(tools.map((t) => t.name)).toEqual(TOOL_DEFS.map((t) => t.name));

    const called = await handleMcpMessage(ctx, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_payload_template", arguments: {} },
    });
    const content = (called.body as { result: { content: Array<{ type: string; text: string }> } })
      .result.content;
    expect(content[0].type).toBe("text");
    expect(JSON.parse(content[0].text).template).toBeDefined();
    // Every tool call is audit-logged.
    expect(calls.some((c) => c.text.includes("INSERT INTO mcp_action_log"))).toBe(true);
  });

  it("unknown tools and unknown methods return JSON-RPC errors", async () => {
    const { ctx } = ctxWith(() => []);
    const badTool = await handleMcpMessage(ctx, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "drop_all_tables", arguments: {} },
    });
    expect((badTool.body as { error: { code: number } }).error.code).toBe(-32602);

    const badMethod = await handleMcpMessage(ctx, { jsonrpc: "2.0", id: 5, method: "nope" });
    expect((badMethod.body as { error: { code: number } }).error.code).toBe(-32601);
  });

  it("resources/read serves the field guide; prompts/get serves the skill", async () => {
    const { ctx } = ctxWith(() => []);
    const res = await handleMcpMessage(ctx, {
      jsonrpc: "2.0",
      id: 6,
      method: "resources/read",
      params: { uri: "sweepr://config-field-guide" },
    });
    const contents = (res.body as { result: { contents: Array<{ text: string }> } }).result.contents;
    expect(contents[0].text).toContain("INTEGER CENTS");

    const prompt = await handleMcpMessage(ctx, {
      jsonrpc: "2.0",
      id: 7,
      method: "prompts/get",
      params: { name: "sweepr-pricing-assistant" },
    });
    const messages = (prompt.body as { result: { messages: Array<{ content: { text: string } }> } })
      .result.messages;
    expect(messages[0].content.text).toContain("NEVER change live pricing");
  });
});
