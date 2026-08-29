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
import { SITE_SETTINGS_ALLOWLIST, isAllowedSettingKey } from "../src/lib/allowlist";
import { callTool, type ToolContext } from "../src/mcp/tools";
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

describe("site_settings allowlist", () => {
  it("is default-deny", () => {
    expect(isAllowedSettingKey("platform_name")).toBe(true);
    expect(isAllowedSettingKey("scope_review.refusal_fee_pct")).toBe(true);
    expect(isAllowedSettingKey("stripe_secret")).toBe(false);
    expect(isAllowedSettingKey("waitlist")).toBe(false);
    expect(isAllowedSettingKey("scope_review_extra")).toBe(false); // exact keys only
    expect(isAllowedSettingKey("")).toBe(false);
  });

  it("never contains a secret-shaped or PII-shaped key", () => {
    for (const key of SITE_SETTINGS_ALLOWLIST) {
      expect(key).not.toMatch(/token|secret|password|stripe|payout|payment|user|email_list/i);
    }
  });

  it("get_site_settings queries ONLY allowlisted keys and filters unexpected rows", async () => {
    const { sql, calls } = makeSql((text) => {
      if (text.includes("FROM site_settings")) {
        // Simulate a DB that (somehow) returns an extra non-allowlisted row.
        return [
          { key: "platform_name", value: "Sweepr" },
          { key: "sneaky_secret", value: "should-never-escape" },
        ];
      }
      return [];
    });
    const ctx: ToolContext = { sql, env: ENV, adminEmail: "admin@getsweepr.com" };
    const out = (await callTool(ctx, "get_site_settings", {})) as {
      settings: Record<string, string>;
    };
    expect(out.settings.platform_name).toBe("Sweepr");
    expect(out.settings.sneaky_secret).toBeUndefined();
    // The query itself must be parameterized with the allowlist.
    const q = calls.find((c) => c.text.includes("FROM site_settings"));
    expect(q).toBeDefined();
    expect(q!.values[0]).toEqual([...SITE_SETTINGS_ALLOWLIST]);
  });
});
