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
import { COURSE_BLOCK_DEFAULTS, COURSE_BLOCK_TYPES } from "@sweepr/utils";
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

describe("block prop validation — rejects what the renderers can't render", () => {
  function saveWith(blocks: unknown[]) {
    const { ctx } = ctxWith((text) => {
      if (text.includes("SELECT id FROM courses WHERE id")) return [{ id: COURSE_ID }];
      if (text.includes("SELECT id FROM course_versions WHERE course_id")) return [{ id: "v-draft" }];
      if (text.includes("INSERT INTO course_slides")) return [{ id: "s1" }];
      if (text.includes("FROM courses WHERE id")) return [courseRow()];
      return [];
    });
    return callTool(ctx, "save_course_draft", {
      id: COURSE_ID,
      slides: [{ slide_order: 0, blocks }],
    });
  }

  const geom = { x: 0, y: 0, width: 50, height: 20 };

  it("REJECTS checklist items as objects — the shape that crashed the player with React error #31", async () => {
    await expect(
      saveWith([{ block_type: "checklist", ...geom, props: { items: [{ text: "Ring the bell" }] } }]),
    ).rejects.toThrow(/items must be an array of plain strings.*objects like/s);
  });

  it("accepts checklist items as plain strings", async () => {
    const out = (await saveWith([
      { block_type: "checklist", ...geom, props: { items: ["Ring the bell", "Photograph every room"] } },
    ])) as { saved: boolean };
    expect(out.saved).toBe(true);
  });

  it("REJECTS `text` on a text block — the key is `content`, and `text` would render blank", async () => {
    await expect(
      saveWith([{ block_type: "text", ...geom, props: { text: "hello" } }]),
    ).rejects.toThrow(/"text" is not a prop of a text block.*content/s);
  });

  it("REJECTS `content` on a callout — a callout's copy key is `body`", async () => {
    await expect(
      saveWith([{ block_type: "callout", ...geom, props: { title: "Note", content: "hi" } }]),
    ).rejects.toThrow(/"content" is not a prop of a callout block/);
  });

  it("REJECTS a value of the wrong type, and an out-of-set enum value", async () => {
    await expect(
      saveWith([{ block_type: "text", ...geom, props: { content: "hi", size: "20px" } }]),
    ).rejects.toThrow(/text\.size must be a number/);
    await expect(
      saveWith([{ block_type: "callout", ...geom, props: { variant: "danger" } }]),
    ).rejects.toThrow(/callout\.variant must be one of: info, warning, success, tip/);
  });

  it("REJECTS props on a spacer, which takes none", async () => {
    await expect(
      saveWith([{ block_type: "spacer", ...geom, props: { content: "x" } }]),
    ).rejects.toThrow(/a spacer block takes no props/);
  });

  it("accepts every block type's documented defaults verbatim", async () => {
    const blocks = COURSE_BLOCK_TYPES.map((t) => ({
      block_type: t,
      ...geom,
      props: COURSE_BLOCK_DEFAULTS[t].props,
    }));
    const out = (await saveWith(blocks)) as { saved: boolean };
    expect(out.saved).toBe(true);
  });

  it("names the offending slide and block in the error path", async () => {
    await expect(
      saveWith([{ block_type: "text", ...geom, props: { content: "ok" } }, { block_type: "text", ...geom, props: { nope: 1 } }]),
    ).rejects.toThrow(/slides\.0\.blocks\.1\.props/);
  });
});

describe("get_course round-trips into save_course_draft", () => {
  it("returns slides in exactly the shape save_course_draft accepts, and flags stored blocks that don't validate", async () => {
    const storedBlock = {
      id: "b1", slide_id: "s1", block_type: "checklist",
      x: 1, y: 2, width: 3, height: 4, z_index: 0,
      props: { items: [{ text: "saved before validation existed" }] },
    };
    const { ctx } = ctxWith((text) => {
      if (text.includes("FROM courses WHERE id")) return [courseRow()];
      if (text.includes("ORDER BY (status = 'draft')")) return [{ id: "v-draft", course_id: COURSE_ID, version_number: 2, status: "draft" }];
      if (text.includes("FROM course_slides")) {
        return [{ id: "s1", course_version_id: "v-draft", title: "Intro", slide_type: "content", slide_order: 0, background: { color: "#fff" }, completion_rule: { type: "viewed" } }];
      }
      if (text.includes("FROM slide_blocks")) return [storedBlock];
      return [];
    });
    const out = (await callTool(ctx, "get_course", { id: COURSE_ID })) as {
      slides: Array<{ blocks: Array<Record<string, unknown>> }>;
      propIssues: Array<{ blockId: string; problems: string[] }>;
    };

    // DB-internal keys the save schema has no field for are dropped.
    const block = out.slides[0].blocks[0];
    expect(block).not.toHaveProperty("slide_id");
    expect(out.slides[0]).not.toHaveProperty("course_version_id");
    expect(Object.keys(block).sort()).toEqual(
      ["block_type", "height", "id", "props", "width", "x", "y", "z_index"],
    );

    // …and the malformed stored props are reported rather than passed off as fine.
    expect(out.propIssues).toHaveLength(1);
    expect(out.propIssues[0].blockId).toBe("b1");
    expect(out.propIssues[0].problems[0]).toMatch(/plain strings/);
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

describe("localization + assessment fields round-trip through save/get", () => {
  it("save_course_draft persists locales, course i18n and version settings on create", async () => {
    const { ctx, calls } = ctxWith((text) => {
      if (text.includes("FROM users")) return [{ email: OWNER_EMAIL, role: "super_admin", clerk_id: "ck_1" }];
      if (text.trim().startsWith("INSERT INTO courses")) return [{ id: COURSE_ID }];
      if (text.includes("INSERT INTO course_versions")) return [{ id: "v1" }];
      if (text.includes("FROM courses WHERE id")) return [courseRow({ default_locale: "en", supported_locales: ["en", "es"] })];
      return [];
    });
    const out = (await callTool(ctx, "save_course_draft", {
      title: "Bilingual course",
      default_locale: "en",
      supported_locales: ["en", "es"],
      i18n: { es: { title: "Curso bilingüe" } },
      assessment: { passingScorePct: 80, maxAttempts: 3, shuffleAnswers: true },
    })) as { saved: boolean };
    expect(out.saved).toBe(true);
    const courseInsert = calls.find((c) => c.text.trim().startsWith("INSERT INTO courses"));
    expect(courseInsert?.text).toContain("default_locale");
    expect(courseInsert?.values).toContainEqual(["en", "es"]);
    const versionInsert = calls.find((c) => c.text.includes("INSERT INTO course_versions"));
    expect(versionInsert?.text).toContain("settings");
    expect(versionInsert?.values.some((v) => typeof v === "string" && v.includes("passingScorePct"))).toBe(true);
  });

  it("rejects supported_locales that exclude the default, and bad assessment settings", async () => {
    const { ctx } = ctxWith(() => []);
    await expect(
      callTool(ctx, "save_course_draft", { title: "X", default_locale: "es", supported_locales: ["en"] }),
    ).rejects.toThrow(/supported_locales must include default_locale/);
    await expect(
      callTool(ctx, "save_course_draft", { title: "X", assessment: { passingScorePct: 0 } }),
    ).rejects.toThrow(/between 1 and 100/);
  });

  it("blocks may carry props.i18n overlays; answer keys stay untranslatable", async () => {
    const { ctx } = ctxWith((text) => {
      if (text.includes("FROM users")) return [{ email: OWNER_EMAIL, role: "super_admin", clerk_id: "ck_1" }];
      if (text.includes("FROM courses WHERE id")) return [courseRow()];
      if (text.includes("status = 'draft'")) return [{ id: "v1" }];
      if (text.includes("INSERT INTO course_slides")) return [{ id: "s1" }];
      return [];
    });
    const slide = (blockProps: Record<string, unknown>) => ({
      slide_order: 0,
      blocks: [{ block_type: "true_false", x: 10, y: 10, width: 60, height: 30, props: blockProps }],
    });
    const good = (await callTool(ctx, "save_course_draft", {
      id: COURSE_ID,
      slides: [slide({ statement: "S", correct: true, i18n: { es: { statement: "D" } } })],
    })) as { saved: boolean };
    expect(good.saved).toBe(true);
    await expect(
      callTool(ctx, "save_course_draft", {
        id: COURSE_ID,
        slides: [slide({ statement: "S", correct: true, i18n: { es: { correct: false } } })],
      }),
    ).rejects.toThrow(/not localizable/);
  });

  it("preview_course reports assetIssues and translationGaps", async () => {
    const { ctx } = ctxWith((text) => {
      if (text.includes("FROM courses WHERE id")) {
        return [courseRow({ default_locale: "en", supported_locales: ["en", "es"], i18n: {} })];
      }
      if (text.includes("ORDER BY (status = 'draft')")) return [{ id: "v1", course_id: COURSE_ID, version_number: 1, status: "draft" }];
      if (text.includes("SELECT settings FROM course_versions")) return [{ settings: { passingScorePct: 80 } }];
      if (text.includes("FROM course_slides")) {
        return [{ id: "s1", course_version_id: "v1", title: "Intro", slide_type: "content", slide_order: 0, background: {}, completion_rule: { type: "viewed" }, i18n: {} }];
      }
      if (text.includes("FROM slide_blocks")) {
        return [
          { id: "b1", slide_id: "s1", block_type: "image", x: 0, y: 0, width: 50, height: 50, z_index: 0, props: { url: "", caption: "A room" } },
          { id: "b2", slide_id: "s1", block_type: "text", x: 0, y: 60, width: 50, height: 20, z_index: 1, props: { content: "Untranslated copy" } },
        ];
      }
      return [];
    });
    const out = (await callTool(ctx, "preview_course", { id: COURSE_ID })) as {
      assessment: Record<string, unknown>;
      assetIssues: Array<{ blockType: string; problem: string }>;
      translationGaps: Record<string, string[]>;
    };
    expect(out.assessment).toEqual({ passingScorePct: 80 });
    expect(out.assetIssues.some((i) => i.blockType === "image" && i.problem.includes("no url"))).toBe(true);
    expect(out.translationGaps.es).toContain("course.title");
    expect(out.translationGaps.es.some((g) => g.includes("text.content"))).toBe(true);
    expect(out.translationGaps.es.some((g) => g.includes("slide[0].title"))).toBe(true);
  });
});

describe("upload_course_asset — image assets through the MCP", () => {
  const PNG_B64 = Buffer.from("fake-png-bytes").toString("base64");

  function ctxWithBucket(adminRole = "super_admin", withBinding = true) {
    const puts: Array<{ key: string; bytes: number; contentType?: string }> = [];
    const base = ctxWith((text) => {
      if (text.includes("FROM users")) return [{ email: OWNER_EMAIL, role: adminRole, clerk_id: "ck_1" }];
      return [];
    });
    const env = {
      ...ENV,
      R2_PUBLIC_URL: "https://objects.getsweepr.com",
      ...(withBinding
        ? {
            COURSE_ASSETS: {
              put: async (key: string, value: Uint8Array, opts?: { httpMetadata?: { contentType?: string } }) => {
                puts.push({ key, bytes: value.length, contentType: opts?.httpMetadata?.contentType });
                return {};
              },
            } as unknown as Env["COURSE_ASSETS"],
          }
        : {}),
    };
    return { ctx: { ...base.ctx, env }, puts };
  }

  it("stores a base64 image under the training/ prefix and returns its public url", async () => {
    const { ctx, puts } = ctxWithBucket();
    const out = (await callTool(ctx, "upload_course_asset", {
      filename: "Bathroom Before.PNG",
      content_type: "image/png",
      data_base64: PNG_B64,
      course_id: COURSE_ID,
    })) as { uploaded: boolean; url: string; storageKey: string; contentType: string };
    expect(out.uploaded).toBe(true);
    expect(out.storageKey).toMatch(new RegExp(`^training/${COURSE_ID}/\\d+-bathroom-before\\.png$`));
    expect(out.url).toBe(`https://objects.getsweepr.com/${out.storageKey}`);
    expect(puts).toHaveLength(1);
    expect(puts[0].contentType).toBe("image/png");
  });

  it("files assets with no course under the shared library prefix", async () => {
    const { ctx } = ctxWithBucket();
    const out = (await callTool(ctx, "upload_course_asset", {
      filename: "supplies.png",
      content_type: "image/png",
      data_base64: PNG_B64,
    })) as { storageKey: string };
    expect(out.storageKey).toMatch(/^training\/mcp-library\//);
  });

  it("rejects disallowed content types, bad base64, plaintext/local source urls, and non-admins", async () => {
    const { ctx } = ctxWithBucket();
    await expect(
      callTool(ctx, "upload_course_asset", { content_type: "image/gif", data_base64: PNG_B64 }),
    ).rejects.toThrow(/content_type must be one of/);
    await expect(
      callTool(ctx, "upload_course_asset", { content_type: "image/png", data_base64: "!!not-base64!!" }),
    ).rejects.toThrow(/not valid base64/);
    await expect(
      callTool(ctx, "upload_course_asset", { source_url: "http://internal.host/x.png" }),
    ).rejects.toThrow(/public https/);
    await expect(
      callTool(ctx, "upload_course_asset", { source_url: "https://127.0.0.1/x.png" }),
    ).rejects.toThrow(/public https/);

    const nonAdmin = ctxWithBucket("cleaner");
    nonAdmin.ctx.adminEmail = NON_ADMIN_EMAIL;
    await expect(
      callTool(nonAdmin.ctx, "upload_course_asset", { content_type: "image/png", data_base64: PNG_B64 }),
    ).rejects.toThrow(/Not authorized/);
  });

  it("fails closed with a clear message when the R2 binding is missing", async () => {
    const { ctx } = ctxWithBucket("super_admin", false);
    await expect(
      callTool(ctx, "upload_course_asset", { content_type: "image/png", data_base64: PNG_B64 }),
    ).rejects.toThrow(/COURSE_ASSETS R2 binding missing/);
  });
});
