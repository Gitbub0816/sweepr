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
 * apps/mcp's course-builder tool surface — the SECOND deliberate exception
 * (after promotions) where this MCP worker writes live data. Covers:
 *   - list_courses / get_course / preview_course are read-only
 *   - save_course_draft only ever writes an editable draft version, and
 *     requires a title on create
 *   - publish_course is REJECTED without a passing admin re-verification
 *     (verifyAdminForCourses), even with an otherwise-valid call
 *   - a successful publish_course writes admin_audit_log
 *     (course.published_via_mcp) AND performs the legacy-module cutover
 *     (deactivates training_modules when replaces_module_id is set; no-ops
 *     cleanly when it isn't)
 */
import { describe, it, expect } from "vitest";
import { callTool, TOOL_DEFS, ToolError, type ToolContext } from "../src/mcp/tools";
import { COURSE_TOOL_NAMES } from "../src/mcp/courseTools";
import type { Sql } from "../src/lib/db";
import type { Env } from "../src/types";

const ENV: Env = {
  MCP_ENABLED: "true",
  DATABASE_URL: "postgres://unused",
  CLERK_ADMIN_SECRET_KEY: "sk_test_unused",
  MCP_TOKEN_SECRET: "test-secret",
};

const OWNER_EMAIL = "1morecruise@gmail.com"; // matches adminAuth.ts's FALLBACK_OWNER_EMAILS
const NON_ADMIN_EMAIL = "rando@getsweepr.com";
const COURSE_ID = "11111111-2222-3333-4444-555555555555";
const MODULE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function ctxWith(
  handler: (text: string, values: unknown[]) => unknown,
  adminEmail = OWNER_EMAIL,
): { ctx: ToolContext; calls: Array<{ text: string; values: unknown[] }> } {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    calls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  }) as unknown as Sql;
  return { ctx: { sql, env: ENV, adminEmail }, calls };
}

function courseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COURSE_ID, title: "Course", description: null, category: null,
    status: "draft", required: true, replaces_module_id: null,
    current_version_id: "v1", created_at: "2026-01-01", updated_at: "2026-01-01",
    ...overrides,
  };
}

describe("course tools are registered in the merged TOOL_DEFS", () => {
  it("lists all five course tools", () => {
    const names = TOOL_DEFS.map((t) => t.name);
    for (const n of COURSE_TOOL_NAMES) expect(names).toContain(n);
  });
});

describe("list_courses / get_course / preview_course — read-only", () => {
  it("list_courses returns both courses and the legacy module library, never writes", async () => {
    const { ctx, calls } = ctxWith((text) => {
      if (text.includes("FROM courses c")) return [{ id: COURSE_ID, title: "Course" }];
      if (text.includes("FROM training_modules m")) return [{ id: MODULE_ID, title: "Legacy" }];
      return [];
    });
    const out = (await callTool(ctx, "list_courses", {})) as { courses: unknown[]; legacyModules: unknown[] };
    expect(out.courses).toHaveLength(1);
    expect(out.legacyModules).toHaveLength(1);
    expect(calls.every((c) => c.text.trim().toUpperCase().startsWith("SELECT"))).toBe(true);
  });

  it("get_course defaults to the draft version", async () => {
    const { ctx, calls } = ctxWith((text) => {
      if (text.includes("FROM courses WHERE id")) return [courseRow()];
      if (text.includes("ORDER BY (status = 'draft')")) return [{ id: "v-draft", course_id: COURSE_ID, version_number: 2, status: "draft" }];
      if (text.includes("FROM course_slides")) return [];
      return [];
    });
    const out = (await callTool(ctx, "get_course", { id: COURSE_ID })) as { version: { status: string } | null };
    expect(out.version?.status).toBe("draft");
    expect(calls.every((c) => c.text.trim().toUpperCase().startsWith("SELECT"))).toBe(true);
  });

  it("get_course{published:true} reads the live version, not the draft", async () => {
    const { ctx } = ctxWith((text) => {
      // Check the more specific published-lookup query FIRST — its text is a
      // superset of the generic "FROM courses WHERE id" the top-level course
      // fetch also matches.
      if (text.includes("SELECT current_version_id FROM courses")) {
        return [{ current_version_id: "v-live" }];
      }
      if (text.includes("FROM courses WHERE id")) return [courseRow()];
      if (text.includes("FROM course_versions WHERE id")) return [{ id: "v-live", course_id: COURSE_ID, version_number: 1, status: "published" }];
      if (text.includes("FROM course_slides")) return [];
      return [];
    });
    const out = (await callTool(ctx, "get_course", { id: COURSE_ID, published: true })) as { version: { id: string } | null };
    expect(out.version?.id).toBe("v-live");
  });

  it("get_course requires id", async () => {
    const { ctx } = ctxWith(() => []);
    await expect(callTool(ctx, "get_course", {})).rejects.toThrow(ToolError);
  });

  it("preview_course summarizes block counts, quiz question counts, and flags a video with no streamId", async () => {
    const { ctx } = ctxWith((text) => {
      if (text.includes("FROM courses WHERE id")) return [courseRow()];
      if (text.includes("ORDER BY (status = 'draft')")) return [{ id: "v-draft", course_id: COURSE_ID, version_number: 2, status: "draft" }];
      if (text.includes("FROM course_slides")) return [{ id: "s1", course_version_id: "v-draft", title: "Intro", slide_type: "content", slide_order: 0, background: {}, completion_rule: {} }];
      if (text.includes("FROM slide_blocks")) {
        return [
          { id: "b1", slide_id: "s1", block_type: "quiz", x: 0, y: 0, width: 100, height: 50, z_index: 0, props: { questions: [{ q: "1" }, { q: "2" }] } },
          { id: "b2", slide_id: "s1", block_type: "video", x: 0, y: 50, width: 100, height: 50, z_index: 1, props: {} },
        ];
      }
      return [];
    });
    const out = (await callTool(ctx, "preview_course", { id: COURSE_ID })) as {
      slideCount: number;
      slides: Array<{ quizzes: Array<{ questionCount: number }>; videoBlocksMissingUpload?: number }>;
    };
    expect(out.slideCount).toBe(1);
    expect(out.slides[0].quizzes).toEqual([{ blockId: "b1", questionCount: 2 }]);
    expect(out.slides[0].videoBlocksMissingUpload).toBe(1);
  });
});

describe("save_course_draft — draft-only writes", () => {
  it("creates a new course as status='draft' and requires a title", async () => {
    const { ctx } = ctxWith(() => []);
    await expect(callTool(ctx, "save_course_draft", {})).rejects.toThrow(/title is required/);
  });

  it("create: inserts the course, a draft version, and a default slide when none is given", async () => {
    const { ctx, calls } = ctxWith((text) => {
      if (text.includes("INSERT INTO courses")) return [{ id: COURSE_ID }];
      if (text.includes("INSERT INTO course_versions")) return [{ id: "v1" }];
      if (text.includes("FROM courses WHERE id")) return [courseRow()];
      return [];
    });
    const out = (await callTool(ctx, "save_course_draft", { title: "New course" })) as { saved: boolean };
    expect(out.saved).toBe(true);
    const insertCourse = calls.find((c) => c.text.includes("INSERT INTO courses"));
    expect(insertCourse!.text).toContain("created_by");
    const defaultSlide = calls.find((c) => c.text.includes("INSERT INTO course_slides") && c.text.includes("'Untitled slide'"));
    expect(defaultSlide).toBeDefined();
  });

  it("update: metadata-only when slides is omitted — never touches course_slides", async () => {
    const { ctx, calls } = ctxWith((text) => {
      if (text.includes("SELECT id FROM courses WHERE id")) return [{ id: COURSE_ID }];
      if (text.includes("FROM courses WHERE id")) return [courseRow({ title: "Renamed" })];
      return [];
    });
    const out = (await callTool(ctx, "save_course_draft", { id: COURSE_ID, title: "Renamed" })) as { saved: boolean };
    expect(out.saved).toBe(true);
    expect(calls.some((c) => c.text.includes("DELETE FROM course_slides"))).toBe(false);
  });

  it("update: wholesale-replaces slides when provided, wiping the existing draft's slides first", async () => {
    const { ctx, calls } = ctxWith((text) => {
      if (text.includes("SELECT id FROM courses WHERE id")) return [{ id: COURSE_ID }];
      if (text.includes("SELECT id FROM course_versions WHERE course_id")) return [{ id: "v-draft" }];
      if (text.includes("INSERT INTO course_slides")) return [{ id: "s1" }];
      if (text.includes("FROM courses WHERE id")) return [courseRow()];
      return [];
    });
    const out = (await callTool(ctx, "save_course_draft", {
      id: COURSE_ID,
      slides: [{ slide_order: 0, blocks: [{ block_type: "text", x: 0, y: 0, width: 100, height: 20, props: { content: "hi" } }] }],
    })) as { saved: boolean };
    expect(out.saved).toBe(true);
    expect(calls.some((c) => c.text.includes("DELETE FROM course_slides"))).toBe(true);
    expect(calls.some((c) => c.text.includes("INSERT INTO slide_blocks"))).toBe(true);
  });

  it("update: refuses when the course has no editable draft version left", async () => {
    const { ctx } = ctxWith((text) => {
      if (text.includes("SELECT id FROM courses WHERE id")) return [{ id: COURSE_ID }];
      if (text.includes("SELECT id FROM course_versions WHERE course_id")) return [];
      return [];
    });
    await expect(
      callTool(ctx, "save_course_draft", { id: COURSE_ID, slides: [] }),
    ).rejects.toThrow(/No editable draft version/);
  });

  it("rejects a caller who fails the courses admin gate", async () => {
    const { ctx } = ctxWith(() => [], NON_ADMIN_EMAIL); // no users row → no_user_row
    await expect(callTool(ctx, "save_course_draft", { title: "x" })).rejects.toThrow(/Not authorized/);
  });
});

describe("publish_course — the deliberate exception, its guardrails, and the cutover", () => {
  it("REJECTS publishing when the admin re-verification fails, even with an otherwise-valid call", async () => {
    const { ctx, calls } = ctxWith(() => [], NON_ADMIN_EMAIL); // no users row → no_user_row
    await expect(callTool(ctx, "publish_course", { id: COURSE_ID })).rejects.toThrow(/Not authorized to publish/);
    expect(calls.some((c) => c.text.includes("UPDATE course_versions"))).toBe(false);
  });

  it("REJECTS publishing for an admin whose role doesn't pass the courses gate", async () => {
    const { ctx, calls } = ctxWith((text) => {
      if (text.includes("SELECT role, admin_role, clerk_id FROM users")) {
        return [{ role: "admin", admin_role: null, clerk_id: "user_1" }]; // no admin_role at all → fails
      }
      return [];
    }, "plain-admin@getsweepr.com");
    await expect(callTool(ctx, "publish_course", { id: COURSE_ID })).rejects.toThrow(/Not authorized to publish/);
    expect(calls.some((c) => c.text.includes("UPDATE course_versions"))).toBe(false);
  });

  it("rejects publishing a course id that doesn't exist", async () => {
    const { ctx } = ctxWith(() => []); // SELECT returns no rows
    await expect(callTool(ctx, "publish_course", { id: COURSE_ID })).rejects.toThrow(/No course with that id/);
  });

  it("rejects when there is no draft to publish", async () => {
    const { ctx } = ctxWith((text) => {
      if (text.includes("FROM courses WHERE id")) return [courseRow()];
      if (text.includes("FROM course_versions") && text.includes("status = 'draft'")) return [];
      return [];
    });
    await expect(callTool(ctx, "publish_course", { id: COURSE_ID })).rejects.toThrow(/No draft to publish/);
  });

  it("publishes, clones a fresh draft forward, and writes admin_audit_log — no cutover when replaces_module_id is null", async () => {
    const { ctx, calls } = ctxWith((text) => {
      if (text.includes("FROM courses WHERE id")) return [courseRow({ replaces_module_id: null })];
      if (text.includes("FROM course_versions") && text.includes("status = 'draft'")) return [{ id: "v-draft", version_number: 1 }];
      if (text.includes("INSERT INTO course_versions")) return [{ id: "v2" }];
      if (text.includes("FROM course_slides")) return [];
      return [];
    });
    const out = (await callTool(ctx, "publish_course", { id: COURSE_ID })) as {
      published: boolean;
      cutover: string;
    };
    expect(out.published).toBe(true);
    expect(out.cutover).toMatch(/No legacy module linked/);

    expect(calls.some((c) => c.text.includes("SET status = 'published'") && c.text.includes("course_versions"))).toBe(true);
    expect(calls.some((c) => c.text.includes("UPDATE courses SET status = 'published'"))).toBe(true);
    expect(calls.some((c) => c.text.includes("UPDATE training_modules"))).toBe(false); // no-op: nothing to cut over

    const newDraft = calls.find((c) => c.text.includes("INSERT INTO course_versions"));
    expect(newDraft).toBeDefined();

    const audit = calls.find((c) => c.text.includes("INSERT INTO admin_audit_log"));
    expect(audit).toBeDefined();
    expect(audit!.values).toContain("course.published_via_mcp");
  });

  it("THE CUTOVER: deactivates the legacy module when replaces_module_id is set, in the same publish", async () => {
    const { ctx, calls } = ctxWith((text) => {
      if (text.includes("FROM courses WHERE id")) return [courseRow({ replaces_module_id: MODULE_ID })];
      if (text.includes("FROM course_versions") && text.includes("status = 'draft'")) return [{ id: "v-draft", version_number: 1 }];
      if (text.includes("INSERT INTO course_versions")) return [{ id: "v2" }];
      if (text.includes("FROM course_slides")) return [];
      return [];
    });
    const out = (await callTool(ctx, "publish_course", { id: COURSE_ID })) as { cutover: string };
    expect(out.cutover).toMatch(new RegExp(MODULE_ID));

    const cutoverUpdate = calls.find((c) => c.text.includes("UPDATE training_modules"));
    expect(cutoverUpdate).toBeDefined();
    expect(cutoverUpdate!.text).toContain("status = 'published'");
    expect(cutoverUpdate!.values).toContain(MODULE_ID);

    const audit = calls.find((c) => c.text.includes("INSERT INTO admin_audit_log"));
    // The module id lands inside the JSON-stringified metadata value, not as
    // its own top-level interpolation.
    expect(audit!.values.some((v) => typeof v === "string" && v.includes(MODULE_ID))).toBe(true);
  });
});
