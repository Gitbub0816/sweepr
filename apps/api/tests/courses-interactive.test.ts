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
 * Learner course routes (routes/courses.ts) — the interactive block layer's
 * server-authoritative half. Pins the four properties that matter:
 *
 *  1. SANITIZATION: a served course never contains an answer key or feedback
 *     string — correct flags, sort categories, correctOrder, hotspot regions
 *     all stripped (regions become targetCount), whatever the block.
 *  2. LOCALIZATION: ?locale=es serves the es overlay merged over base
 *     content — one course record, no duplicates — and falls back to the
 *     default locale when the requested one isn't supported.
 *  3. GRADING: /respond grades server-side from the STORED props, records
 *     the verdict against the learner's current attempt, and returns the
 *     author's feedback; malformed shapes 400, stale versions 409.
 *  4. ASSESSMENT: a course with settings.passingScorePct completes ONLY
 *     through /finish (a client's completed:true on /progress is demoted),
 *     and /finish applies pass marks + maxAttempts retake rules.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppBindings } from "../src/types";

type Handler = (text: string, values: unknown[]) => unknown;
let sqlCalls: Array<{ text: string; values: unknown[] }> = [];
let handler: Handler = () => [];

vi.mock("../src/lib/db", () => ({
  getDb: () =>
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      sqlCalls.push({ text, values });
      return Promise.resolve(handler(text, values) ?? []);
    },
}));
vi.mock("../src/middleware/auth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { clerkId: "clerk_learner" });
    await next();
  },
}));
const recomputeMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../src/lib/trainingCompletion", () => ({
  recomputeTrainingCompletion: (...args: unknown[]) => recomputeMock(...args),
}));

import { coursesRouter } from "../src/routes/courses";

const COURSE_ID = "11111111-2222-3333-4444-555555555555";
const VERSION_ID = "aaaaaaaa-1111-2222-3333-444444444444";
const SLIDE_ID = "bbbbbbbb-1111-2222-3333-444444444444";
const TF_BLOCK = "cccccccc-1111-2222-3333-444444444444";
const SORT_BLOCK = "dddddddd-1111-2222-3333-444444444444";
const HOTSPOT_BLOCK = "eeeeeeee-1111-2222-3333-444444444444";

function buildApp() {
  const app = new Hono<AppBindings>();
  app.route("/courses", coursesRouter);
  return app;
}

const ENV = { DATABASE_URL: "postgres://unused" } as Record<string, string>;

const courseRow = {
  id: COURSE_ID,
  title: "Bathroom readiness",
  description: "Judge when a bathroom is done.",
  category: "cleaning",
  current_version_id: VERSION_ID,
  default_locale: "en",
  supported_locales: ["en", "es"],
  i18n: { es: { title: "Preparación del baño" } },
};

const blocks = [
  {
    id: TF_BLOCK, slide_id: SLIDE_ID, block_type: "true_false",
    x: 5, y: 5, width: 60, height: 30, z_index: 0,
    props: {
      statement: "This bathroom is ready.",
      correct: false,
      correctFeedback: "Right.",
      incorrectFeedback: "Look at the mirror streaks.",
      explanation: "Mirrors count.",
      i18n: { es: { statement: "Este baño está listo." } },
    },
  },
  {
    id: SORT_BLOCK, slide_id: SLIDE_ID, block_type: "sort",
    x: 5, y: 40, width: 60, height: 40, z_index: 1,
    props: {
      prompt: "Sort the tasks.",
      categories: ["Included", "Add-On"],
      items: [
        { id: "1", label: "Vacuum", category: "Included" },
        { id: "2", label: "Inside oven", category: "Add-On" },
      ],
    },
  },
  {
    id: HOTSPOT_BLOCK, slide_id: SLIDE_ID, block_type: "hotspot",
    x: 66, y: 5, width: 30, height: 60, z_index: 2,
    props: {
      url: "https://objects.getsweepr.com/training/x.jpg",
      prompt: "Tap what needs attention.",
      hotspots: [
        { x: 10, y: 10, width: 10, height: 10, correct: true, label: "Sink" },
        { x: 60, y: 60, width: 10, height: 10, correct: true, label: "Floor" },
      ],
    },
  },
];

function serveCourse(overrides: { settings?: Record<string, unknown>; progress?: unknown[] } = {}) {
  handler = (text) => {
    if (text.includes("SELECT c.id, c.title")) return [courseRow];
    if (text.includes("SELECT id, settings FROM course_versions")) return [{ id: VERSION_ID, settings: overrides.settings ?? {} }];
    if (text.includes("FROM course_slides")) {
      return [{ id: SLIDE_ID, title: "Check the bathroom", slide_type: "assessment", slide_order: 0, background: {}, completion_rule: { type: "viewed" }, i18n: { es: { title: "Revisa el baño" } } }];
    }
    if (text.includes("FROM slide_blocks")) return blocks;
    if (text.includes("FROM user_course_progress")) return overrides.progress ?? [];
    if (text.includes("FROM course_interaction_responses")) return [];
    return [];
  };
}

beforeEach(() => {
  sqlCalls = [];
  recomputeMock.mockClear();
  handler = () => [];
});

describe("GET /courses/:id — sanitization", () => {
  it("never serves an answer key or feedback string, and hotspots become a targetCount", async () => {
    serveCourse();
    const app = buildApp();
    const res = await app.request(`/courses/${COURSE_ID}`, {}, ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    const raw = JSON.stringify(body.slides);
    expect(raw).not.toContain('"correct"');
    expect(raw).not.toContain("correctFeedback");
    expect(raw).not.toContain("incorrectFeedback");
    expect(raw).not.toContain('"explanation"');
    expect(raw).not.toContain('"category"');
    expect(raw).not.toContain("hotspots");
    expect(raw).not.toContain("i18n");
    const hotspot = body.slides[0].blocks.find((b: { id: string }) => b.id === HOTSPOT_BLOCK);
    expect(hotspot.props.targetCount).toBe(2);
    // Sort items survive with ids + labels only.
    const sort = body.slides[0].blocks.find((b: { id: string }) => b.id === SORT_BLOCK);
    expect(sort.props.items.map((i: { id: string }) => i.id).sort()).toEqual(["1", "2"]);
    expect(Object.keys(sort.props.items[0]).sort()).toEqual(["id", "label"]);
  });

  it("serves the es overlay for ?locale=es and falls back for unsupported locales", async () => {
    serveCourse();
    const app = buildApp();
    const es = await (await app.request(`/courses/${COURSE_ID}?locale=es`, {}, ENV)).json();
    expect(es.course.locale).toBe("es");
    expect(es.course.title).toBe("Preparación del baño");
    expect(es.slides[0].title).toBe("Revisa el baño");
    const tf = es.slides[0].blocks.find((b: { id: string }) => b.id === TF_BLOCK);
    expect(tf.props.statement).toBe("Este baño está listo.");

    const ko = await (await app.request(`/courses/${COURSE_ID}?locale=ko`, {}, ENV)).json();
    expect(ko.course.locale).toBe("en");
    expect(ko.course.title).toBe("Bathroom readiness");
  });
});

describe("POST /courses/:id/respond — server-side grading", () => {
  function serveRespond(settings: Record<string, unknown> = {}) {
    handler = (text) => {
      if (text.includes("SELECT current_version_id, default_locale")) return [courseRow];
      if (text.includes("FROM slide_blocks b")) return [blocks[0]];
      if (text.includes("SELECT attempt FROM user_course_progress")) return [{ attempt: 3 }];
      if (text.includes("SELECT settings FROM course_versions")) return [{ settings }];
      return [];
    };
  }

  it("grades against stored props, records the verdict on the current attempt, and returns feedback", async () => {
    serveRespond();
    const app = buildApp();
    const res = await app.request(`/courses/${COURSE_ID}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_version_id: VERSION_ID, block_id: TF_BLOCK, response: { answer: true } }),
    }, ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.correct).toBe(false);
    expect(body.feedback).toBe("Look at the mirror streaks.");
    expect(body.canRetry).toBe(true);
    expect(body.attempt).toBe(3);
    const upsert = sqlCalls.find((c) => c.text.includes("INSERT INTO course_interaction_responses"));
    expect(upsert).toBeTruthy();
    expect(upsert!.values).toContain(3); // attempt
    expect(upsert!.values).toContain(false); // is_correct
  });

  it("localizes the feedback when the learner answers in Spanish", async () => {
    serveRespond();
    const app = buildApp();
    const res = await app.request(`/courses/${COURSE_ID}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_version_id: VERSION_ID, block_id: TF_BLOCK, response: { answer: false }, locale: "es" }),
    }, ENV);
    const body = await res.json();
    expect(body.correct).toBe(true);
    expect(body.feedback).toBe("Right."); // no es override for feedback → base survives
  });

  it("409s a stale version, 400s a non-interactive block and a malformed response", async () => {
    const app = buildApp();

    handler = (text) => (text.includes("SELECT current_version_id, default_locale") ? [{ ...courseRow, current_version_id: "other" }] : []);
    const stale = await app.request(`/courses/${COURSE_ID}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_version_id: VERSION_ID, block_id: TF_BLOCK, response: { answer: true } }),
    }, ENV);
    expect(stale.status).toBe(409);

    handler = (text) => {
      if (text.includes("SELECT current_version_id, default_locale")) return [courseRow];
      if (text.includes("FROM slide_blocks b")) return [{ id: TF_BLOCK, block_type: "text", props: {} }];
      return [];
    };
    const notInteractive = await app.request(`/courses/${COURSE_ID}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_version_id: VERSION_ID, block_id: TF_BLOCK, response: { answer: true } }),
    }, ENV);
    expect(notInteractive.status).toBe(400);

    serveRespond();
    const malformed = await app.request(`/courses/${COURSE_ID}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_version_id: VERSION_ID, block_id: TF_BLOCK, response: { answer: "yes" } }),
    }, ENV);
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error).toBe("invalid_response_shape");
  });
});

describe("POST /courses/:id/finish — assessment settings", () => {
  function serveFinish(opts: {
    settings: Record<string, unknown>;
    attempt?: number;
    responses?: Array<{ block_id: string; is_correct: boolean }>;
  }) {
    handler = (text) => {
      if (text.includes("SELECT current_version_id FROM courses")) return [{ current_version_id: VERSION_ID }];
      if (text.includes("SELECT settings FROM course_versions")) return [{ settings: opts.settings }];
      if (text.includes("SELECT b.id FROM slide_blocks b")) return [{ id: TF_BLOCK }, { id: SORT_BLOCK }];
      if (text.includes("SELECT id, attempt FROM user_course_progress")) return [{ id: "prog-1", attempt: opts.attempt ?? 1 }];
      if (text.includes("FROM course_interaction_responses")) return opts.responses ?? [];
      if (text.includes("SELECT c.id FROM cleaners")) return [];
      return [];
    };
  }

  const post = (app: ReturnType<typeof buildApp>) =>
    app.request(`/courses/${COURSE_ID}/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_version_id: VERSION_ID }),
    }, ENV);

  it("passes at/above the pass mark and completes the course", async () => {
    serveFinish({ settings: { passingScorePct: 50 }, responses: [{ block_id: TF_BLOCK, is_correct: true }] });
    const app = buildApp();
    const body = await (await post(app)).json();
    expect(body.passed).toBe(true);
    expect(body.scorePct).toBe(50);
    const update = sqlCalls.find((c) => c.text.includes("status = 'completed'"));
    expect(update).toBeTruthy();
  });

  it("opens the next attempt on a fail with attempts remaining", async () => {
    serveFinish({ settings: { passingScorePct: 80, maxAttempts: 3 }, attempt: 1, responses: [] });
    const app = buildApp();
    const body = await (await post(app)).json();
    expect(body.passed).toBe(false);
    expect(body.attemptsLeft).toBe(2);
    const bump = sqlCalls.find((c) => c.text.includes("attempt = ?") && c.values.includes(2));
    expect(bump).toBeTruthy();
  });

  it("marks the course failed once attempts are exhausted, and hides the score when showScore=false", async () => {
    serveFinish({ settings: { passingScorePct: 80, maxAttempts: 2, showScore: false }, attempt: 2, responses: [] });
    const app = buildApp();
    const body = await (await post(app)).json();
    expect(body.passed).toBe(false);
    expect(body.attemptsLeft).toBe(0);
    expect(body.scorePct).toBeNull();
    const fail = sqlCalls.find((c) => c.text.includes("status = 'failed'"));
    expect(fail).toBeTruthy();
  });

  it("completes without a pass mark (non-assessed course)", async () => {
    serveFinish({ settings: {}, responses: [] });
    const app = buildApp();
    const body = await (await post(app)).json();
    expect(body.passed).toBe(true);
  });
});

describe("POST /courses/:id/progress — the demotion guard", () => {
  it("demotes a client's completed:true on a pass/fail course to view tracking", async () => {
    handler = (text) => {
      if (text.includes("SELECT settings FROM course_versions")) return [{ settings: { passingScorePct: 80 } }];
      if (text.includes("INSERT INTO user_course_progress")) return [{ id: "prog-1" }];
      return [];
    };
    const app = buildApp();
    const res = await app.request(`/courses/${COURSE_ID}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_version_id: VERSION_ID, progress_percent: 100, completed: true }),
    }, ENV);
    expect(res.status).toBe(200);
    const insert = sqlCalls.find((c) => c.text.includes("INSERT INTO user_course_progress"));
    expect(insert!.values).toContain("in_progress");
    expect(insert!.values).not.toContain("completed");
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it("still completes normally when the course has no pass mark", async () => {
    handler = (text) => {
      if (text.includes("SELECT settings FROM course_versions")) return [{ settings: {} }];
      if (text.includes("INSERT INTO user_course_progress")) return [{ id: "prog-1" }];
      if (text.includes("SELECT c.id FROM cleaners")) return [{ id: "cleaner-1" }];
      return [];
    };
    const app = buildApp();
    const res = await app.request(`/courses/${COURSE_ID}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_version_id: VERSION_ID, progress_percent: 100, completed: true }),
    }, ENV);
    expect(res.status).toBe(200);
    const insert = sqlCalls.find((c) => c.text.includes("INSERT INTO user_course_progress"));
    expect(insert!.values).toContain("completed");
    expect(recomputeMock).toHaveBeenCalled();
  });
});
