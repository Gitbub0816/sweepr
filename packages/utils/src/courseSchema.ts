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
 * course_versions / course_slides / slide_blocks, extended by 111 with the
 * interactive layer) — the ONE place a block's legal prop keys and value
 * sets live.
 *
 * `slide_blocks.props` is a free-form JSONB column, so nothing in Postgres
 * stops a writer from storing props no renderer understands. Both renderers
 * (apps/admin CourseEditorPage, apps/cleaner CourseViewerPage), the admin
 * editor's defaults, the API's draft validation, and apps/mcp's zod schema
 * all derive from the tables below. Adding a prop or a new value is a
 * one-line change here that every layer picks up, and the MCP's documented
 * schema cannot drift from what the renderers actually read.
 *
 * INTERACTIVE BLOCKS + GRADING: the gradeable block types (quiz, true_false,
 * image_choice, sort, order, matching, hotspot, scenario, acknowledgment)
 * are AUTHORED with their correct answers inside props. The learner is never
 * served those answers — apps/api strips them with
 * `sanitizeCourseBlockPropsForLearner` (courseInteractions.ts) and grades
 * submissions server-side with `gradeCourseInteraction`. Anything you add
 * here that encodes an answer must be added to the sanitizer's strip list.
 *
 * LOCALIZATION: one course, multiple locales. A block carries its
 * translations in `props.i18n = { es: { <propKey>: overlay } }` — only props
 * marked `localizable` below may appear in an overlay, and structured props
 * are overlaid element-wise (same array length, text fields only) so layout
 * and grading keys stay single-source. See validateCourseBlockProps.
 *
 * RENDER SAFETY: `courseText` / `courseChecklistItems` are the coercion
 * helpers both renderers use at every point where a prop becomes a React
 * child, so malformed props ALREADY stored degrade to empty/plain text
 * instead of crashing a slide.
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
  // interactive v2 (migration 111)
  "true_false",
  "image_choice",
  "sort",
  "order",
  "matching",
  "hotspot",
  "scenario",
  "before_after",
  "timeline",
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
export const COURSE_IMAGE_POSITIONS = ["center", "top", "bottom", "left", "right"] as const;
export const COURSE_BUTTON_ACTIONS = ["next", "prev", "url", "complete"] as const;
export const COURSE_ACK_METHODS = ["checkbox", "typed_name", "initials", "signature"] as const;
export const COURSE_BEFORE_AFTER_MODES = ["slider", "side_by_side"] as const;
export const COURSE_TIMELINE_ORIENTATIONS = ["horizontal", "vertical"] as const;
export const COURSE_ANNOTATION_KINDS = ["marker", "box", "arrow"] as const;

export const COURSE_SLIDE_TYPES = ["content", "title", "section", "assessment"] as const;
export const COURSE_COMPLETION_RULE_TYPES = [
  "viewed",
  "min_time",
  "video_completed",
  "quiz_passed",
  "checklist_completed",
  "acknowledgment_signed",
] as const;

/**
 * Locales a course may declare in supported_locales / props.i18n. Matches the
 * cleaner app's i18next locale set; en + es are the product's first-class
 * pair (Caleb's spec), the rest are legal so a future course can add them
 * without a schema change.
 */
export const COURSE_LOCALES = [
  "en",
  "es",
  "ar",
  "fil",
  "hi",
  "ko",
  "pt",
  "vi",
  "zh-Hans",
  "zh-Hant",
] as const;
export type CourseLocale = (typeof COURSE_LOCALES)[number];

/**
 * The native icon vocabulary blocks may reference (style.icon, timeline step
 * icons). Each app maps these names onto its icon set (lucide) — the MCP
 * design guide quotes this list verbatim.
 */
export const COURSE_ICONS = [
  "calendar",
  "clock",
  "location",
  "money",
  "shield",
  "camera",
  "warning",
  "checklist",
  "home",
  "customer",
  "cleaner",
  "support",
  "insurance",
  "document",
  "sparkle",
  "star",
  "info",
  "check",
  "phone",
  "lock",
] as const;
export type CourseIcon = (typeof COURSE_ICONS)[number];

// Style tokens — constrained enums instead of arbitrary CSS (Caleb item 11).
export const COURSE_STYLE_VARIANTS = ["none", "neutral", "brand", "info", "success", "warning"] as const;
export const COURSE_STYLE_RADII = ["none", "sm", "md", "lg", "xl"] as const;
export const COURSE_STYLE_PADDINGS = ["none", "sm", "md", "lg"] as const;
export const COURSE_STYLE_FONT_SIZES = ["sm", "md", "lg", "xl"] as const;
export const COURSE_STYLE_FONT_WEIGHTS = ["normal", "medium", "semibold", "bold"] as const;
export const COURSE_STYLE_SHADOWS = ["none", "sm", "md"] as const;

/** Shared by the callout renderer in the editor and the player. */
export const COURSE_CALLOUT_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  info: { bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af" },
  warning: { bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
  success: { bg: "#ecfdf5", border: "#a7f3d0", text: "#065f46" },
  tip: { bg: "#f5f3ff", border: "#ddd6fe", text: "#5b21b6" },
};

// ─── Per-block prop specs ───────────────────────────────────────────────────

export type CoursePropType =
  | "string"
  | "number"
  | "boolean"
  | "string[]"
  | "object[]"
  | "object"
  | "enum";

/**
 * One field, at any nesting depth: a top-level block prop, a field of an
 * `object` prop, or a field of an `object[]` item (recursively — quiz
 * questions contain an options object[]).
 */
export interface CourseFieldSpec {
  key: string;
  type: CoursePropType;
  /** Allowed values when type is "enum". */
  values?: readonly string[];
  /** Fields of an "object" value or of each "object[]" item. */
  fields?: readonly CourseFieldSpec[];
  /** Item fields only: the field must be present on every item. */
  required?: boolean;
  /**
   * Text shown to a learner — the ONLY fields a props.i18n locale overlay
   * may translate. Layout, ids, and answer keys are never localizable.
   */
  localizable?: boolean;
  /** One-line explanation, used to generate the MCP's field guide. */
  note: string;
  /**
   * True when the prop is accepted and stored but NO renderer reads it yet —
   * documented so nobody promises a human behavior that doesn't exist.
   */
  inert?: boolean;
}

export type CourseBlockPropSpec = CourseFieldSpec;

/**
 * The constrained style-token object accepted by most blocks (key: `style`).
 * Tokens, not CSS — each renderer maps them via `courseStyleCss`.
 */
export const COURSE_STYLE_FIELDS: readonly CourseFieldSpec[] = [
  { key: "variant", type: "enum", values: COURSE_STYLE_VARIANTS, note: "Preset color scheme for the block's container. \"none\" (default) renders no container." },
  { key: "fill", type: "string", note: "CSS background color override (hex). Prefer `variant`." },
  { key: "textColor", type: "string", note: "CSS text color override (hex)." },
  { key: "borderColor", type: "string", note: "CSS border color override (hex)." },
  { key: "borderWidth", type: "number", note: "Border width in px (0–6)." },
  { key: "radius", type: "enum", values: COURSE_STYLE_RADII, note: "Corner radius token." },
  { key: "padding", type: "enum", values: COURSE_STYLE_PADDINGS, note: "Inner padding token." },
  { key: "align", type: "enum", values: COURSE_TEXT_ALIGNS, note: "Text alignment inside the container." },
  { key: "fontSize", type: "enum", values: COURSE_STYLE_FONT_SIZES, note: "Text size token." },
  { key: "fontWeight", type: "enum", values: COURSE_STYLE_FONT_WEIGHTS, note: "Text weight token." },
  { key: "shadow", type: "enum", values: COURSE_STYLE_SHADOWS, note: "Subtle drop shadow token." },
  { key: "icon", type: "enum", values: COURSE_ICONS, note: "Icon shown in the container's header/corner (see the icon list in the design guide)." },
];

const STYLE_PROP: CourseFieldSpec = {
  key: "style",
  type: "object",
  fields: COURSE_STYLE_FIELDS,
  note: "Constrained style tokens (variant/radius/padding/fontSize/…), NOT arbitrary CSS — e.g. {\"variant\":\"info\",\"radius\":\"lg\",\"padding\":\"md\",\"icon\":\"checklist\"}.",
};

/**
 * Feedback + gating fields shared by every gradeable block. Grading happens
 * server-side; these strings come back to the learner in the grade response
 * (they are stripped from the learner's course payload so answers don't leak).
 */
const FEEDBACK_PROPS: readonly CourseFieldSpec[] = [
  { key: "correctFeedback", type: "string", localizable: true, note: "Shown when the learner answers correctly." },
  { key: "incorrectFeedback", type: "string", localizable: true, note: "Shown on a wrong answer." },
  { key: "explanation", type: "string", localizable: true, note: "Teaching note shown with the result (after a correct answer, or once retries are exhausted)." },
  { key: "allowRetry", type: "boolean", note: "Learner may re-answer until correct. Default true." },
  { key: "mustPass", type: "boolean", note: "The slide's Next button stays locked until this block is answered correctly. Default false." },
];

const TEXTUAL_PROPS: readonly CourseFieldSpec[] = [
  { key: "content", type: "string", localizable: true, note: "The text itself. This is the ONLY key either renderer reads for copy — not `text`, not `body`." },
  { key: "size", type: "number", note: "Font size in px." },
  { key: "weight", type: "number", note: "Font weight (the editor's bold toggle writes 400 or 700). Defaults to 700 for heading, 400 for text." },
  { key: "color", type: "string", note: "CSS color, e.g. \"#0f172a\"." },
  { key: "align", type: "enum", values: COURSE_TEXT_ALIGNS, note: "Horizontal alignment." },
  { key: "font", type: "enum", values: COURSE_FONTS, note: "Font family." },
  { key: "italic", type: "boolean", note: "Italic." },
  { key: "underline", type: "boolean", note: "Underline." },
  { key: "lineHeight", type: "number", note: "Unitless line height, e.g. 1.4." },
  STYLE_PROP,
];

/**
 * The complete set of props each block type accepts. Anything outside this
 * list is rejected at write time rather than stored — a misspelled or
 * invented key is the single most common way to save a block that renders
 * blank. (`i18n` is additionally accepted on every type — see the
 * localization section of validateCourseBlockProps.)
 */
export const COURSE_BLOCK_PROPS: Record<CourseBlockType, readonly CourseFieldSpec[]> = {
  heading: TEXTUAL_PROPS,
  text: TEXTUAL_PROPS,
  image: [
    { key: "url", type: "string", note: "Image URL — the assetUrl returned by the MCP's upload_course_asset tool, or the editor's upload button. Empty renders a placeholder box." },
    { key: "alt", type: "string", localizable: true, note: "Accessibility alt text (falls back to caption)." },
    { key: "caption", type: "string", localizable: true, note: "Caption rendered under the image." },
    { key: "fit", type: "enum", values: COURSE_IMAGE_FITS, note: "CSS object-fit." },
    { key: "position", type: "enum", values: COURSE_IMAGE_POSITIONS, note: "CSS object-position — which part of the image survives cropping." },
    { key: "radius", type: "number", note: "Corner radius in px." },
    { key: "href", type: "string", note: "Optional URL opened (new tab) when the learner taps the image." },
    {
      key: "annotations",
      type: "object[]",
      note: "Overlay objects drawn ON TOP of the image (numbered markers, highlight boxes, arrows) — for annotated Sweepr screenshots. Coordinates are percentages of the image box.",
      fields: [
        { key: "kind", type: "enum", values: COURSE_ANNOTATION_KINDS, required: true, note: "marker = numbered badge, box = highlight rectangle, arrow = pointer." },
        { key: "x", type: "number", required: true, note: "Left edge / anchor, % of image width (0–100)." },
        { key: "y", type: "number", required: true, note: "Top edge / anchor, % of image height (0–100)." },
        { key: "width", type: "number", note: "Box width % (box kind)." },
        { key: "height", type: "number", note: "Box height % (box kind)." },
        { key: "n", type: "number", note: "Badge number (marker kind)." },
        { key: "label", type: "string", localizable: true, note: "Short label shown beside the marker/box." },
      ],
    },
    STYLE_PROP,
  ],
  video: [
    { key: "streamId", type: "string", note: "Cloudflare Stream video id. The MCP cannot upload video — a human uploads it in the admin editor and the id lands here." },
    { key: "requireWatchPercent", type: "number", inert: true, note: "Stored, but nothing enforces a watch percentage yet." },
    { key: "allowSkip", type: "boolean", inert: true, note: "Stored, but skipping is not gated yet." },
    STYLE_PROP,
  ],
  embed: [
    { key: "url", type: "string", note: "URL rendered in an iframe for the learner." },
    STYLE_PROP,
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
    { key: "title", type: "string", localizable: true, note: "Bold first line." },
    { key: "body", type: "string", localizable: true, note: "Body copy. The key is `body` — a callout does NOT use `content`." },
    STYLE_PROP,
  ],
  quiz: [
    { key: "passingScore", type: "number", note: "Percent of this block's questions that must be correct for the block to grade as passed. Default 80." },
    {
      key: "questions",
      type: "object[]",
      note: "The quiz's questions — graded server-side; the learner never receives the `correct` flags.",
      fields: [
        { key: "question", type: "string", required: true, localizable: true, note: "The question text." },
        {
          key: "options",
          type: "object[]",
          required: true,
          note: "2–6 answer options. Exactly one `correct: true` unless `multi` is set.",
          fields: [
            { key: "text", type: "string", required: true, localizable: true, note: "Option text." },
            { key: "correct", type: "boolean", note: "Marks a correct option. Never served to the learner." },
          ],
        },
        { key: "multi", type: "boolean", note: "true = multi-select; grading requires the exact correct set." },
        { key: "explanation", type: "string", localizable: true, note: "Per-question teaching note, returned with the grade." },
      ],
    },
    ...FEEDBACK_PROPS,
    STYLE_PROP,
  ],
  button: [
    { key: "label", type: "string", localizable: true, note: "Button text." },
    { key: "color", type: "string", note: "Background color." },
    { key: "action", type: "enum", values: COURSE_BUTTON_ACTIONS, note: "What tapping does in the player: next / prev slide, open `url`, or finish the course." },
    { key: "url", type: "string", note: "Target when action is \"url\" (opened in a new tab)." },
    STYLE_PROP,
  ],
  checklist: [
    { key: "items", type: "string[]", localizable: true, note: "An array of PLAIN STRINGS, one per line item — e.g. [\"Ring the bell\", \"Photograph every room\"]. NOT objects: [{text: \"…\"}] is rejected (it used to be accepted, and crashed the learner's slide)." },
    STYLE_PROP,
  ],
  acknowledgment: [
    { key: "statement", type: "string", localizable: true, note: "The sentence the learner acknowledges. Ticking it is recorded server-side." },
    { key: "method", type: "enum", values: COURSE_ACK_METHODS, inert: true, note: "Stored, but the player always renders a checkbox today." },
    STYLE_PROP,
  ],

  // ── Interactive v2 ────────────────────────────────────────────────────────
  true_false: [
    { key: "statement", type: "string", localizable: true, note: "The statement the learner judges." },
    { key: "correct", type: "boolean", note: "Whether the statement is true. REQUIRED — never served to the learner." },
    ...FEEDBACK_PROPS,
    STYLE_PROP,
  ],
  image_choice: [
    { key: "question", type: "string", localizable: true, note: "The question above the image grid." },
    {
      key: "options",
      type: "object[]",
      note: "2–6 image answer options (single tap to choose).",
      fields: [
        { key: "url", type: "string", required: true, note: "Option image URL (upload via upload_course_asset / the editor)." },
        { key: "label", type: "string", localizable: true, note: "Short label shown under the image (e.g. \"A\")." },
        { key: "correct", type: "boolean", note: "Marks the correct image. Never served to the learner." },
      ],
    },
    ...FEEDBACK_PROPS,
    STYLE_PROP,
  ],
  sort: [
    { key: "prompt", type: "string", localizable: true, note: "Instruction above the sorter." },
    { key: "categories", type: "string[]", localizable: true, note: "2–4 category names (e.g. [\"Included\", \"Add-On\"])." },
    {
      key: "items",
      type: "object[]",
      note: "2–10 items the learner places into categories. Tap-first UI (tap item, tap category) — no precision dragging required.",
      fields: [
        { key: "id", type: "string", required: true, note: "Stable id, unique within the block (e.g. \"1\")." },
        { key: "label", type: "string", required: true, localizable: true, note: "Item text." },
        { key: "category", type: "string", required: true, note: "The CORRECT category (must be one of `categories`). Never served to the learner." },
      ],
    },
    { key: "immediateFeedback", type: "boolean", note: "true = the block auto-checks the moment every item is placed." },
    ...FEEDBACK_PROPS,
    STYLE_PROP,
  ],
  order: [
    { key: "prompt", type: "string", localizable: true, note: "Instruction above the sequence." },
    {
      key: "items",
      type: "object[]",
      note: "2–10 steps the learner puts in order (served shuffled; reordered with tap/arrow controls, keyboard-accessible).",
      fields: [
        { key: "id", type: "string", required: true, note: "Stable id, unique within the block." },
        { key: "label", type: "string", required: true, localizable: true, note: "Step text." },
        { key: "correctOrder", type: "number", required: true, note: "1-based position in the correct sequence. Never served to the learner." },
      ],
    },
    ...FEEDBACK_PROPS,
    STYLE_PROP,
  ],
  matching: [
    { key: "prompt", type: "string", localizable: true, note: "Instruction above the matcher." },
    {
      key: "pairs",
      type: "object[]",
      note: "2–8 left→right pairs. The learner sees the right column shuffled and taps to pair.",
      fields: [
        { key: "left", type: "string", required: true, localizable: true, note: "Left item (e.g. a situation)." },
        { key: "right", type: "string", required: true, localizable: true, note: "Its correct match (e.g. the response)." },
      ],
    },
    ...FEEDBACK_PROPS,
    STYLE_PROP,
  ],
  hotspot: [
    { key: "url", type: "string", note: "The image the learner taps (upload via upload_course_asset / the editor)." },
    { key: "prompt", type: "string", localizable: true, note: "Instruction, e.g. \"Tap the areas that still need attention.\"" },
    {
      key: "hotspots",
      type: "object[]",
      note: "Rectangular regions as PERCENTAGES of the image (responsive). The learner must tap every correct region; regions are never served to the learner (only how many to find).",
      fields: [
        { key: "x", type: "number", required: true, note: "Left edge, % (0–100)." },
        { key: "y", type: "number", required: true, note: "Top edge, % (0–100)." },
        { key: "width", type: "number", required: true, note: "Width, % (0–100)." },
        { key: "height", type: "number", required: true, note: "Height, % (0–100)." },
        { key: "correct", type: "boolean", note: "A region the learner is supposed to find." },
        { key: "label", type: "string", localizable: true, note: "Shown once found, e.g. \"Hair near toilet base\"." },
      ],
    },
    ...FEEDBACK_PROPS,
    STYLE_PROP,
  ],
  scenario: [
    {
      key: "messages",
      type: "object[]",
      note: "The conversation shown as chat bubbles before the learner chooses.",
      fields: [
        { key: "speaker", type: "string", localizable: true, note: "Bubble label, e.g. \"Customer\" or \"Sweepr\"." },
        { key: "text", type: "string", required: true, localizable: true, note: "Bubble text." },
        { key: "url", type: "string", note: "Optional image/screenshot shown inside the bubble." },
      ],
    },
    { key: "prompt", type: "string", localizable: true, note: "Question above the response choices, e.g. \"How do you respond?\"" },
    {
      key: "choices",
      type: "object[]",
      note: "2–4 responses the learner can choose (no branching — one correct/feedback round).",
      fields: [
        { key: "text", type: "string", required: true, localizable: true, note: "The response text." },
        { key: "correct", type: "boolean", note: "The professional/correct choice. Never served to the learner." },
        { key: "feedback", type: "string", localizable: true, note: "Choice-specific feedback returned with the grade." },
      ],
    },
    ...FEEDBACK_PROPS,
    STYLE_PROP,
  ],
  before_after: [
    { key: "beforeUrl", type: "string", note: "The \"before\" image URL." },
    { key: "afterUrl", type: "string", note: "The \"after\" image URL." },
    { key: "beforeLabel", type: "string", localizable: true, note: "Label for the before side. Default \"Before\"." },
    { key: "afterLabel", type: "string", localizable: true, note: "Label for the after side. Default \"After\"." },
    { key: "mode", type: "enum", values: COURSE_BEFORE_AFTER_MODES, note: "\"slider\" = draggable comparison handle; \"side_by_side\" = two images." },
    { key: "radius", type: "number", note: "Corner radius in px." },
    STYLE_PROP,
  ],
  timeline: [
    {
      key: "steps",
      type: "object[]",
      note: "2–12 process steps rendered as a polished step component (not a chart).",
      fields: [
        { key: "title", type: "string", required: true, localizable: true, note: "Step title, e.g. \"Check in\"." },
        { key: "description", type: "string", localizable: true, note: "One-line detail under the title." },
        { key: "icon", type: "enum", values: COURSE_ICONS, note: "Optional step icon." },
      ],
    },
    { key: "orientation", type: "enum", values: COURSE_TIMELINE_ORIENTATIONS, note: "Row of steps, or a vertical list." },
    STYLE_PROP,
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
  image: { width: 50, height: 50, props: { url: "", alt: "", caption: "", fit: "cover", position: "center", radius: 12 } },
  video: { width: 60, height: 55, props: { streamId: "", requireWatchPercent: 95, allowSkip: false } },
  embed: { width: 60, height: 55, props: { url: "" } },
  shape: { width: 26, height: 26, props: { shape: "rect", fill: "#2DD4BF", border: 0, borderColor: "#0f766e", radius: 12, opacity: 1 } },
  divider: { width: 60, height: 2, props: { color: "#cbd5e1", thickness: 2 } },
  spacer: { width: 40, height: 8, props: {} },
  callout: { width: 64, height: 22, props: { variant: "info", title: "Note", body: "Important information for the learner." } },
  quiz: {
    width: 70, height: 55,
    props: {
      passingScore: 80,
      questions: [
        {
          question: "Which should you review before accepting a booking?",
          options: [
            { text: "The full booking: time, service, add-ons and payout", correct: true },
            { text: "Only the address", correct: false },
          ],
        },
      ],
      allowRetry: true,
    },
  },
  button: { width: 28, height: 10, props: { label: "Next", action: "next", color: "#14b8a6" } },
  checklist: { width: 60, height: 30, props: { items: ["First step", "Second step"] } },
  acknowledgment: { width: 70, height: 14, props: { statement: "I acknowledge this policy.", method: "checkbox" } },
  true_false: {
    width: 64, height: 34,
    props: {
      statement: "A cleaner should accept a booking before checking the add-ons.",
      correct: false,
      explanation: "Review the full booking before accepting.",
      allowRetry: true,
    },
  },
  image_choice: {
    width: 70, height: 60,
    props: {
      question: "Which room is ready to be marked complete?",
      options: [
        { url: "", label: "A", correct: true },
        { url: "", label: "B", correct: false },
      ],
      allowRetry: true,
    },
  },
  sort: {
    width: 70, height: 60,
    props: {
      prompt: "Sort each item into the correct category.",
      categories: ["Included", "Add-On"],
      items: [
        { id: "1", label: "Vacuum floors", category: "Included" },
        { id: "2", label: "Inside oven", category: "Add-On" },
      ],
      allowRetry: true,
    },
  },
  order: {
    width: 70, height: 60,
    props: {
      prompt: "Put these steps in order.",
      items: [
        { id: "a", label: "Review booking", correctOrder: 1 },
        { id: "b", label: "Check in", correctOrder: 2 },
        { id: "c", label: "Complete service", correctOrder: 3 },
      ],
      allowRetry: true,
    },
  },
  matching: {
    width: 70, height: 60,
    props: {
      prompt: "Match each situation to the right response.",
      pairs: [
        { left: "Access code does not work", right: "Contact Sweepr support" },
        { left: "Customer asks for extra rooms", right: "Suggest booking the add-on" },
      ],
      allowRetry: true,
    },
  },
  hotspot: {
    width: 62, height: 62,
    props: {
      url: "",
      prompt: "Tap the areas that still need attention.",
      hotspots: [{ x: 35, y: 35, width: 22, height: 18, correct: true, label: "Needs attention" }],
      allowRetry: true,
    },
  },
  scenario: {
    width: 70, height: 62,
    props: {
      messages: [{ speaker: "Customer", text: "Can you clean the garage too while you're here?" }],
      prompt: "How do you respond?",
      choices: [
        { text: "Explain it isn't in this booking's scope and suggest adding it to a future booking.", correct: true },
        { text: "Say yes and clean it off the books.", correct: false },
      ],
      allowRetry: true,
    },
  },
  before_after: {
    width: 70, height: 55,
    props: { beforeUrl: "", afterUrl: "", beforeLabel: "Before", afterLabel: "Ready", mode: "slider", radius: 12 },
  },
  timeline: {
    width: 84, height: 30,
    props: {
      steps: [
        { title: "Review", description: "Check time, service, add-ons and payout.", icon: "document" },
        { title: "Check in", icon: "location" },
        { title: "Clean", icon: "sparkle" },
        { title: "Check out", icon: "check" },
      ],
      orientation: "horizontal",
    },
  },
};

// ─── Validation ─────────────────────────────────────────────────────────────

function validateFieldValue(path: string, value: unknown, spec: CourseFieldSpec): string[] {
  // An explicit null/undefined just means "use the default".
  if (value === null || value === undefined) return [];
  const errors: string[] = [];

  switch (spec.type) {
    case "string":
      if (typeof value !== "string") errors.push(`${path} must be a string`);
      break;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${path} must be a number`);
      break;
    case "boolean":
      if (typeof value !== "boolean") errors.push(`${path} must be a boolean`);
      break;
    case "enum":
      if (typeof value !== "string" || !spec.values?.includes(value)) {
        errors.push(`${path} must be one of: ${(spec.values ?? []).join(", ")}`);
      }
      break;
    case "string[]":
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
        errors.push(
          `${path} must be an array of plain strings` +
            (Array.isArray(value) && value.some((v) => v !== null && typeof v === "object")
              ? ` — objects like {text: "…"} are not accepted; pass ["…"] instead`
              : ""),
        );
      }
      break;
    case "object": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        errors.push(`${path} must be an object`);
        break;
      }
      errors.push(...validateObjectFields(path, value as Record<string, unknown>, spec.fields ?? []));
      break;
    }
    case "object[]": {
      if (!Array.isArray(value)) {
        errors.push(`${path} must be an array of objects`);
        break;
      }
      value.forEach((item, i) => {
        if (item === null || typeof item !== "object" || Array.isArray(item)) {
          errors.push(`${path}[${i}] must be an object`);
          return;
        }
        errors.push(...validateObjectFields(`${path}[${i}]`, item as Record<string, unknown>, spec.fields ?? []));
        for (const f of spec.fields ?? []) {
          if (f.required && ((item as Record<string, unknown>)[f.key] === undefined || (item as Record<string, unknown>)[f.key] === null)) {
            errors.push(`${path}[${i}].${f.key} is required`);
          }
        }
      });
      break;
    }
  }
  return errors;
}

function validateObjectFields(
  path: string,
  obj: Record<string, unknown>,
  fields: readonly CourseFieldSpec[],
): string[] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const errors: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const spec = byKey.get(key);
    if (!spec) {
      errors.push(`"${key}" is not a valid key of ${path} (allowed: ${fields.map((f) => f.key).join(", ") || "none"})`);
      continue;
    }
    errors.push(...validateFieldValue(`${path}.${key}`, value, spec));
  }
  return errors;
}

/** Prop keys of a block type whose values a locale overlay may translate. */
export function courseLocalizableSpecs(blockType: CourseBlockType): readonly CourseFieldSpec[] {
  return COURSE_BLOCK_PROPS[blockType].filter(
    (s) => s.localizable || (s.fields ?? []).some(fieldTreeHasLocalizable),
  );
}
function fieldTreeHasLocalizable(f: CourseFieldSpec): boolean {
  return Boolean(f.localizable) || (f.fields ?? []).some(fieldTreeHasLocalizable);
}

/**
 * Validate one locale's overlay value against the base value + spec.
 * Structured props are overlaid element-wise: the overlay array must have the
 * SAME length as the base, and each overlay item may carry ONLY localizable
 * fields (ids, answer keys and geometry stay single-source in the base).
 */
function validateOverlayValue(
  path: string,
  overlay: unknown,
  base: unknown,
  spec: CourseFieldSpec,
): string[] {
  if (overlay === null || overlay === undefined) return [];
  const errors: string[] = [];
  switch (spec.type) {
    case "string":
      if (!spec.localizable) errors.push(`${path} is not localizable`);
      else if (typeof overlay !== "string") errors.push(`${path} must be a string`);
      break;
    case "string[]":
      if (!spec.localizable) errors.push(`${path} is not localizable`);
      else if (!Array.isArray(overlay) || overlay.some((v) => typeof v !== "string")) {
        errors.push(`${path} must be an array of plain strings`);
      } else if (Array.isArray(base) && overlay.length !== base.length) {
        errors.push(`${path} must have the same number of entries as the default-locale value (${base.length})`);
      }
      break;
    case "object[]": {
      if (!Array.isArray(overlay)) {
        errors.push(`${path} must be an array (element-wise translation of the default-locale items)`);
        break;
      }
      const baseArr = Array.isArray(base) ? base : [];
      if (overlay.length !== baseArr.length) {
        errors.push(`${path} must have the same number of items as the default-locale value (${baseArr.length})`);
        break;
      }
      overlay.forEach((item, i) => {
        if (item === null || typeof item !== "object" || Array.isArray(item)) {
          errors.push(`${path}[${i}] must be an object`);
          return;
        }
        for (const [key, val] of Object.entries(item as Record<string, unknown>)) {
          const f = (spec.fields ?? []).find((x) => x.key === key);
          if (!f) {
            errors.push(`"${key}" is not a valid key of ${path}[${i}]`);
            continue;
          }
          if (!f.localizable && !(f.fields ?? []).some(fieldTreeHasLocalizable)) {
            errors.push(`${path}[${i}].${key} is not localizable — only text fields may be translated`);
            continue;
          }
          const baseItem = (baseArr[i] ?? {}) as Record<string, unknown>;
          errors.push(...validateOverlayValue(`${path}[${i}].${key}`, val, baseItem[key], f));
        }
      });
      break;
    }
    default:
      errors.push(`${path} is not localizable`);
  }
  return errors;
}

/**
 * Validate one block's props against its type. Returns human-readable
 * problems (empty array = valid). Used by apps/mcp AND apps/api to REJECT a
 * malformed block at write time, and to report on blocks already stored.
 *
 * Every prop is optional — a block with `{}` renders its defaults — but an
 * unknown key, a wrong value type, or a structurally-impossible interaction
 * (a quiz question with no correct option, a sort item pointing at a
 * category that doesn't exist) is an error, because each means the block
 * will not render or grade the way its author intended.
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

  const type = blockType as CourseBlockType;
  const specs = COURSE_BLOCK_PROPS[type];
  const byKey = new Map(specs.map((s) => [s.key, s]));
  const errors: string[] = [];
  const record = props as Record<string, unknown>;

  for (const [key, value] of Object.entries(record)) {
    if (key === "i18n") {
      errors.push(...validateBlockI18n(type, record, value));
      continue;
    }
    const spec = byKey.get(key);
    if (!spec) {
      const allowed = specs.map((s) => s.key);
      errors.push(
        allowed.length
          ? `"${key}" is not a prop of a ${blockType} block (allowed: ${allowed.join(", ")}, i18n)`
          : `a ${blockType} block takes no props, but "${key}" was given`,
      );
      continue;
    }
    errors.push(...validateFieldValue(`${blockType}.${key}`, value, spec));
  }

  // Cross-field invariants only make sense on structurally-valid props.
  if (errors.length === 0) {
    const rule = COURSE_BLOCK_RULES[type];
    if (rule) errors.push(...rule(record));
  }

  return errors;
}

function validateBlockI18n(
  blockType: CourseBlockType,
  props: Record<string, unknown>,
  i18n: unknown,
): string[] {
  if (i18n === null || i18n === undefined) return [];
  if (typeof i18n !== "object" || Array.isArray(i18n)) {
    return [`${blockType}.i18n must be an object of {locale: {prop: translation}}`];
  }
  const errors: string[] = [];
  const specs = COURSE_BLOCK_PROPS[blockType];
  const byKey = new Map(specs.map((s) => [s.key, s]));
  for (const [locale, overlay] of Object.entries(i18n as Record<string, unknown>)) {
    if (!COURSE_LOCALES.includes(locale as CourseLocale)) {
      errors.push(`${blockType}.i18n: unknown locale "${locale}" (expected one of: ${COURSE_LOCALES.join(", ")})`);
      continue;
    }
    if (overlay === null || typeof overlay !== "object" || Array.isArray(overlay)) {
      errors.push(`${blockType}.i18n.${locale} must be an object of {prop: translation}`);
      continue;
    }
    for (const [key, value] of Object.entries(overlay as Record<string, unknown>)) {
      const spec = byKey.get(key);
      if (!spec) {
        errors.push(`${blockType}.i18n.${locale}: "${key}" is not a prop of a ${blockType} block`);
        continue;
      }
      errors.push(...validateOverlayValue(`${blockType}.i18n.${locale}.${key}`, value, props[key], spec));
    }
  }
  return errors;
}

// Cross-field invariants per block type — a block that passes these will
// render AND grade sensibly. Run only after per-field validation passes.
const COURSE_BLOCK_RULES: Partial<Record<CourseBlockType, (props: Record<string, unknown>) => string[]>> = {
  quiz: (p) => {
    const errors: string[] = [];
    const questions = Array.isArray(p.questions) ? (p.questions as Array<Record<string, unknown>>) : [];
    if (p.questions !== undefined && questions.length === 0) errors.push("quiz.questions must have at least 1 question");
    if (questions.length > 10) errors.push("quiz.questions supports at most 10 questions per block");
    questions.forEach((q, i) => {
      const options = Array.isArray(q.options) ? (q.options as Array<Record<string, unknown>>) : [];
      if (options.length < 2 || options.length > 6) errors.push(`quiz.questions[${i}] needs 2–6 options`);
      const correct = options.filter((o) => o.correct === true).length;
      if (correct === 0) errors.push(`quiz.questions[${i}] has no correct option`);
      if (!q.multi && correct > 1) errors.push(`quiz.questions[${i}] has ${correct} correct options — set multi: true or mark exactly one correct`);
    });
    return errors;
  },
  true_false: (p) =>
    typeof p.correct === "boolean" ? [] : ["true_false.correct is required (true or false) — without it the block cannot grade"],
  image_choice: (p) => {
    const errors: string[] = [];
    const options = Array.isArray(p.options) ? (p.options as Array<Record<string, unknown>>) : [];
    if (options.length < 2 || options.length > 6) errors.push("image_choice.options needs 2–6 options");
    else if (!options.some((o) => o.correct === true)) errors.push("image_choice.options has no correct option");
    return errors;
  },
  sort: (p) => {
    const errors: string[] = [];
    const categories = Array.isArray(p.categories) ? (p.categories as string[]) : [];
    const items = Array.isArray(p.items) ? (p.items as Array<Record<string, unknown>>) : [];
    if (categories.length < 2 || categories.length > 4) errors.push("sort.categories needs 2–4 categories");
    if (items.length < 2 || items.length > 10) errors.push("sort.items needs 2–10 items");
    const ids = new Set<string>();
    items.forEach((it, i) => {
      if (typeof it.id === "string") {
        if (ids.has(it.id)) errors.push(`sort.items[${i}].id "${it.id}" is duplicated`);
        ids.add(it.id);
      }
      if (typeof it.category === "string" && categories.length && !categories.includes(it.category)) {
        errors.push(`sort.items[${i}].category "${it.category}" is not one of the block's categories`);
      }
    });
    return errors;
  },
  order: (p) => {
    const errors: string[] = [];
    const items = Array.isArray(p.items) ? (p.items as Array<Record<string, unknown>>) : [];
    if (items.length < 2 || items.length > 10) errors.push("order.items needs 2–10 items");
    const ids = new Set<string>();
    const orders = new Set<number>();
    items.forEach((it, i) => {
      if (typeof it.id === "string") {
        if (ids.has(it.id)) errors.push(`order.items[${i}].id "${it.id}" is duplicated`);
        ids.add(it.id);
      }
      if (typeof it.correctOrder === "number") {
        if (orders.has(it.correctOrder)) errors.push(`order.items[${i}].correctOrder ${it.correctOrder} is duplicated — positions must be distinct`);
        orders.add(it.correctOrder);
      }
    });
    return errors;
  },
  matching: (p) => {
    const pairs = Array.isArray(p.pairs) ? (p.pairs as unknown[]) : [];
    return pairs.length >= 2 && pairs.length <= 8 ? [] : ["matching.pairs needs 2–8 pairs"];
  },
  hotspot: (p) => {
    const errors: string[] = [];
    const hotspots = Array.isArray(p.hotspots) ? (p.hotspots as Array<Record<string, unknown>>) : [];
    if (hotspots.length < 1 || hotspots.length > 10) errors.push("hotspot.hotspots needs 1–10 regions");
    else if (!hotspots.some((h) => h.correct === true)) errors.push("hotspot.hotspots has no correct region — the learner would have nothing to find");
    hotspots.forEach((h, i) => {
      for (const k of ["x", "y", "width", "height"] as const) {
        const v = h[k];
        if (typeof v === "number" && (v < 0 || v > 100)) errors.push(`hotspot.hotspots[${i}].${k} must be a percentage (0–100)`);
      }
    });
    return errors;
  },
  scenario: (p) => {
    const errors: string[] = [];
    const messages = Array.isArray(p.messages) ? (p.messages as unknown[]) : [];
    const choices = Array.isArray(p.choices) ? (p.choices as Array<Record<string, unknown>>) : [];
    if (messages.length < 1 || messages.length > 8) errors.push("scenario.messages needs 1–8 messages");
    if (choices.length < 2 || choices.length > 4) errors.push("scenario.choices needs 2–4 choices");
    else if (!choices.some((c) => c.correct === true)) errors.push("scenario.choices has no correct choice");
    return errors;
  },
  timeline: (p) => {
    const steps = Array.isArray(p.steps) ? (p.steps as unknown[]) : [];
    return steps.length >= 2 && steps.length <= 12 ? [] : ["timeline.steps needs 2–12 steps"];
  },
  image: (p) => {
    const errors: string[] = [];
    const annotations = Array.isArray(p.annotations) ? (p.annotations as Array<Record<string, unknown>>) : [];
    if (annotations.length > 12) errors.push("image.annotations supports at most 12 overlays");
    annotations.forEach((a, i) => {
      for (const k of ["x", "y", "width", "height"] as const) {
        const v = a[k];
        if (typeof v === "number" && (v < 0 || v > 100)) errors.push(`image.annotations[${i}].${k} must be a percentage (0–100)`);
      }
    });
    return errors;
  },
};

// ─── Style token → CSS mapping ──────────────────────────────────────────────

const STYLE_VARIANT_PALETTES: Record<string, { bg: string; border: string; text: string }> = {
  neutral: { bg: "#f8fafc", border: "#e2e8f0", text: "#334155" },
  brand: { bg: "#f0fdfa", border: "#99f6e4", text: "#115e59" },
  info: { bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af" },
  success: { bg: "#ecfdf5", border: "#a7f3d0", text: "#065f46" },
  warning: { bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
};
const STYLE_RADIUS_PX: Record<string, number> = { none: 0, sm: 6, md: 10, lg: 16, xl: 24 };
const STYLE_PADDING_PX: Record<string, number> = { none: 0, sm: 8, md: 14, lg: 20 };
const STYLE_FONT_SIZE_PX: Record<string, number> = { sm: 13, md: 16, lg: 20, xl: 26 };
const STYLE_FONT_WEIGHTS: Record<string, number> = { normal: 400, medium: 500, semibold: 600, bold: 700 };
const STYLE_SHADOWS: Record<string, string> = {
  none: "none",
  sm: "0 1px 3px rgba(15, 23, 42, 0.10)",
  md: "0 4px 14px rgba(15, 23, 42, 0.12)",
};

/**
 * Map a block's `style` token object onto inline-CSS values. Both renderers
 * call this so a style renders identically in the editor and the player.
 * Unknown/absent tokens produce no CSS (the block's own base look wins).
 */
export function courseStyleCss(style: unknown): Record<string, string | number> {
  if (style === null || typeof style !== "object" || Array.isArray(style)) return {};
  const s = style as Record<string, unknown>;
  const css: Record<string, string | number> = {};
  const palette = typeof s.variant === "string" && s.variant !== "none" ? STYLE_VARIANT_PALETTES[s.variant] : undefined;
  if (palette) {
    css.background = palette.bg;
    css.border = `1px solid ${palette.border}`;
    css.color = palette.text;
  }
  if (typeof s.fill === "string" && s.fill) css.background = s.fill;
  if (typeof s.textColor === "string" && s.textColor) css.color = s.textColor;
  if (typeof s.borderWidth === "number" || (typeof s.borderColor === "string" && s.borderColor)) {
    const width = typeof s.borderWidth === "number" ? Math.max(0, Math.min(6, s.borderWidth)) : 1;
    const color = typeof s.borderColor === "string" && s.borderColor ? s.borderColor : ((palette?.border) ?? "#e2e8f0");
    css.border = width === 0 ? "none" : `${width}px solid ${color}`;
  }
  if (typeof s.radius === "string" && s.radius in STYLE_RADIUS_PX) css.borderRadius = `${STYLE_RADIUS_PX[s.radius]}px`;
  if (typeof s.padding === "string" && s.padding in STYLE_PADDING_PX) css.padding = `${STYLE_PADDING_PX[s.padding]}px`;
  if (typeof s.align === "string") css.textAlign = s.align;
  if (typeof s.fontSize === "string" && s.fontSize in STYLE_FONT_SIZE_PX) css.fontSize = `${STYLE_FONT_SIZE_PX[s.fontSize]}px`;
  if (typeof s.fontWeight === "string" && s.fontWeight in STYLE_FONT_WEIGHTS) css.fontWeight = STYLE_FONT_WEIGHTS[s.fontWeight];
  if (typeof s.shadow === "string" && s.shadow in STYLE_SHADOWS && s.shadow !== "none") css.boxShadow = STYLE_SHADOWS[s.shadow];
  return css;
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

function describeField(f: CourseFieldSpec, indent: string): string[] {
  const t = f.type === "enum" ? (f.values ?? []).map((v) => `"${v}"`).join(" | ") : f.type;
  const flags = [
    f.required ? "REQUIRED" : "",
    f.localizable ? "localizable" : "",
    f.inert ? "NOT RENDERED YET" : "",
  ].filter(Boolean);
  const lines = [`${indent}- \`${f.key}\` (${t})${flags.length ? ` [${flags.join(", ")}]` : ""}: ${f.note}`];
  for (const sub of f.fields ?? []) lines.push(...describeField(sub, indent + "  "));
  return lines;
}

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
    for (const s of specs) lines.push(...describeField(s, "  "));
    lines.push(`  - default: \`${JSON.stringify(defaults.props)}\` at ${defaults.width}x${defaults.height}`);
  }
  return lines.join("\n");
}
