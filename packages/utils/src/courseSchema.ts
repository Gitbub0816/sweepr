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
 * Shared vocabulary for Course Builder v2 (migration 011: courses /
 * course_versions / course_slides / slide_blocks) — the ONE place a block's
 * legal prop keys and value sets live.
 *
 * `slide_blocks.props` is a free-form JSONB column, so nothing in Postgres
 * stops a writer from storing props no renderer understands. Before this
 * file existed the block shape was documented only implicitly, by whatever
 * the two renderers happened to read:
 *
 *   - apps/admin/src/pages/CourseEditorPage.tsx  (authoring canvas)
 *   - apps/cleaner/src/pages/CourseViewerPage.tsx (learner player)
 *
 * …and the MCP course tools accepted `props: Record<string, unknown>`
 * wholesale. That let an LLM save, for example, `checklist.items` as
 * `[{text: "…"}]` instead of `["…"]`. The DB took it, and the learner player
 * then tried to render an object as a React child — React error #31, white
 * slide. Same class of bug for `{text: …}` instead of `{content: …}` on a
 * text block: accepted, stored, renders blank.
 *
 * So: both renderers, the admin editor's defaults, and apps/mcp's zod schema
 * now derive from the tables below. Adding a prop or a new value is a
 * one-line change here that every layer picks up, and the MCP's documented
 * schema cannot drift from what the renderers actually read.
 *
 * RENDER SAFETY: `courseText` / `courseChecklistItems` are the coercion
 * helpers both renderers use at every point where a prop becomes a React
 * child. They exist so malformed props ALREADY stored (from before
 * validation) degrade to empty/plain text instead of crashing a slide.
 */

// ─── Value sets ─────────────────────────────────────────────────────────────

export const COURSE_BLOCK_TYPES = [
  "heading",
  "text",
  "image",
  "video",
  "embed",
  "shape",
  "divider",
  "spacer",
  "callout",
  "quiz",
  "button",
  "checklist",
  "acknowledgment",
] as const;
export type CourseBlockType = (typeof COURSE_BLOCK_TYPES)[number];

/** Font stack offered by the editor's font picker. */
export const COURSE_FONTS = [
  "Inter",
  "Georgia",
  "Arial",
  "Times New Roman",
  "Courier New",
  "Verdana",
] as const;

export const COURSE_TEXT_ALIGNS = ["left", "center", "right"] as const;
export const COURSE_CALLOUT_VARIANTS = ["info", "warning", "success", "tip"] as const;
export const COURSE_SHAPE_KINDS = ["rect", "ellipse", "line"] as const;
export const COURSE_IMAGE_FITS = ["cover", "contain"] as const;
export const COURSE_BUTTON_ACTIONS = ["next", "prev", "url", "complete"] as const;
export const COURSE_ACK_METHODS = ["checkbox", "typed_name", "initials", "signature"] as const;

export const COURSE_SLIDE_TYPES = ["content", "title", "section", "assessment"] as const;
export const COURSE_COMPLETION_RULE_TYPES = [
  "viewed",
  "min_time",
  "video_completed",
  "quiz_passed",
  "checklist_completed",
  "acknowledgment_signed",
] as const;

/** Shared by the callout renderer in the editor and the player. */
export const COURSE_CALLOUT_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  info: { bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af" },
  warning: { bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
  success: { bg: "#ecfdf5", border: "#a7f3d0", text: "#065f46" },
  tip: { bg: "#f5f3ff", border: "#ddd6fe", text: "#5b21b6" },
};

// ─── Per-block prop specs ───────────────────────────────────────────────────

export type CoursePropType = "string" | "number" | "boolean" | "string[]" | "object[]" | "enum";

export interface CourseBlockPropSpec {
  key: string;
  type: CoursePropType;
  /** Allowed values when type is "enum". */
  values?: readonly string[];
  /** One-line explanation, used to generate the MCP's field guide. */
  note: string;
  /**
   * True when the prop is accepted and stored but NO renderer reads it yet —
   * documented so nobody promises a human behavior that doesn't exist.
   */
  inert?: boolean;
}

const TEXTUAL_PROPS: readonly CourseBlockPropSpec[] = [
  { key: "content", type: "string", note: "The text itself. This is the ONLY key either renderer reads for copy — not `text`, not `body`." },
  { key: "size", type: "number", note: "Font size in px." },
  { key: "weight", type: "number", note: "Font weight (the editor's bold toggle writes 400 or 700). Defaults to 700 for heading, 400 for text." },
  { key: "color", type: "string", note: "CSS color, e.g. \"#0f172a\"." },
  { key: "align", type: "enum", values: COURSE_TEXT_ALIGNS, note: "Horizontal alignment." },
  { key: "font", type: "enum", values: COURSE_FONTS, note: "Font family." },
  { key: "italic", type: "boolean", note: "Italic." },
  { key: "underline", type: "boolean", note: "Underline." },
  { key: "lineHeight", type: "number", note: "Unitless line height, e.g. 1.4." },
];

/**
 * The complete set of props each block type accepts. Anything outside this
 * list is rejected at write time rather than stored — a misspelled or
 * invented key is the single most common way to save a block that renders
 * blank.
 */
export const COURSE_BLOCK_PROPS: Record<CourseBlockType, readonly CourseBlockPropSpec[]> = {
  heading: TEXTUAL_PROPS,
  text: TEXTUAL_PROPS,
  image: [
    { key: "url", type: "string", note: "Image URL. Empty renders a placeholder box." },
    { key: "caption", type: "string", note: "Alt text (also used as the caption in the editor)." },
    { key: "fit", type: "enum", values: COURSE_IMAGE_FITS, note: "CSS object-fit." },
    { key: "radius", type: "number", note: "Corner radius in px." },
  ],
  video: [
    { key: "streamId", type: "string", note: "Cloudflare Stream video id. The MCP cannot upload video — a human uploads it in the admin editor and the id lands here." },
    { key: "requireWatchPercent", type: "number", inert: true, note: "Stored, but nothing enforces a watch percentage yet." },
    { key: "allowSkip", type: "boolean", inert: true, note: "Stored, but skipping is not gated yet." },
  ],
  embed: [
    { key: "url", type: "string", note: "URL rendered in an iframe for the learner." },
  ],
  shape: [
    { key: "shape", type: "enum", values: COURSE_SHAPE_KINDS, note: "Rectangle, ellipse, or a horizontal line." },
    { key: "fill", type: "string", note: "Fill color (also the line color when shape is \"line\")." },
    { key: "border", type: "number", note: "Border width in px (also the line thickness when shape is \"line\"). 0 for none." },
    { key: "borderColor", type: "string", note: "Border color." },
    { key: "radius", type: "number", note: "Corner radius in px, ignored for ellipse and line." },
    { key: "opacity", type: "number", note: "0 to 1." },
  ],
  divider: [
    { key: "color", type: "string", note: "Rule color." },
    { key: "thickness", type: "number", note: "Rule thickness in px." },
  ],
  spacer: [],
  callout: [
    { key: "variant", type: "enum", values: COURSE_CALLOUT_VARIANTS, note: "Colour scheme of the callout." },
    { key: "title", type: "string", note: "Bold first line." },
    { key: "body", type: "string", note: "Body copy. The key is `body` — a callout does NOT use `content`." },
  ],
  quiz: [
    { key: "passingScore", type: "number", note: "Pass mark as a percentage. Shown in the editor; not enforced yet." },
    { key: "questions", type: "object[]", inert: true, note: "Stored, but the learner player renders a quiz block as an inert \"N question(s)\" placeholder — it is not interactive or graded yet, and the admin editor has no question editor. Do not tell a human their quiz will grade cleaners." },
  ],
  button: [
    { key: "label", type: "string", note: "Button text." },
    { key: "color", type: "string", note: "Background color." },
    { key: "action", type: "enum", values: COURSE_BUTTON_ACTIONS, inert: true, note: "Stored, but a button is presentational today — neither renderer wires up the action." },
    { key: "url", type: "string", inert: true, note: "Target when action is \"url\". Not wired up yet." },
  ],
  checklist: [
    { key: "items", type: "string[]", note: "An array of PLAIN STRINGS, one per line item — e.g. [\"Ring the bell\", \"Photograph every room\"]. NOT objects: [{text: \"…\"}] is rejected (it used to be accepted, and crashed the learner's slide)." },
  ],
  acknowledgment: [
    { key: "statement", type: "string", note: "The sentence the learner acknowledges." },
    { key: "method", type: "enum", values: COURSE_ACK_METHODS, inert: true, note: "Stored, but the player always renders a checkbox today." },
  ],
};

/**
 * Geometry + props the editor gives a freshly-dropped block. The admin editor
 * imports this so its palette and this schema can never disagree; the MCP
 * quotes it as the worked example for each block type.
 */
export const COURSE_BLOCK_DEFAULTS: Record<
  CourseBlockType,
  { width: number; height: number; props: Record<string, unknown> }
> = {
  heading: { width: 80, height: 14, props: { content: "Slide title", size: 40, weight: 700, color: "#0f172a", align: "left", font: "Inter", italic: false, underline: false } },
  text: { width: 70, height: 16, props: { content: "Add your text here", size: 20, weight: 400, color: "#334155", align: "left", font: "Inter", italic: false, underline: false, lineHeight: 1.4 } },
  image: { width: 50, height: 50, props: { url: "", caption: "", fit: "cover", radius: 12 } },
  video: { width: 60, height: 55, props: { streamId: "", requireWatchPercent: 95, allowSkip: false } },
  embed: { width: 60, height: 55, props: { url: "" } },
  shape: { width: 26, height: 26, props: { shape: "rect", fill: "#2DD4BF", border: 0, borderColor: "#0f766e", radius: 12, opacity: 1 } },
  divider: { width: 60, height: 2, props: { color: "#cbd5e1", thickness: 2 } },
  spacer: { width: 40, height: 8, props: {} },
  callout: { width: 64, height: 22, props: { variant: "info", title: "Note", body: "Important information for the learner." } },
  quiz: { width: 70, height: 44, props: { passingScore: 80, questions: [] } },
  button: { width: 28, height: 10, props: { label: "Next", action: "next", color: "#14b8a6" } },
  checklist: { width: 60, height: 30, props: { items: ["First step", "Second step"] } },
  acknowledgment: { width: 70, height: 14, props: { statement: "I acknowledge this policy.", method: "checkbox" } },
};

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate one block's props against its type. Returns human-readable
 * problems (empty array = valid). Used by apps/mcp to REJECT a malformed
 * block at write time, and to report on blocks already stored.
 *
 * Every prop is optional — a block with `{}` renders its defaults — but an
 * unknown key or a wrong value type is an error, because both mean the block
 * will not render the way its author intended.
 */
export function validateCourseBlockProps(
  blockType: string,
  props: unknown,
): string[] {
  if (!COURSE_BLOCK_TYPES.includes(blockType as CourseBlockType)) {
    return [`unknown block_type "${blockType}" (expected one of: ${COURSE_BLOCK_TYPES.join(", ")})`];
  }
  if (props === null || typeof props !== "object" || Array.isArray(props)) {
    return ["props must be an object"];
  }

  const specs = COURSE_BLOCK_PROPS[blockType as CourseBlockType];
  const byKey = new Map(specs.map((s) => [s.key, s]));
  const errors: string[] = [];

  for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
    const spec = byKey.get(key);
    if (!spec) {
      const allowed = specs.map((s) => s.key);
      errors.push(
        allowed.length
          ? `"${key}" is not a prop of a ${blockType} block (allowed: ${allowed.join(", ")})`
          : `a ${blockType} block takes no props, but "${key}" was given`,
      );
      continue;
    }
    // An explicit null/undefined just means "use the default".
    if (value === null || value === undefined) continue;

    switch (spec.type) {
      case "string":
        if (typeof value !== "string") errors.push(`${blockType}.${key} must be a string`);
        break;
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) {
          errors.push(`${blockType}.${key} must be a number`);
        }
        break;
      case "boolean":
        if (typeof value !== "boolean") errors.push(`${blockType}.${key} must be a boolean`);
        break;
      case "enum":
        if (typeof value !== "string" || !spec.values?.includes(value)) {
          errors.push(`${blockType}.${key} must be one of: ${(spec.values ?? []).join(", ")}`);
        }
        break;
      case "string[]":
        if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
          errors.push(
            `${blockType}.${key} must be an array of plain strings` +
              (Array.isArray(value) && value.some((v) => v !== null && typeof v === "object")
                ? ` — objects like {text: "…"} are not accepted; pass ["…"] instead`
                : ""),
          );
        }
        break;
      case "object[]":
        if (!Array.isArray(value) || value.some((v) => v === null || typeof v !== "object" || Array.isArray(v))) {
          errors.push(`${blockType}.${key} must be an array of objects`);
        }
        break;
    }
  }

  return errors;
}

// ─── Render coercion ────────────────────────────────────────────────────────

/**
 * Coerce a prop into something safe to render as a React child. Blocks saved
 * before validation existed can hold an object where a string belongs;
 * rendering that raw throws React error #31 and takes down the whole slide.
 * Strings and numbers pass through, `{text}`/`{label}`/`{content}` wrappers
 * are unwrapped (the shapes an LLM most often invents), everything else
 * becomes "".
 */
export function courseText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    for (const key of ["text", "label", "content", "title"]) {
      if (typeof o[key] === "string") return o[key] as string;
    }
  }
  return "";
}

/** Checklist items, coerced to plain strings (see `courseText`). */
export function courseChecklistItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(courseText).filter((s) => s.length > 0);
}

// ─── Documentation ──────────────────────────────────────────────────────────

/**
 * Render the per-block prop tables as markdown, straight from the specs
 * above. The MCP's courses field-guide resource is generated with this so the
 * documentation an LLM reads is literally the schema it is validated against.
 */
export function describeCourseBlockProps(): string {
  const lines: string[] = [];
  for (const type of COURSE_BLOCK_TYPES) {
    const specs = COURSE_BLOCK_PROPS[type];
    const defaults = COURSE_BLOCK_DEFAULTS[type];
    if (specs.length === 0) {
      lines.push(`- **${type}** — takes no props.`);
      continue;
    }
    lines.push(`- **${type}**`);
    for (const s of specs) {
      const t = s.type === "enum" ? (s.values ?? []).map((v) => `"${v}"`).join(" | ") : s.type;
      lines.push(`  - \`${s.key}\` (${t})${s.inert ? " — NOT RENDERED YET" : ""}: ${s.note}`);
    }
    lines.push(`  - default: \`${JSON.stringify(defaults.props)}\` at ${defaults.width}x${defaults.height}`);
  }
  return lines.join("\n");
}
