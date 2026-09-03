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
 * Course interactions — the server-authoritative half of the interactive
 * block layer (see courseSchema.ts for the block shapes).
 *
 * Three jobs, all driven by the same specs the validators use:
 *
 *  1. `localizeCourseBlockProps` — merge a block's props.i18n[locale]
 *     overlay into its base props (element-wise for structured props), so
 *     the learner receives single-locale content with the layout untouched.
 *
 *  2. `sanitizeCourseBlockPropsForLearner` — strip everything that encodes
 *     an answer (correct flags, categories, correctOrder, hotspot regions,
 *     feedback strings) before a block is served to a learner. Where the
 *     learner UI still needs structure, it is replaced with a derived,
 *     answer-free shape (hotspots → targetCount; matching pairs → two
 *     columns with the right side deterministically shuffled).
 *
 *  3. `gradeCourseInteraction` — grade a learner's submitted response
 *     against the FULL stored props, server-side. The learner never grades
 *     locally: the player POSTs the response and renders the verdict +
 *     feedback the server returns. This mirrors the repo-wide "server is
 *     authoritative" rule.
 *
 * The sanitizer and grader must agree on served shapes (ids, ordering), so
 * both derive them from the same seeded shuffle keyed on the block id —
 * deterministic across requests, but unrelated to the correct answer.
 */

import type { CourseBlockType } from "./courseSchema";

// ─── Gradeable set ──────────────────────────────────────────────────────────

export const COURSE_GRADABLE_BLOCK_TYPES = [
  "quiz",
  "true_false",
  "image_choice",
  "sort",
  "order",
  "matching",
  "hotspot",
  "scenario",
  "acknowledgment",
] as const;
export type CourseGradableBlockType = (typeof COURSE_GRADABLE_BLOCK_TYPES)[number];

export function isCourseGradableBlockType(t: string): t is CourseGradableBlockType {
  return (COURSE_GRADABLE_BLOCK_TYPES as readonly string[]).includes(t);
}

// ─── Assessment settings (course_versions.settings) ────────────────────────

export interface CourseAssessmentSettings {
  /** Course counts as passed only at/above this percent of gradeable blocks correct. */
  passingScorePct?: number | null;
  /** null/undefined = unlimited attempts. */
  maxAttempts?: number | null;
  /** Player shuffles assessment-type slides. */
  shuffleQuestions?: boolean;
  /** Player shuffles answer options client-side per attempt. */
  shuffleAnswers?: boolean;
  /** Show the numeric score on the results screen. Default true. */
  showScore?: boolean;
  /** Show explanations with graded feedback. Default true. */
  showExplanations?: boolean;
}

/** Validate a course_versions.settings object; returns problems. */
export function validateCourseAssessmentSettings(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object" || Array.isArray(value)) return ["assessment settings must be an object"];
  const errors: string[] = [];
  const s = value as Record<string, unknown>;
  const allowed = new Set([
    "passingScorePct",
    "maxAttempts",
    "shuffleQuestions",
    "shuffleAnswers",
    "showScore",
    "showExplanations",
  ]);
  for (const key of Object.keys(s)) {
    if (!allowed.has(key)) errors.push(`"${key}" is not an assessment setting (allowed: ${[...allowed].join(", ")})`);
  }
  if (s.passingScorePct !== undefined && s.passingScorePct !== null) {
    if (typeof s.passingScorePct !== "number" || s.passingScorePct < 1 || s.passingScorePct > 100) {
      errors.push("passingScorePct must be a number between 1 and 100 (or null for no pass mark)");
    }
  }
  if (s.maxAttempts !== undefined && s.maxAttempts !== null) {
    if (typeof s.maxAttempts !== "number" || !Number.isInteger(s.maxAttempts) || s.maxAttempts < 1) {
      errors.push("maxAttempts must be a positive integer (or null for unlimited)");
    }
  }
  for (const key of ["shuffleQuestions", "shuffleAnswers", "showScore", "showExplanations"] as const) {
    if (s[key] !== undefined && typeof s[key] !== "boolean") errors.push(`${key} must be a boolean`);
  }
  return errors;
}

// ─── Deterministic shuffle (serving order must not leak answers) ───────────

function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The permutation used to serve an n-item list for `seedKey` (a block id):
 * result[k] = original index shown at position k. Deterministic, so the
 * grader can invert exactly what the sanitizer served.
 */
export function coursePermutation(n: number, seedKey: string): number[] {
  const indexes = Array.from({ length: n }, (_, i) => i);
  const rand = mulberry32(hashString(seedKey));
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  return indexes;
}

// ─── Localization ───────────────────────────────────────────────────────────

function mergeOverlayValue(base: unknown, overlay: unknown): unknown {
  if (overlay === null || overlay === undefined) return base;
  // Structured props merge element-wise; each overlay item patches only the
  // (text) fields it carries. Length mismatches were rejected at write time;
  // if one slipped through, prefer the base to keep grading keys intact.
  if (Array.isArray(base) && Array.isArray(overlay)) {
    if (base.length !== overlay.length) return base;
    return base.map((baseItem, i) => {
      const overlayItem = overlay[i];
      if (
        baseItem !== null && typeof baseItem === "object" && !Array.isArray(baseItem) &&
        overlayItem !== null && typeof overlayItem === "object" && !Array.isArray(overlayItem)
      ) {
        const merged: Record<string, unknown> = { ...(baseItem as Record<string, unknown>) };
        for (const [k, v] of Object.entries(overlayItem as Record<string, unknown>)) {
          merged[k] = mergeOverlayValue(merged[k], v);
        }
        return merged;
      }
      return overlayItem ?? baseItem;
    });
  }
  return overlay;
}

/**
 * Resolve a block's props for one locale: apply props.i18n[locale] over the
 * base content and drop the i18n bundle itself. The default locale (or a
 * locale with no overlay) returns the base props minus i18n.
 */
export function localizeCourseBlockProps(
  props: Record<string, unknown>,
  locale: string | null | undefined,
): Record<string, unknown> {
  const { i18n, ...base } = props;
  if (!locale || i18n === null || typeof i18n !== "object" || Array.isArray(i18n)) return base;
  const overlay = (i18n as Record<string, unknown>)[locale];
  if (overlay === null || typeof overlay !== "object" || Array.isArray(overlay)) return base;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay as Record<string, unknown>)) {
    merged[key] = mergeOverlayValue(merged[key], value);
  }
  return merged;
}

/** Generic {locale: {field: text}} overlay resolver for course/slide rows. */
export function localizeCourseFields<T extends Record<string, unknown>>(
  row: T,
  i18n: unknown,
  locale: string | null | undefined,
  fields: readonly string[],
): T {
  if (!locale || i18n === null || typeof i18n !== "object" || Array.isArray(i18n)) return row;
  const overlay = (i18n as Record<string, unknown>)[locale];
  if (overlay === null || typeof overlay !== "object" || Array.isArray(overlay)) return row;
  const out: Record<string, unknown> = { ...row };
  for (const f of fields) {
    const v = (overlay as Record<string, unknown>)[f];
    if (typeof v === "string" && v.length > 0) out[f] = v;
  }
  return out as T;
}

// ─── Learner sanitization ───────────────────────────────────────────────────

type Rec = Record<string, unknown>;
const asArray = (v: unknown): Rec[] => (Array.isArray(v) ? (v.filter((x) => x !== null && typeof x === "object") as Rec[]) : []);

const FEEDBACK_KEYS = ["correctFeedback", "incorrectFeedback", "explanation"] as const;

/**
 * The props a LEARNER may see for a block: localized first (call
 * localizeCourseBlockProps before this), then all answer-encoding and
 * feedback fields stripped or replaced with derived answer-free shapes.
 * `blockId` seeds the deterministic serving order where order must not leak
 * the answer. Non-gradeable types pass through minus i18n.
 */
export function sanitizeCourseBlockPropsForLearner(
  blockType: string,
  props: Record<string, unknown>,
  blockId: string,
): Record<string, unknown> {
  const p: Record<string, unknown> = { ...props };
  delete p.i18n;
  for (const k of FEEDBACK_KEYS) delete p[k];

  switch (blockType as CourseBlockType) {
    case "quiz": {
      const questions = asArray(p.questions).map((q) => ({
        question: q.question,
        multi: q.multi === true,
        options: asArray(q.options).map((o) => ({ text: o.text })),
      }));
      return { ...p, questions };
    }
    case "true_false": {
      delete p.correct;
      return p;
    }
    case "image_choice": {
      const options = asArray(p.options).map((o) => ({ url: o.url, label: o.label }));
      return { ...p, options };
    }
    case "sort": {
      const items = asArray(p.items);
      const perm = coursePermutation(items.length, `${blockId}:sort`);
      return { ...p, items: perm.map((idx) => ({ id: items[idx].id, label: items[idx].label })) };
    }
    case "order": {
      const items = asArray(p.items);
      const perm = coursePermutation(items.length, `${blockId}:order`);
      return { ...p, items: perm.map((idx) => ({ id: items[idx].id, label: items[idx].label })) };
    }
    case "matching": {
      const pairs = asArray(p.pairs);
      const perm = coursePermutation(pairs.length, `${blockId}:matching`);
      const out: Record<string, unknown> = { ...p };
      delete out.pairs;
      out.left = pairs.map((pair, i) => ({ id: `l${i}`, label: pair.left }));
      // right[k] shows the match of pair perm[k]; its id encodes the shuffled
      // POSITION, not the pair, so pairing l0↔r0 reveals nothing.
      out.right = perm.map((idx, k) => ({ id: `r${k}`, label: pairs[idx].right }));
      return out;
    }
    case "hotspot": {
      const hotspots = asArray(p.hotspots);
      const out: Record<string, unknown> = { ...p };
      delete out.hotspots;
      out.targetCount = hotspots.filter((h) => h.correct === true).length;
      return out;
    }
    case "scenario": {
      const choices = asArray(p.choices).map((c) => ({ text: c.text }));
      return { ...p, choices };
    }
    default:
      return p;
  }
}

// ─── Grading ────────────────────────────────────────────────────────────────

export interface CourseGradeResult {
  correct: boolean;
  /** 0–100; partial credit where the type supports it (quiz questions, sort items…). */
  scorePct: number;
  /** Type-specific verdict detail, safe to show AFTER grading (per-question booleans, found counts…). */
  detail?: Record<string, unknown>;
}

const isRec = (v: unknown): v is Rec => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Grade a learner response against the FULL stored props (server-side only —
 * the client never has the answers). Returns null for a response whose shape
 * doesn't match the block type, which callers should treat as a 400.
 */
export function gradeCourseInteraction(
  blockType: string,
  props: Record<string, unknown>,
  response: unknown,
): CourseGradeResult | null {
  if (!isRec(response)) return null;

  switch (blockType as CourseBlockType) {
    case "acknowledgment": {
      if (response.acknowledged !== true) return null;
      return { correct: true, scorePct: 100 };
    }

    case "true_false": {
      if (typeof response.answer !== "boolean" || typeof props.correct !== "boolean") return null;
      const correct = response.answer === props.correct;
      return { correct, scorePct: correct ? 100 : 0 };
    }

    case "image_choice": {
      const options = asArray(props.options);
      const sel = response.selected;
      if (typeof sel !== "number" || !Number.isInteger(sel) || sel < 0 || sel >= options.length) return null;
      const correct = options[sel]?.correct === true;
      return { correct, scorePct: correct ? 100 : 0 };
    }

    case "scenario": {
      const choices = asArray(props.choices);
      const sel = response.choice;
      if (typeof sel !== "number" || !Number.isInteger(sel) || sel < 0 || sel >= choices.length) return null;
      const chosen = choices[sel];
      const correct = chosen?.correct === true;
      return {
        correct,
        scorePct: correct ? 100 : 0,
        detail: typeof chosen?.feedback === "string" && chosen.feedback ? { choiceFeedback: chosen.feedback } : undefined,
      };
    }

    case "quiz": {
      const questions = asArray(props.questions);
      const answers = response.answers;
      if (!Array.isArray(answers) || answers.length !== questions.length || questions.length === 0) return null;
      const perQuestion: boolean[] = questions.map((q, qi) => {
        const options = asArray(q.options);
        const picked = answers[qi];
        if (!Array.isArray(picked) || picked.some((v) => typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= options.length)) {
          return false;
        }
        const pickedSet = [...new Set(picked as number[])].sort((a, b) => a - b);
        const correctSet = options
          .map((o, i) => (o.correct === true ? i : -1))
          .filter((i) => i >= 0);
        return pickedSet.length === correctSet.length && pickedSet.every((v, i) => v === correctSet[i]);
      });
      const right = perQuestion.filter(Boolean).length;
      const scorePct = Math.round((right / questions.length) * 100);
      const passing = typeof props.passingScore === "number" ? props.passingScore : 80;
      return { correct: scorePct >= passing, scorePct, detail: { perQuestion, rightCount: right, questionCount: questions.length } };
    }

    case "sort": {
      const items = asArray(props.items);
      const placements = response.placements;
      if (!Array.isArray(placements)) return null;
      const placedBy = new Map<string, string>();
      for (const pl of placements) {
        if (!isRec(pl) || typeof pl.id !== "string" || typeof pl.category !== "string") return null;
        placedBy.set(pl.id, pl.category);
      }
      const perItem: Record<string, boolean> = {};
      let right = 0;
      for (const it of items) {
        const id = typeof it.id === "string" ? it.id : "";
        const ok = placedBy.get(id) === it.category;
        perItem[id] = ok;
        if (ok) right++;
      }
      const all = items.length > 0 && right === items.length && placedBy.size === items.length;
      return { correct: all, scorePct: items.length ? Math.round((right / items.length) * 100) : 0, detail: { perItem } };
    }

    case "order": {
      const items = asArray(props.items);
      const submitted = response.order;
      if (!Array.isArray(submitted) || submitted.some((v) => typeof v !== "string")) return null;
      const correctSeq = [...items]
        .sort((a, b) => (Number(a.correctOrder) || 0) - (Number(b.correctOrder) || 0))
        .map((it) => it.id);
      const correct =
        submitted.length === correctSeq.length && correctSeq.every((id, i) => submitted[i] === id);
      let inPlace = 0;
      correctSeq.forEach((id, i) => {
        if (submitted[i] === id) inPlace++;
      });
      return {
        correct,
        scorePct: correctSeq.length ? Math.round((inPlace / correctSeq.length) * 100) : 0,
        detail: { inPlace, total: correctSeq.length },
      };
    }

    case "matching":
      // Needs the block id to invert the serving shuffle — grade through
      // gradeCourseMatching / gradeCourseBlock instead.
      return null;

    case "hotspot": {
      const hotspots = asArray(props.hotspots);
      const taps = response.taps;
      if (!Array.isArray(taps)) return null;
      const points: Array<{ x: number; y: number }> = [];
      for (const t of taps) {
        if (!isRec(t) || typeof t.x !== "number" || typeof t.y !== "number") return null;
        points.push({ x: t.x, y: t.y });
      }
      const correctRegions = hotspots.filter((h) => h.correct === true);
      const inRegion = (pt: { x: number; y: number }, h: Rec) => {
        const x = Number(h.x), y = Number(h.y), w = Number(h.width), hh = Number(h.height);
        return pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + hh;
      };
      const foundIdx = new Set<number>();
      let stray = 0;
      for (const pt of points) {
        let hit = false;
        correctRegions.forEach((h, i) => {
          if (inRegion(pt, h)) {
            foundIdx.add(i);
            hit = true;
          }
        });
        if (!hit) stray++;
      }
      const found = foundIdx.size;
      const total = correctRegions.length;
      const correct = total > 0 && found === total && stray === 0;
      const labels = [...foundIdx]
        .map((i) => correctRegions[i]?.label)
        .filter((l): l is string => typeof l === "string" && l.length > 0);
      return {
        correct,
        scorePct: total ? Math.round((found / total) * 100) : 0,
        detail: { found, total, stray, foundLabels: labels },
      };
    }

    default:
      return null;
  }
}

/**
 * Matching needs the block id to invert the serving shuffle, so it grades
 * through this dedicated entry (the generic one returns null for it).
 * Response shape: { matches: [{ left: "l0", right: "r2" }, …] } using the
 * ids `sanitizeCourseBlockPropsForLearner` served.
 */
export function gradeCourseMatching(
  props: Record<string, unknown>,
  response: unknown,
  blockId: string,
): CourseGradeResult | null {
  if (!isRec(response)) return null;
  const pairs = asArray(props.pairs);
  const matches = response.matches;
  if (!Array.isArray(matches)) return null;
  const perm = coursePermutation(pairs.length, `${blockId}:matching`);
  // right position k came from pair perm[k]; left i is pair i.
  const chosen = new Map<number, number>();
  for (const m of matches) {
    if (!isRec(m) || typeof m.left !== "string" || typeof m.right !== "string") return null;
    const li = Number(m.left.replace(/^l/, ""));
    const rk = Number(m.right.replace(/^r/, ""));
    if (!Number.isInteger(li) || li < 0 || li >= pairs.length) return null;
    if (!Number.isInteger(rk) || rk < 0 || rk >= pairs.length) return null;
    chosen.set(li, perm[rk]);
  }
  let right = 0;
  const perPair: Record<string, boolean> = {};
  for (let i = 0; i < pairs.length; i++) {
    const ok = chosen.get(i) === i;
    perPair[`l${i}`] = ok;
    if (ok) right++;
  }
  const correct = pairs.length > 0 && right === pairs.length && chosen.size === pairs.length;
  return { correct, scorePct: pairs.length ? Math.round((right / pairs.length) * 100) : 0, detail: { perPair } };
}

/**
 * One entry point for the API: routes matching to its id-aware grader and
 * everything else to the generic one.
 */
export function gradeCourseBlock(
  blockType: string,
  props: Record<string, unknown>,
  response: unknown,
  blockId: string,
): CourseGradeResult | null {
  if (blockType === "matching") return gradeCourseMatching(props, response, blockId);
  return gradeCourseInteraction(blockType, props, response);
}

/** The feedback strings a grade response should carry, from the FULL props. */
export function courseFeedbackFor(
  props: Record<string, unknown>,
  correct: boolean,
): { feedback: string | null; explanation: string | null } {
  const pick = (k: string) => (typeof props[k] === "string" && (props[k] as string).length > 0 ? (props[k] as string) : null);
  return {
    feedback: correct ? pick("correctFeedback") : pick("incorrectFeedback"),
    explanation: pick("explanation"),
  };
}

// ─── Translation lint (preview_course) ─────────────────────────────────────

function collectLocalizableGaps(
  path: string,
  base: unknown,
  overlay: unknown,
  spec: { key: string; type: string; localizable?: boolean; fields?: readonly { key: string; type: string; localizable?: boolean; fields?: readonly unknown[] }[] },
): string[] {
  const gaps: string[] = [];
  if (spec.localizable && (spec.type === "string" || spec.type === "string[]")) {
    const baseHasText =
      (typeof base === "string" && base.trim().length > 0) ||
      (Array.isArray(base) && base.some((v) => typeof v === "string" && v.trim().length > 0));
    const overlayHasText =
      (typeof overlay === "string" && overlay.trim().length > 0) ||
      (Array.isArray(overlay) && overlay.some((v) => typeof v === "string" && v.trim().length > 0));
    if (baseHasText && !overlayHasText) gaps.push(path);
    return gaps;
  }
  if (spec.type === "object[]" && Array.isArray(base)) {
    const overlayArr = Array.isArray(overlay) ? overlay : [];
    base.forEach((item, i) => {
      if (item === null || typeof item !== "object") return;
      for (const f of (spec.fields ?? []) as Array<{ key: string; type: string; localizable?: boolean; fields?: readonly unknown[] }>) {
        gaps.push(
          ...collectLocalizableGaps(
            `${path}[${i}].${f.key}`,
            (item as Rec)[f.key],
            isRec(overlayArr[i]) ? (overlayArr[i] as Rec)[f.key] : undefined,
            f as never,
          ),
        );
      }
    });
  }
  return gaps;
}

/**
 * Which of a block's text-bearing props still lack a translation for
 * `locale` — the preview_course lint for enabled locales.
 */
export function courseTranslationGaps(
  blockType: CourseBlockType,
  props: Record<string, unknown>,
  locale: string,
  specs: readonly { key: string; type: string; localizable?: boolean; fields?: readonly unknown[] }[],
): string[] {
  const i18n = isRec(props.i18n) ? (props.i18n as Rec) : {};
  const overlay = isRec(i18n[locale]) ? (i18n[locale] as Rec) : {};
  const gaps: string[] = [];
  for (const spec of specs) {
    gaps.push(...collectLocalizableGaps(`${blockType}.${spec.key}`, props[spec.key], overlay[spec.key], spec as never));
  }
  return gaps;
}
