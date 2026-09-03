/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { useAuth } from "@clerk/clerk-react";
import {
  COURSE_BLOCK_DEFAULTS,
  COURSE_CALLOUT_STYLES,
  COURSE_FONTS,
  COURSE_ICONS,
  COURSE_STYLE_PADDINGS,
  COURSE_STYLE_RADII,
  COURSE_STYLE_VARIANTS,
  courseChecklistItems,
  courseLocalizableSpecs,
  courseStyleCss,
  courseText,
  type CourseBlockType,
} from "@sweepr/utils";
import {
  Undo2, Redo2, Plus, Type, Heading, Image as ImageIcon, Video, ListChecks,
  CheckSquare, MousePointerClick, HelpCircle, Eye, Send, ChevronLeft,
  Copy, Trash2, Save, Palette, Square, Minus, MessageSquare,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  BringToFront, SendToBack, AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter, Layout, Upload, Loader2, CheckCircle2,
  ToggleLeft, Images, Columns3, ArrowUpDown, Link2, Crosshair,
  MessagesSquare, SlidersHorizontal, Milestone, Frame, Languages,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

// ─── Types ──────────────────────────────────────────────────────────────────

// The shared union from @sweepr/utils — the editor's palette, the learner
// player and the MCP's validation all read the same schema.
type BlockType = CourseBlockType;

interface Block {
  id: string;
  block_type: BlockType;
  x: number; y: number; width: number; height: number; z_index: number;
  props: Record<string, unknown>;
}
interface Slide {
  id: string;
  title: string | null;
  slide_type: string;
  slide_order: number;
  background: Record<string, unknown>;
  completion_rule: Record<string, unknown>;
  i18n: Record<string, { title?: string }>;
  blocks: Block[];
}
interface CourseMeta {
  default_locale: string;
  supported_locales: string[];
  i18n: Record<string, { title?: string; description?: string }>;
}
interface Assessment {
  passingScorePct?: number | null;
  maxAttempts?: number | null;
  shuffleQuestions?: boolean;
  shuffleAnswers?: boolean;
  showScore?: boolean;
  showExplanations?: boolean;
}

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `tmp-${Math.random().toString(36).slice(2)}`);

// Fonts, block defaults and the callout palette all come from
// @sweepr/utils's courseSchema — the single source of truth this editor, the
// learner player, and the MCP course tools' write validation all read, so a
// block this editor can produce is always a block the other two understand.
const FONTS = COURSE_FONTS;
const BLOCK_DEFAULTS = COURSE_BLOCK_DEFAULTS;

const INSERT_GROUPS: { label: string; items: { type: BlockType; label: string; icon: typeof Type }[] }[] = [
  {
    label: "Content",
    items: [
      { type: "heading", label: "Heading", icon: Heading },
      { type: "text", label: "Text", icon: Type },
      { type: "image", label: "Image", icon: ImageIcon },
      { type: "video", label: "Video", icon: Video },
      { type: "embed", label: "Embed", icon: Frame },
    ],
  },
  {
    label: "Layout",
    items: [
      { type: "shape", label: "Shape", icon: Square },
      { type: "divider", label: "Divider", icon: Minus },
      { type: "callout", label: "Callout", icon: MessageSquare },
      { type: "timeline", label: "Timeline", icon: Milestone },
      { type: "before_after", label: "Before/After", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Interactive",
    items: [
      { type: "quiz", label: "Quiz", icon: HelpCircle },
      { type: "true_false", label: "True/False", icon: ToggleLeft },
      { type: "image_choice", label: "Img Choice", icon: Images },
      { type: "sort", label: "Sort", icon: Columns3 },
      { type: "order", label: "Order", icon: ArrowUpDown },
      { type: "matching", label: "Match", icon: Link2 },
      { type: "hotspot", label: "Hotspot", icon: Crosshair },
      { type: "scenario", label: "Scenario", icon: MessagesSquare },
      { type: "button", label: "Button", icon: MousePointerClick },
      { type: "checklist", label: "Checklist", icon: ListChecks },
      { type: "acknowledgment", label: "Acknowledge", icon: CheckSquare },
    ],
  },
];

const SLIDE_LAYOUTS: { id: string; label: string; build: () => Block[] }[] = [
  {
    id: "title",
    label: "Title",
    build: () => [
      mk("heading", { x: 12, y: 36, width: 76, height: 16, props: { content: "Course Title", size: 52, weight: 700, color: "#0f172a", align: "center", font: "Inter" } }),
      mk("text", { x: 18, y: 54, width: 64, height: 10, props: { content: "Subtitle or module name", size: 22, weight: 400, color: "#64748b", align: "center", font: "Inter" } }),
    ],
  },
  {
    id: "title-content",
    label: "Title + Content",
    build: () => [
      mk("heading", { x: 8, y: 8, width: 84, height: 12, props: { content: "Slide title", size: 38, weight: 700, color: "#0f172a", align: "left", font: "Inter" } }),
      mk("text", { x: 8, y: 24, width: 84, height: 60, props: { content: "Body content…", size: 20, weight: 400, color: "#334155", align: "left", font: "Inter" } }),
    ],
  },
  {
    id: "two-col",
    label: "Two Column",
    build: () => [
      mk("heading", { x: 8, y: 8, width: 84, height: 12, props: { content: "Slide title", size: 36, weight: 700, color: "#0f172a", align: "left", font: "Inter" } }),
      mk("text", { x: 8, y: 24, width: 40, height: 60, props: { content: "Left column…", size: 18, color: "#334155", align: "left", font: "Inter" } }),
      mk("text", { x: 52, y: 24, width: 40, height: 60, props: { content: "Right column…", size: 18, color: "#334155", align: "left", font: "Inter" } }),
    ],
  },
  {
    id: "media",
    label: "Media + Caption",
    build: () => [
      mk("image", { x: 10, y: 12, width: 80, height: 60, props: { url: "", fit: "cover", radius: 12 } }),
      mk("text", { x: 10, y: 76, width: 80, height: 8, props: { content: "Caption", size: 16, color: "#64748b", align: "center", font: "Inter" } }),
    ],
  },
  { id: "blank", label: "Blank", build: () => [] },
];

function mk(type: BlockType, over: Partial<Block> & { props?: Record<string, unknown> }): Block {
  // Every entry in COURSE_BLOCK_DEFAULTS supplies width/height, so this
  // spreads size from the shared schema and only x/y/z_index are seeded here.
  const def = BLOCK_DEFAULTS[type];
  return {
    id: uid(), block_type: type, x: 8, y: 8, z_index: 0,
    ...def, ...over,
    props: { ...(def.props ?? {}), ...(over.props ?? {}) },
  } as Block;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CourseEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const [title, setTitle] = useState("");
  const [meta, setMeta] = useState<CourseMeta>({ default_locale: "en", supported_locales: ["en"], i18n: {} });
  const [assessment, setAssessment] = useState<Assessment>({});
  const [slides, setSlides] = useState<Slide[]>([]);
  const [current, setCurrent] = useState(0);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [editingBlock, setEditingBlock] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "dirty">("saved");
  const [preview, setPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [layoutMenu, setLayoutMenu] = useState(false);

  const history = useRef<Slide[][]>([]);
  const future = useRef<Slide[][]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load ──
  useEffect(() => {
    (async () => {
      const token = await getToken();
      const res = await fetch(`${API}/admin/courses/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTitle(data.course.title);
        setMeta({
          default_locale: data.course.default_locale ?? "en",
          supported_locales: Array.isArray(data.course.supported_locales) ? data.course.supported_locales : ["en"],
          i18n: data.course.i18n ?? {},
        });
        setAssessment((data.version?.settings as Assessment) ?? {});
        const loaded: Slide[] = (data.slides ?? []).map((s: Slide) => ({
          ...s,
          background: s.background ?? {},
          completion_rule: s.completion_rule ?? { type: "viewed" },
          i18n: s.i18n ?? {},
          blocks: (s.blocks ?? []).map((b) => ({ ...b, props: b.props ?? {} })),
        }));
        setSlides(loaded.length ? loaded : [newSlide(0)]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function newSlide(order: number): Slide {
    return {
      id: uid(), title: "Untitled slide", slide_type: "content",
      slide_order: order, background: { color: "#ffffff" }, completion_rule: { type: "viewed" }, i18n: {}, blocks: [],
    };
  }

  // ── History-tracked mutation ──
  const commit = useCallback((next: Slide[]) => {
    history.current.push(slides);
    if (history.current.length > 80) history.current.shift();
    future.current = [];
    setSlides(next);
    setSaveStatus("dirty");
  }, [slides]);

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (!prev) return;
    future.current.push(slides);
    setSlides(prev);
    setSaveStatus("dirty");
  }, [slides]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(slides);
    setSlides(next);
    setSaveStatus("dirty");
  }, [slides]);

  // ── Autosave (debounced) ──
  useEffect(() => {
    if (saveStatus !== "dirty") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(), 1200);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides, saveStatus]);

  const save = useCallback(async () => {
    setSaveStatus("saving");
    const token = await getToken();
    const payload = {
      title,
      default_locale: meta.default_locale,
      supported_locales: meta.supported_locales,
      i18n: meta.i18n,
      assessment,
      slides: slides.map((s, i) => ({
        title: s.title, slide_type: s.slide_type, slide_order: i,
        background: s.background, completion_rule: s.completion_rule,
        i18n: s.i18n ?? {},
        blocks: s.blocks.map((b) => ({
          block_type: b.block_type, x: b.x, y: b.y, width: b.width,
          height: b.height, z_index: b.z_index, props: b.props,
        })),
      })),
    };
    const res = await fetch(`${API}/admin/courses/${id}/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    setSaveStatus(res.ok ? "saved" : "dirty");
  }, [getToken, id, slides, title, meta, assessment]);

  async function publish() {
    setPublishing(true);
    try {
      await save();
      const token = await getToken();
      const res = await fetch(`${API}/admin/courses/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ require_retake: false }),
      });
      if (res.ok) alert("Course published.");
    } finally {
      setPublishing(false);
    }
  }

  // ── Block ops ──
  const slide = slides[current];
  function updateSlide(patch: Partial<Slide>) {
    commit(slides.map((s, i) => (i === current ? { ...s, ...patch } : s)));
  }
  function addBlock(type: BlockType) {
    const block = mk(type, {
      x: 10, y: 12,
      z_index: slide.blocks.length,
      width: BLOCK_DEFAULTS[type].width ?? 40,
      height: BLOCK_DEFAULTS[type].height ?? 16,
    });
    updateSlide({ blocks: [...slide.blocks, block] });
    setSelectedBlock(block.id);
  }
  function updateBlock(blockId: string, patch: Partial<Block>) {
    updateSlide({ blocks: slide.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)) });
  }
  function updateBlockProps(blockId: string, props: Record<string, unknown>) {
    const b = slide.blocks.find((x) => x.id === blockId);
    if (b) updateBlock(blockId, { props: { ...b.props, ...props } });
  }
  function deleteBlock(blockId: string) {
    updateSlide({ blocks: slide.blocks.filter((b) => b.id !== blockId) });
    setSelectedBlock(null);
  }
  function duplicateBlock(blockId: string) {
    const b = slide.blocks.find((x) => x.id === blockId);
    if (!b) return;
    const copy = { ...b, id: uid(), x: Math.min(b.x + 4, 90), y: Math.min(b.y + 4, 90), z_index: slide.blocks.length };
    updateSlide({ blocks: [...slide.blocks, copy] });
    setSelectedBlock(copy.id);
  }
  function reorderBlock(blockId: string, dir: "front" | "back") {
    const ordered = [...slide.blocks].sort((a, b) => a.z_index - b.z_index);
    const idx = ordered.findIndex((b) => b.id === blockId);
    if (idx === -1) return;
    const [b] = ordered.splice(idx, 1);
    if (dir === "front") ordered.push(b); else ordered.unshift(b);
    updateSlide({ blocks: ordered.map((bl, i) => ({ ...bl, z_index: i })) });
  }
  function alignBlock(blockId: string, axis: "h" | "v") {
    const b = slide.blocks.find((x) => x.id === blockId);
    if (!b) return;
    if (axis === "h") updateBlock(blockId, { x: (100 - b.width) / 2 });
    else updateBlock(blockId, { y: (100 - b.height) / 2 });
  }

  // ── Slide ops ──
  function addSlide(layoutId = "title-content") {
    const layout = SLIDE_LAYOUTS.find((l) => l.id === layoutId) ?? SLIDE_LAYOUTS[1];
    const s = newSlide(slides.length);
    s.blocks = layout.build().map((b, i) => ({ ...b, z_index: i }));
    const next = [...slides, s];
    commit(next);
    setCurrent(next.length - 1);
    setSelectedBlock(null);
    setLayoutMenu(false);
  }
  function duplicateSlide(i: number) {
    const copy: Slide = {
      ...slides[i], id: uid(),
      blocks: slides[i].blocks.map((b) => ({ ...b, id: uid() })),
    };
    const next = [...slides.slice(0, i + 1), copy, ...slides.slice(i + 1)];
    commit(next);
    setCurrent(i + 1);
  }
  function deleteSlide(i: number) {
    if (slides.length === 1) return;
    const next = slides.filter((_, idx) => idx !== i);
    commit(next);
    setCurrent(Math.max(0, i - 1));
  }
  function moveSlide(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
    setCurrent(j);
  }

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editingBlock) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (meta && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (!selectedBlock) return;
      if (meta && e.key === "d") { e.preventDefault(); duplicateBlock(selectedBlock); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteBlock(selectedBlock); return; }
      const step = e.shiftKey ? 5 : 1;
      const b = slide?.blocks.find((x) => x.id === selectedBlock);
      if (!b) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); updateBlock(b.id, { x: clamp(b.x - step, 0, 100 - b.width) }); }
      if (e.key === "ArrowRight") { e.preventDefault(); updateBlock(b.id, { x: clamp(b.x + step, 0, 100 - b.width) }); }
      if (e.key === "ArrowUp") { e.preventDefault(); updateBlock(b.id, { y: clamp(b.y - step, 0, 100 - b.height) }); }
      if (e.key === "ArrowDown") { e.preventDefault(); updateBlock(b.id, { y: clamp(b.y + step, 0, 100 - b.height) }); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBlock, editingBlock, slide, slides]);

  // ── Drag / resize ──
  function startDrag(e: React.PointerEvent, block: Block, mode: "move" | "resize") {
    if (editingBlock === block.id) return;
    e.stopPropagation();
    setSelectedBlock(block.id);
    const rect = canvasRef.current!.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const orig = { x: block.x, y: block.y, w: block.width, h: block.height };
    history.current.push(slides);
    future.current = [];

    function move(ev: PointerEvent) {
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      setSlides((prev) => prev.map((s, i) => i !== current ? s : {
        ...s,
        blocks: s.blocks.map((b) => {
          if (b.id !== block.id) return b;
          if (mode === "move") {
            return { ...b, x: clamp(orig.x + dx, 0, 100 - b.width), y: clamp(orig.y + dy, 0, 100 - b.height) };
          }
          return { ...b, width: clamp(orig.w + dx, 4, 100 - b.x), height: clamp(orig.h + dy, 2, 100 - b.y) };
        }),
      }));
      setSaveStatus("dirty");
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  if (!slide) {
    return <div className="min-h-screen grid place-items-center bg-slate-100 text-slate-500">Loading editor…</div>;
  }

  const selected = slide.blocks.find((b) => b.id === selectedBlock) ?? null;
  const isTextual = selected && (selected.block_type === "text" || selected.block_type === "heading");

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-100 text-slate-800 select-none">
      {/* ── Title bar ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-1.5">
        <button onClick={() => navigate("/courses")} className="rounded p-1.5 hover:bg-slate-100" title="Back to library">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); setSaveStatus("dirty"); }}
          className="rounded px-2 py-1 text-sm font-semibold outline-none hover:bg-slate-100 focus:bg-slate-100 w-64"
        />
        <span className="text-xs text-slate-600 w-16">
          {saveStatus === "saving" ? "Saving…" : saveStatus === "dirty" ? "Unsaved" : "Saved"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => save()} className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
            <Save className="h-3.5 w-3.5" /> Save
          </button>
          <button
            onClick={() => { setPreview((v) => !v); setSelectedBlock(null); }}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium ${preview ? "bg-seafoam-500 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
          <button
            onClick={publish}
            disabled={publishing}
            className="flex items-center gap-1.5 rounded bg-seafoam-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-seafoam-600 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" /> Publish
          </button>
        </div>
      </div>

      {/* ── Ribbon ── */}
      {!preview && (
        <div className="flex items-stretch gap-0 border-b border-slate-200 bg-slate-50 px-2 py-1.5 overflow-x-auto">
          {/* History */}
          <RibbonGroup label="Edit">
            <RibbonBtn onClick={undo} icon={Undo2} title="Undo (⌘Z)" />
            <RibbonBtn onClick={redo} icon={Redo2} title="Redo (⌘⇧Z)" />
          </RibbonGroup>

          {/* Slides */}
          <RibbonGroup label="Slide">
            <div className="relative">
              <button
                onClick={() => setLayoutMenu((v) => !v)}
                className="flex h-full items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
              >
                <Layout className="h-4 w-4" /> New Slide
              </button>
              {layoutMenu && (
                <div className="absolute z-30 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                  {SLIDE_LAYOUTS.map((l) => (
                    <button key={l.id} onClick={() => addSlide(l.id)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100">
                      <Layout className="h-3.5 w-3.5 text-seafoam-500" /> {l.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </RibbonGroup>

          {/* Insert */}
          {INSERT_GROUPS.map((g) => (
            <RibbonGroup key={g.label} label={g.label}>
              {g.items.map((it) => (
                <RibbonBtn key={it.type} onClick={() => addBlock(it.type)} icon={it.icon} title={`Insert ${it.label}`} label={it.label} />
              ))}
            </RibbonGroup>
          ))}

          {/* Contextual text formatting */}
          {isTextual && selected && (
            <RibbonGroup label="Format">
              <select
                value={(selected.props.font as string) ?? "Inter"}
                onChange={(e) => updateBlockProps(selected.id, { font: e.target.value })}
                className="h-7 rounded border border-slate-300 bg-white px-1 text-xs"
              >
                {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <input
                type="number"
                value={(selected.props.size as number) ?? 20}
                onChange={(e) => updateBlockProps(selected.id, { size: Number(e.target.value) })}
                className="h-7 w-12 rounded border border-slate-300 bg-white px-1 text-xs"
              />
              <RibbonToggle active={((selected.props.weight as number) ?? 400) >= 700} icon={Bold}
                onClick={() => updateBlockProps(selected.id, { weight: ((selected.props.weight as number) ?? 400) >= 700 ? 400 : 700 })} />
              <RibbonToggle active={Boolean(selected.props.italic)} icon={Italic}
                onClick={() => updateBlockProps(selected.id, { italic: !selected.props.italic })} />
              <RibbonToggle active={Boolean(selected.props.underline)} icon={Underline}
                onClick={() => updateBlockProps(selected.id, { underline: !selected.props.underline })} />
              <RibbonToggle active={selected.props.align === "left"} icon={AlignLeft}
                onClick={() => updateBlockProps(selected.id, { align: "left" })} />
              <RibbonToggle active={selected.props.align === "center"} icon={AlignCenter}
                onClick={() => updateBlockProps(selected.id, { align: "center" })} />
              <RibbonToggle active={selected.props.align === "right"} icon={AlignRight}
                onClick={() => updateBlockProps(selected.id, { align: "right" })} />
              <input type="color" value={(selected.props.color as string) ?? "#0f172a"}
                onChange={(e) => updateBlockProps(selected.id, { color: e.target.value })}
                className="h-7 w-7 cursor-pointer rounded border border-slate-300 bg-white" title="Text color" />
            </RibbonGroup>
          )}

          {/* Arrange (any block selected) */}
          {selected && (
            <RibbonGroup label="Arrange">
              <RibbonBtn onClick={() => reorderBlock(selected.id, "front")} icon={BringToFront} title="Bring to front" />
              <RibbonBtn onClick={() => reorderBlock(selected.id, "back")} icon={SendToBack} title="Send to back" />
              <RibbonBtn onClick={() => alignBlock(selected.id, "h")} icon={AlignHorizontalJustifyCenter} title="Center horizontally" />
              <RibbonBtn onClick={() => alignBlock(selected.id, "v")} icon={AlignVerticalJustifyCenter} title="Center vertically" />
              <RibbonBtn onClick={() => duplicateBlock(selected.id)} icon={Copy} title="Duplicate (⌘D)" />
              <RibbonBtn onClick={() => deleteBlock(selected.id)} icon={Trash2} title="Delete (⌫)" />
            </RibbonGroup>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ── Slide rail ── */}
        {!preview && (
          <div className="w-48 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-2 space-y-2">
            {slides.map((s, i) => (
              <div key={s.id} className="group relative">
                <button
                  onClick={() => { setCurrent(i); setSelectedBlock(null); }}
                  className={`block w-full rounded-md border-2 p-1 text-left transition ${i === current ? "border-seafoam-400" : "border-slate-200 hover:border-slate-300"}`}
                >
                  <div className="mb-1 flex items-center justify-between px-0.5">
                    <span className="text-[10px] font-medium text-slate-600">{i + 1}</span>
                    <span className="text-[9px] uppercase text-slate-600">{s.slide_type}</span>
                  </div>
                  <div className="relative aspect-video overflow-hidden rounded bg-white ring-1 ring-slate-200"
                    style={{ background: (s.background.color as string) ?? "#ffffff" }}>
                    {s.blocks.map((b) => <ThumbBlock key={b.id} block={b} />)}
                  </div>
                </button>
                <div className="absolute right-1 top-5 hidden gap-1 group-hover:flex">
                  <button onClick={() => moveSlide(i, -1)} className="rounded bg-white p-1 shadow ring-1 ring-slate-200 hover:bg-slate-50" title="Move up">↑</button>
                  <button onClick={() => moveSlide(i, 1)} className="rounded bg-white p-1 shadow ring-1 ring-slate-200 hover:bg-slate-50" title="Move down">↓</button>
                  <button onClick={() => duplicateSlide(i)} className="rounded bg-white p-1 shadow ring-1 ring-slate-200 hover:bg-slate-50" title="Duplicate">
                    <Copy className="h-3 w-3" />
                  </button>
                  {slides.length > 1 && (
                    <button onClick={() => deleteSlide(i)} className="rounded bg-white p-1 shadow ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-600" title="Delete">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button onClick={() => addSlide()} className="flex w-full items-center justify-center gap-1 rounded-md border-2 border-dashed border-slate-300 py-3 text-xs text-slate-600 hover:border-slate-400">
              <Plus className="h-3.5 w-3.5" /> Add slide
            </button>
          </div>
        )}

        {/* ── Canvas ── */}
        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-200 p-8"
          onClick={() => { setSelectedBlock(null); setEditingBlock(null); }}>
          <div
            ref={canvasRef}
            className="relative aspect-video w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-2xl"
            style={{ background: (slide.background.color as string) ?? "#ffffff" }}
          >
            {[...slide.blocks].sort((a, b) => a.z_index - b.z_index).map((b) => (
              <BlockView
                key={b.id}
                block={b}
                selected={!preview && b.id === selectedBlock}
                editing={editingBlock === b.id}
                preview={preview}
                onSelect={() => setSelectedBlock(b.id)}
                onStartEdit={() => { setSelectedBlock(b.id); setEditingBlock(b.id); }}
                onEndEdit={() => setEditingBlock(null)}
                onEditContent={(v) => updateBlockProps(b.id, { content: v })}
                onDragStart={(e) => startDrag(e, b, "move")}
                onResizeStart={(e) => startDrag(e, b, "resize")}
              />
            ))}
          </div>
        </div>

        {/* ── Inspector ── */}
        {!preview && (
          <div className="w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4">
            {selected ? (
              <BlockInspector
                block={selected}
                courseId={id ?? ""}
                locales={meta.supported_locales}
                onChange={(props) => updateBlockProps(selected.id, props)}
                onGeom={(patch) => updateBlock(selected.id, patch)}
                onDelete={() => deleteBlock(selected.id)}
              />
            ) : (
              <SlideInspector
                slide={slide}
                onChange={updateSlide}
                meta={meta}
                assessment={assessment}
                onMeta={(m) => { setMeta(m); setSaveStatus("dirty"); }}
                onAssessment={(a) => { setAssessment(a); setSaveStatus("dirty"); }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// ─── Ribbon primitives ────────────────────────────────────────────────────────

function RibbonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center border-r border-slate-200 px-2 last:border-r-0">
      <div className="flex items-center gap-0.5">{children}</div>
      <span className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-600">{label}</span>
    </div>
  );
}
function RibbonBtn({ onClick, icon: Icon, title, label }: { onClick: () => void; icon: typeof Type; title: string; label?: string }) {
  return (
    <button onClick={onClick} title={title} className="flex flex-col items-center rounded px-1.5 py-1 text-slate-700 hover:bg-slate-200">
      <Icon className="h-4 w-4" />
      {label && <span className="text-[9px] leading-tight">{label}</span>}
    </button>
  );
}
function RibbonToggle({ onClick, icon: Icon, active }: { onClick: () => void; icon: typeof Type; active: boolean }) {
  return (
    <button onClick={onClick} className={`rounded p-1.5 ${active ? "bg-seafoam-500 text-white" : "text-slate-700 hover:bg-slate-200"}`}>
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

// ─── Block rendering ─────────────────────────────────────────────────────────

function BlockView({ block, selected, editing, preview, onSelect, onStartEdit, onEndEdit, onEditContent, onDragStart, onResizeStart }: {
  block: Block; selected: boolean; editing: boolean; preview: boolean;
  onSelect: () => void; onStartEdit: () => void; onEndEdit: () => void; onEditContent: (v: string) => void;
  onDragStart: (e: React.PointerEvent) => void; onResizeStart: (e: React.PointerEvent) => void;
}) {
  const textual = block.block_type === "text" || block.block_type === "heading";
  return (
    <div
      onPointerDown={preview || editing ? undefined : onDragStart}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onDoubleClick={(e) => { e.stopPropagation(); if (textual && !preview) onStartEdit(); }}
      className={`absolute ${preview || editing ? "" : "cursor-move"} ${selected ? "outline outline-2 outline-seafoam-500" : ""}`}
      style={{ left: `${block.x}%`, top: `${block.y}%`, width: `${block.width}%`, height: `${block.height}%`, zIndex: block.z_index }}
    >
      <BlockContent block={block} editing={editing} onEditContent={onEditContent} onEndEdit={onEndEdit} />
      {selected && !editing && (
        <div
          onPointerDown={onResizeStart}
          className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-full border-2 border-white bg-seafoam-500"
        />
      )}
    </div>
  );
}

function BlockContent({ block, editing, onEditContent, onEndEdit }: {
  block: Block; editing: boolean; onEditContent: (v: string) => void; onEndEdit: () => void;
}) {
  const p = block.props;
  const textStyle: React.CSSProperties = {
    fontSize: `${(p.size as number) ?? 18}px`,
    fontWeight: (p.weight as number) ?? 400,
    color: (p.color as string) ?? "#0f172a",
    textAlign: (p.align as "left") ?? "left",
    fontFamily: (p.font as string) ?? "Inter",
    fontStyle: p.italic ? "italic" : "normal",
    textDecoration: p.underline ? "underline" : "none",
    lineHeight: (p.lineHeight as number) ?? 1.3,
  };

  switch (block.block_type) {
    case "heading":
    case "text":
      return editing ? (
        <textarea
          autoFocus
          defaultValue={courseText(p.content)}
          onBlur={(e) => { onEditContent(e.target.value); onEndEdit(); }}
          onKeyDown={(e) => { if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur(); }}
          className="h-full w-full resize-none bg-transparent outline-none"
          style={textStyle}
        />
      ) : (
        <div className="h-full w-full overflow-hidden whitespace-pre-wrap" style={textStyle}>
          {courseText(p.content)}
        </div>
      );
    case "image":
      return (p.url as string) ? (
        <img src={p.url as string} alt={courseText(p.caption)} className="h-full w-full"
          style={{ objectFit: (p.fit as "cover") ?? "cover", borderRadius: `${(p.radius as number) ?? 12}px` }} />
      ) : (
        <div className="grid h-full w-full place-items-center bg-slate-100 text-xs text-slate-600" style={{ borderRadius: `${(p.radius as number) ?? 12}px` }}>
          <span className="flex flex-col items-center gap-1"><ImageIcon className="h-5 w-5" /> Image</span>
        </div>
      );
    case "video":
      return (
        <div className="grid h-full w-full place-items-center rounded-lg bg-slate-900 text-xs text-slate-300">
          <span className="flex flex-col items-center gap-1"><Video className="h-5 w-5" /> {p.streamId ? "Video set" : "No video"}</span>
        </div>
      );
    case "embed":
      return (
        <div className="grid h-full w-full place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-600">
          {p.url ? "Embedded content" : "Embed URL"}
        </div>
      );
    case "shape": {
      const isEllipse = p.shape === "ellipse";
      const isLine = p.shape === "line";
      if (isLine) return <div className="w-full" style={{ height: 0, borderTop: `${(p.border as number) || 3}px solid ${(p.fill as string) ?? "#2DD4BF"}`, marginTop: "50%" }} />;
      return (
        <div className="h-full w-full" style={{
          background: (p.fill as string) ?? "#2DD4BF",
          borderRadius: isEllipse ? "50%" : `${(p.radius as number) ?? 12}px`,
          border: (p.border as number) ? `${p.border}px solid ${(p.borderColor as string) ?? "#0f766e"}` : undefined,
          opacity: (p.opacity as number) ?? 1,
        }} />
      );
    }
    case "divider":
      return <div className="w-full" style={{ borderTop: `${(p.thickness as number) ?? 2}px solid ${(p.color as string) ?? "#cbd5e1"}`, marginTop: "50%" }} />;
    case "spacer":
      return <div className="h-full w-full" />;
    case "callout": {
      const st = COURSE_CALLOUT_STYLES[(p.variant as string) ?? "info"] ?? COURSE_CALLOUT_STYLES.info;
      return (
        <div className="h-full w-full overflow-hidden rounded-lg p-3" style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.text }}>
          <div className="text-sm font-semibold">{courseText(p.title) || "Note"}</div>
          <div className="mt-0.5 text-xs">{courseText(p.body)}</div>
        </div>
      );
    }
    case "button":
      return (
        <div className="grid h-full w-full place-items-center rounded-lg text-sm font-semibold text-white" style={{ background: (p.color as string) ?? "#14b8a6" }}>
          {courseText(p.label) || "Button"}
        </div>
      );
    case "checklist":
      return (
        <div className="h-full w-full overflow-hidden rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
          {courseChecklistItems(p.items).map((it, i) => (
            <div key={i} className="flex items-center gap-1.5 py-0.5"><CheckSquare className="h-3 w-3 text-slate-600" />{it}</div>
          ))}
        </div>
      );
    case "acknowledgment":
      return (
        <div className="flex h-full w-full items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          <CheckSquare className="h-4 w-4" />{courseText(p.statement) || "I acknowledge."}
        </div>
      );
    case "quiz": {
      const questions = Array.isArray(p.questions) ? (p.questions as Array<Record<string, unknown>>) : [];
      return (
        <div className="h-full w-full overflow-auto rounded-lg border-2 border-dashed border-violet-300 bg-violet-50 p-3 text-xs text-violet-700" style={courseStyleCss(p.style) as React.CSSProperties}>
          <div className="flex items-center gap-1.5 font-semibold"><HelpCircle className="h-4 w-4" /> Quiz · pass {(p.passingScore as number) ?? 80}%</div>
          {questions.map((q, i) => (
            <div key={i} className="mt-1.5">
              <div className="font-medium">{i + 1}. {courseText(q.question)}</div>
              {(Array.isArray(q.options) ? (q.options as Array<Record<string, unknown>>) : []).map((o, oi) => (
                <div key={oi} className={`ml-3 ${o.correct ? "font-semibold text-emerald-700" : ""}`}>• {courseText(o.text)}{o.correct ? " ✓" : ""}</div>
              ))}
            </div>
          ))}
        </div>
      );
    }
    case "true_false":
      return (
        <div className="h-full w-full overflow-hidden rounded-lg border border-slate-200 bg-white p-3 text-xs" style={courseStyleCss(p.style) as React.CSSProperties}>
          <div className="font-medium text-slate-800">{courseText(p.statement)}</div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <span className={`rounded-md border px-2 py-1 text-center font-semibold ${p.correct === true ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}`}>True{p.correct === true ? " ✓" : ""}</span>
            <span className={`rounded-md border px-2 py-1 text-center font-semibold ${p.correct === false ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}`}>False{p.correct === false ? " ✓" : ""}</span>
          </div>
        </div>
      );
    case "image_choice": {
      const options = Array.isArray(p.options) ? (p.options as Array<Record<string, unknown>>) : [];
      return (
        <div className="h-full w-full overflow-hidden rounded-lg border border-slate-200 bg-white p-2 text-xs" style={courseStyleCss(p.style) as React.CSSProperties}>
          <div className="font-medium text-slate-800">{courseText(p.question)}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {options.map((o, i) => (
              <div key={i} className={`relative overflow-hidden rounded border-2 ${o.correct ? "border-emerald-400" : "border-slate-200"}`}>
                {(o.url as string) ? <img src={o.url as string} alt="" className="aspect-video w-full object-cover" /> : <div className="grid aspect-video place-items-center bg-slate-100 text-slate-400"><ImageIcon className="h-4 w-4" /></div>}
                {courseText(o.label) && <span className="absolute bottom-0.5 left-0.5 rounded bg-slate-900/70 px-1 text-[9px] font-semibold text-white">{courseText(o.label)}{o.correct ? " ✓" : ""}</span>}
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "sort": {
      const cats = Array.isArray(p.categories) ? (p.categories as string[]) : [];
      const items = Array.isArray(p.items) ? (p.items as Array<Record<string, unknown>>) : [];
      return (
        <div className="h-full w-full overflow-auto rounded-lg border border-slate-200 bg-white p-2 text-[10px]" style={courseStyleCss(p.style) as React.CSSProperties}>
          <div className="text-xs font-medium text-slate-800">{courseText(p.prompt)}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {cats.map((cat) => (
              <div key={cat} className="rounded-lg border border-dashed border-slate-300 p-1.5">
                <div className="font-bold uppercase text-slate-500">{cat}</div>
                {items.filter((it) => it.category === cat).map((it, i) => (
                  <div key={i} className="mt-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-700">{courseText(it.label)}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "order": {
      const items = Array.isArray(p.items) ? (p.items as Array<Record<string, unknown>>) : [];
      const sorted = [...items].sort((a, b) => (Number(a.correctOrder) || 0) - (Number(b.correctOrder) || 0));
      return (
        <div className="h-full w-full overflow-auto rounded-lg border border-slate-200 bg-white p-2 text-xs" style={courseStyleCss(p.style) as React.CSSProperties}>
          <div className="font-medium text-slate-800">{courseText(p.prompt)}</div>
          {sorted.map((it, i) => (
            <div key={i} className="mt-1 flex items-center gap-1.5 rounded border border-slate-200 px-1.5 py-1">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[9px] font-bold">{i + 1}</span>
              <span className="text-slate-700">{courseText(it.label)}</span>
            </div>
          ))}
        </div>
      );
    }
    case "matching": {
      const pairs = Array.isArray(p.pairs) ? (p.pairs as Array<Record<string, unknown>>) : [];
      return (
        <div className="h-full w-full overflow-auto rounded-lg border border-slate-200 bg-white p-2 text-[10px]" style={courseStyleCss(p.style) as React.CSSProperties}>
          <div className="text-xs font-medium text-slate-800">{courseText(p.prompt)}</div>
          {pairs.map((pair, i) => (
            <div key={i} className="mt-1 grid grid-cols-2 gap-1">
              <div className="rounded border border-slate-200 px-1.5 py-1 text-slate-700">{courseText(pair.left)}</div>
              <div className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-slate-700">{courseText(pair.right)}</div>
            </div>
          ))}
        </div>
      );
    }
    case "hotspot": {
      const hotspots = Array.isArray(p.hotspots) ? (p.hotspots as Array<Record<string, unknown>>) : [];
      return (
        <div className="h-full w-full overflow-hidden rounded-lg border border-slate-200 bg-white p-2 text-xs" style={courseStyleCss(p.style) as React.CSSProperties}>
          <div className="font-medium text-slate-800">{courseText(p.prompt)}</div>
          <div className="relative mt-1.5">
            {(p.url as string) ? <img src={p.url as string} alt="" className="w-full rounded" /> : <div className="grid aspect-video w-full place-items-center rounded bg-slate-100 text-slate-400"><Crosshair className="h-5 w-5" /></div>}
            {hotspots.map((h, i) => (
              <div key={i}
                className={`absolute rounded border-2 ${h.correct ? "border-emerald-500 bg-emerald-300/20" : "border-slate-400 bg-slate-300/20"}`}
                style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${h.width}%`, height: `${h.height}%` }}
                title={courseText(h.label)} />
            ))}
          </div>
        </div>
      );
    }
    case "scenario": {
      const messages = Array.isArray(p.messages) ? (p.messages as Array<Record<string, unknown>>) : [];
      const choices = Array.isArray(p.choices) ? (p.choices as Array<Record<string, unknown>>) : [];
      return (
        <div className="h-full w-full overflow-auto rounded-lg border border-slate-200 bg-white p-2 text-[10px]" style={courseStyleCss(p.style) as React.CSSProperties}>
          {messages.map((m, i) => (
            <div key={i} className="mb-1">
              {courseText(m.speaker) && <div className="font-semibold uppercase text-slate-400">{courseText(m.speaker)}</div>}
              <div className="rounded-xl rounded-tl-sm bg-slate-100 px-2 py-1 text-slate-800">{courseText(m.text)}</div>
            </div>
          ))}
          {courseText(p.prompt) && <div className="mt-1 text-xs font-medium text-slate-800">{courseText(p.prompt)}</div>}
          {choices.map((ch, i) => (
            <div key={i} className={`mt-1 rounded-lg border px-1.5 py-1 ${ch.correct ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-700"}`}>
              {courseText(ch.text)}{ch.correct ? " ✓" : ""}
            </div>
          ))}
        </div>
      );
    }
    case "before_after":
      return (
        <div className="grid h-full w-full grid-cols-2 gap-1" style={courseStyleCss(p.style) as React.CSSProperties}>
          {([[p.beforeUrl, courseText(p.beforeLabel) || "Before"], [p.afterUrl, courseText(p.afterLabel) || "After"]] as Array<[unknown, string]>).map(([url, label], i) => (
            <div key={i} className="relative overflow-hidden rounded" >
              {(url as string) ? <img src={url as string} alt={label} className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center bg-slate-100 text-slate-400"><ImageIcon className="h-4 w-4" /></div>}
              <span className="absolute left-1 top-1 rounded bg-slate-900/70 px-1 text-[9px] font-semibold text-white">{label}</span>
            </div>
          ))}
        </div>
      );
    case "timeline": {
      const steps = Array.isArray(p.steps) ? (p.steps as Array<Record<string, unknown>>) : [];
      return (
        <div className="flex h-full w-full items-center gap-1 overflow-hidden rounded-lg bg-white p-2" style={courseStyleCss(p.style) as React.CSSProperties}>
          {steps.map((s, i) => (
            <div key={i} className="flex min-w-0 flex-1 flex-col items-center text-center">
              <div className="grid h-5 w-5 place-items-center rounded-full bg-seafoam-600 text-[9px] font-bold text-white">{i + 1}</div>
              <div className="mt-0.5 truncate text-[9px] font-semibold text-slate-800 w-full">{courseText(s.title)}</div>
            </div>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}

function ThumbBlock({ block }: { block: Block }) {
  const p = block.props;
  const common: React.CSSProperties = { left: `${block.x}%`, top: `${block.y}%`, width: `${block.width}%`, height: `${block.height}%`, position: "absolute" };
  if (block.block_type === "heading" || block.block_type === "text") {
    return <div style={{ ...common, color: (p.color as string) ?? "#0f172a", fontSize: 4, overflow: "hidden", fontWeight: (p.weight as number) ?? 400, textAlign: (p.align as "left") ?? "left" }}>{courseText(p.content)}</div>;
  }
  if (block.block_type === "shape") {
    return <div style={{ ...common, background: (p.fill as string) ?? "#2DD4BF", borderRadius: p.shape === "ellipse" ? "50%" : 2 }} />;
  }
  if (block.block_type === "divider") return <div style={{ ...common, borderTop: `1px solid ${(p.color as string) ?? "#cbd5e1"}` }} />;
  return <div style={{ ...common, background: "#e2e8f0", borderRadius: 2 }} />;
}

// ─── Inspectors ───────────────────────────────────────────────────────────────

// ─── Cloudflare Stream uploader ─────────────────────────────────────────────

type UploadState = "idle" | "requesting" | "uploading" | "polling" | "ready" | "error";

function StreamUploader({
  streamId,
  onChange,
}: {
  streamId: string;
  onChange: (props: Record<string, unknown>) => void;
}) {
  const { getToken } = useAuth();
  const [state, setState] = useState<UploadState>(streamId ? "ready" : "idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  useEffect(() => () => clearPoll(), []);

  async function pollStatus(id: string) {
    clearPoll();
    setState("polling");
    pollRef.current = setInterval(async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/admin/courses/stream/${id}/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const d = await res.json() as { ready: boolean; state: string; pctComplete?: string; thumbnail?: string };
        if (d.ready) {
          clearPoll();
          setState("ready");
          onChange({ streamId: id, thumbnail: d.thumbnail });
        } else if (d.state === "error") {
          clearPoll();
          setError("Stream processing failed.");
          setState("error");
        }
      } catch { /* retry on next tick */ }
    }, 4000);
  }

  async function handleFile(file: File) {
    setError("");
    setState("requesting");
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/courses/stream/upload-url`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ maxDurationSeconds: 3600 }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "Failed to get upload URL");
      const { streamId: newId, uploadUrl } = await res.json() as { streamId: string; uploadUrl: string };

      setState("uploading");
      setProgress(0);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => { if (xhr.status < 300) resolve(); else reject(new Error(`Upload failed: ${xhr.status}`)); };
        xhr.onerror = () => reject(new Error("Network error"));
        const fd = new FormData();
        fd.append("file", file);
        xhr.send(fd);
      });

      onChange({ streamId: newId });
      await pollStatus(newId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setState("error");
    }
  }

  if (state === "ready") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-emerald-800">Video ready</p>
            <p className="text-xs text-emerald-600 font-mono truncate">{streamId}</p>
          </div>
          <button
            type="button"
            onClick={() => { onChange({ streamId: "" }); setState("idle"); }}
            className="text-xs text-slate-600 hover:text-red-500"
          >Replace</button>
        </div>
        <a
          href={`https://iframe.videodelivery.net/${streamId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-seafoam-700 hover:underline"
        >Preview in Stream ↗</a>
      </div>
    );
  }

  if (state === "polling") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
        <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
        <p className="text-xs text-blue-700">Processing video… this may take a minute</p>
      </div>
    );
  }

  if (state === "uploading") {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Uploading to Stream…</span><span>{progress}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-seafoam-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {state === "requesting" && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Preparing upload…
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={state === "requesting"}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500 hover:border-seafoam-400 hover:text-seafoam-700 disabled:opacity-50 transition-colors"
      >
        <Upload className="h-4 w-4" />
        Upload video to Cloudflare Stream
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      {streamId && (
        <div className="text-xs text-slate-600">
          Current ID: <span className="font-mono">{streamId}</span>
          <button type="button" onClick={() => setState("ready")} className="ml-2 text-seafoam-500 hover:underline">view</button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-600">{label}</span>
      {children}
    </label>
  );
}
const inputCls = "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-seafoam-400";

function SlideInspector({ slide, onChange, meta, assessment, onMeta, onAssessment }: {
  slide: Slide;
  onChange: (p: Partial<Slide>) => void;
  meta: CourseMeta;
  assessment: Assessment;
  onMeta: (m: CourseMeta) => void;
  onAssessment: (a: Assessment) => void;
}) {
  const spanish = meta.supported_locales.includes("es");
  return (
    <div>
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4 text-seafoam-500" /> Slide</h3>
      <Field label="Title">
        <input className={inputCls} value={slide.title ?? ""} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      {spanish && (
        <Field label="Title (Español)">
          <input className={inputCls} value={slide.i18n?.es?.title ?? ""} placeholder={slide.title ?? ""}
            onChange={(e) => onChange({ i18n: { ...slide.i18n, es: { ...slide.i18n?.es, title: e.target.value } } })} />
        </Field>
      )}
      <Field label="Layout type">
        <select className={inputCls} value={slide.slide_type} onChange={(e) => onChange({ slide_type: e.target.value })}>
          <option value="content">Content</option>
          <option value="title">Title</option>
          <option value="section">Section</option>
          <option value="assessment">Assessment</option>
        </select>
      </Field>
      <Field label="Background color">
        <input type="color" className="h-9 w-full rounded border border-slate-300 bg-white"
          value={(slide.background.color as string) ?? "#ffffff"}
          onChange={(e) => onChange({ background: { ...slide.background, color: e.target.value } })} />
      </Field>
      <Field label="Completion rule">
        <select className={inputCls} value={(slide.completion_rule.type as string) ?? "viewed"}
          onChange={(e) => onChange({ completion_rule: { type: e.target.value } })}>
          <option value="viewed">Viewed</option>
          <option value="min_time">Minimum time</option>
          <option value="video_completed">Video completed</option>
          <option value="quiz_passed">Quiz passed</option>
          <option value="checklist_completed">Checklist completed</option>
          <option value="acknowledgment_signed">Acknowledgment signed</option>
        </select>
      </Field>

      {/* ── Course-level settings ── */}
      <div className="mt-5 border-t border-slate-200 pt-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Languages className="h-4 w-4 text-seafoam-500" /> Course</h3>
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={spanish}
            onChange={(e) =>
              onMeta({
                ...meta,
                supported_locales: e.target.checked
                  ? [...new Set([...meta.supported_locales, "es"])]
                  : meta.supported_locales.filter((l) => l !== "es"),
              })
            }
          />
          Offer in Español
        </label>
        {spanish && (
          <Field label="Course title (Español)">
            <input className={inputCls} value={meta.i18n?.es?.title ?? ""}
              onChange={(e) => onMeta({ ...meta, i18n: { ...meta.i18n, es: { ...meta.i18n?.es, title: e.target.value } } })} />
          </Field>
        )}

        <Field label="Passing score % (blank = not pass/fail)">
          <input type="number" min={1} max={100} className={inputCls}
            value={assessment.passingScorePct ?? ""}
            onChange={(e) => onAssessment({ ...assessment, passingScorePct: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>
        {assessment.passingScorePct != null && (
          <>
            <Field label="Max attempts (blank = unlimited)">
              <input type="number" min={1} className={inputCls}
                value={assessment.maxAttempts ?? ""}
                onChange={(e) => onAssessment({ ...assessment, maxAttempts: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            {([
              ["shuffleQuestions", "Shuffle assessment slides"],
              ["shuffleAnswers", "Shuffle answer options"],
              ["showScore", "Show score to learner"],
              ["showExplanations", "Show explanations"],
            ] as Array<[keyof Assessment, string]>).map(([key, label]) => (
              <label key={key} className="mb-1.5 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={key === "showScore" || key === "showExplanations" ? assessment[key] !== false : assessment[key] === true}
                  onChange={(e) => onAssessment({ ...assessment, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </>
        )}
      </div>

      <p className="mt-6 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
        Tip: double-click a text or heading block to edit it inline. Use arrow keys to nudge, ⌘D to duplicate, ⌫ to delete.
      </p>
    </div>
  );
}

// ─── R2 image uploader (sign-upload → PUT → public URL) ─────────────────────

function ImageUploader({ courseId, value, onUploaded }: {
  courseId: string;
  value: string;
  onUploaded: (url: string) => void;
}) {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError("");
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/storage/sign-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          purpose: "training_asset",
          scope: "training",
          refId: courseId,
        }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "Failed to sign upload");
      const { uploadUrl, publicUrl, requiredHeaders } = await res.json() as {
        uploadUrl: string; publicUrl: string; requiredHeaders: Record<string, string>;
      };
      const put = await fetch(uploadUrl, { method: "PUT", headers: requiredHeaders, body: file });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      onUploaded(publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      {value && <img src={value} alt="" className="max-h-24 w-full rounded border border-slate-200 object-cover" />}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500 hover:border-seafoam-400 hover:text-seafoam-700 disabled:opacity-50 transition-colors"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {value ? "Replace image" : "Upload image"}
      </button>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── Shared inspector sections ──────────────────────────────────────────────

function FeedbackFields({ p, onChange }: { p: Record<string, unknown>; onChange: (patch: Record<string, unknown>) => void }) {
  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Feedback</div>
      <Field label="When correct"><input className={inputCls} value={(p.correctFeedback as string) ?? ""} onChange={(e) => onChange({ correctFeedback: e.target.value })} /></Field>
      <Field label="When incorrect"><input className={inputCls} value={(p.incorrectFeedback as string) ?? ""} onChange={(e) => onChange({ incorrectFeedback: e.target.value })} /></Field>
      <Field label="Explanation"><textarea className={inputCls} rows={2} value={(p.explanation as string) ?? ""} onChange={(e) => onChange({ explanation: e.target.value })} /></Field>
      <label className="mb-1.5 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={p.allowRetry !== false} onChange={(e) => onChange({ allowRetry: e.target.checked })} /> Allow retry
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={p.mustPass === true} onChange={(e) => onChange({ mustPass: e.target.checked })} /> Must answer correctly to continue
      </label>
    </div>
  );
}

function StyleFields({ p, onChange }: { p: Record<string, unknown>; onChange: (patch: Record<string, unknown>) => void }) {
  const style = (p.style as Record<string, unknown>) ?? {};
  const set = (k: string, v: unknown) => onChange({ style: { ...style, [k]: v === "" || v === "none" ? undefined : v } });
  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Style</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Variant">
          <select className={inputCls} value={(style.variant as string) ?? "none"} onChange={(e) => set("variant", e.target.value)}>
            {COURSE_STYLE_VARIANTS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label="Icon">
          <select className={inputCls} value={(style.icon as string) ?? ""} onChange={(e) => set("icon", e.target.value)}>
            <option value="">none</option>
            {COURSE_ICONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label="Radius">
          <select className={inputCls} value={(style.radius as string) ?? ""} onChange={(e) => set("radius", e.target.value)}>
            <option value="">default</option>
            {COURSE_STYLE_RADII.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label="Padding">
          <select className={inputCls} value={(style.padding as string) ?? ""} onChange={(e) => set("padding", e.target.value)}>
            <option value="">default</option>
            {COURSE_STYLE_PADDINGS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}

/**
 * Spanish translations for every localizable prop of the block, driven by
 * the shared spec table — scalars get an input; object-array props get one
 * input per item text field (quiz options nested one level deeper).
 */
function TranslationFields({ block, onChange }: { block: Block; onChange: (patch: Record<string, unknown>) => void }) {
  const specs = courseLocalizableSpecs(block.block_type);
  if (specs.length === 0) return null;
  const p = block.props;
  const i18n = (p.i18n as Record<string, Record<string, unknown>>) ?? {};
  const es = i18n.es ?? {};
  const setKey = (key: string, value: unknown) => onChange({ i18n: { ...i18n, es: { ...es, [key]: value } } });

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <Languages className="h-3.5 w-3.5" /> Español
      </div>
      {specs.map((spec) => {
        const base = p[spec.key];
        if (spec.type === "string" && spec.localizable) {
          return (
            <Field key={spec.key} label={spec.key}>
              <input className={inputCls} value={(es[spec.key] as string) ?? ""} placeholder={courseText(base)}
                onChange={(e) => setKey(spec.key, e.target.value)} />
            </Field>
          );
        }
        if (spec.type === "string[]" && spec.localizable && Array.isArray(base)) {
          const overlay = Array.isArray(es[spec.key]) ? (es[spec.key] as string[]) : base.map(() => "");
          return (
            <Field key={spec.key} label={spec.key}>
              {base.map((item, i) => (
                <input key={i} className={`${inputCls} mb-1`} value={overlay[i] ?? ""} placeholder={courseText(item)}
                  onChange={(e) => {
                    const next = base.map((_, bi) => overlay[bi] ?? "");
                    next[i] = e.target.value;
                    setKey(spec.key, next);
                  }} />
              ))}
            </Field>
          );
        }
        if (spec.type === "object[]" && Array.isArray(base)) {
          const textFields = (spec.fields ?? []).filter((f) => f.localizable && f.type === "string");
          if (textFields.length === 0) return null;
          const overlay = Array.isArray(es[spec.key])
            ? (es[spec.key] as Array<Record<string, unknown>>)
            : base.map(() => ({} as Record<string, unknown>));
          const setItem = (i: number, fk: string, v: string) => {
            const next = base.map((_, bi) => ({ ...(overlay[bi] ?? {}) }));
            next[i] = { ...next[i], [fk]: v };
            setKey(spec.key, next);
          };
          return (
            <Field key={spec.key} label={spec.key}>
              {base.map((item, i) => (
                <div key={i} className="mb-1.5 rounded border border-slate-200 p-1.5">
                  {textFields.map((f) => (
                    <input key={f.key} className={`${inputCls} mb-1`}
                      value={((overlay[i] ?? ({} as Record<string, unknown>))[f.key] as string) ?? ""}
                      placeholder={courseText((item as Record<string, unknown>)[f.key])}
                      onChange={(e) => setItem(i, f.key, e.target.value)} />
                  ))}
                </div>
              ))}
            </Field>
          );
        }
        return null;
      })}
    </div>
  );
}

// ─── Per-type structured editors ─────────────────────────────────────────────

function rowsOf(p: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  return Array.isArray(p[key]) ? ([...(p[key] as Array<Record<string, unknown>>)]) : [];
}

function ListShell({ label, onAdd, children }: { label: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-600">{label}</span>
        <button onClick={onAdd} className="rounded p-0.5 text-seafoam-600 hover:bg-seafoam-50" title="Add"><Plus className="h-4 w-4" /></button>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function RowShell({ onDelete, children }: { onDelete: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1 space-y-1">{children}</div>
        <button onClick={onDelete} className="rounded p-1 text-rose-400 hover:bg-rose-50" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

const GRADEABLE_TYPES = new Set<BlockType>([
  "quiz", "true_false", "image_choice", "sort", "order", "matching", "hotspot", "scenario",
]);
const STYLEABLE_TYPES = new Set<BlockType>([
  "heading", "text", "image", "video", "embed", "callout", "quiz", "button",
  "checklist", "acknowledgment", "true_false", "image_choice", "sort", "order",
  "matching", "hotspot", "scenario", "before_after", "timeline",
]);

function BlockInspector({ block, courseId, locales, onChange, onGeom, onDelete }: {
  block: Block; courseId: string; locales: string[];
  onChange: (p: Record<string, unknown>) => void;
  onGeom: (p: Partial<Block>) => void; onDelete: () => void;
}) {
  const p = block.props;
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold capitalize">{block.block_type.replace(/_/g, " ")}</h3>
        <button onClick={onDelete} className="rounded p-1 text-rose-500 hover:bg-rose-50" title="Delete block">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {(block.block_type === "text" || block.block_type === "heading") && (
        <>
          <Field label="Content">
            <textarea className={inputCls} rows={3} value={courseText(p.content)} onChange={(e) => onChange({ content: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Size"><input type="number" className={inputCls} value={(p.size as number) ?? 18} onChange={(e) => onChange({ size: Number(e.target.value) })} /></Field>
            <Field label="Line height"><input type="number" step="0.1" className={inputCls} value={(p.lineHeight as number) ?? 1.3} onChange={(e) => onChange({ lineHeight: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Font">
            <select className={inputCls} value={(p.font as string) ?? "Inter"} onChange={(e) => onChange({ font: e.target.value })}>
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Color"><input type="color" className="h-9 w-full rounded border border-slate-300 bg-white" value={(p.color as string) ?? "#0f172a"} onChange={(e) => onChange({ color: e.target.value })} /></Field>
        </>
      )}

      {block.block_type === "image" && (
        <>
          <Field label="Image">
            <ImageUploader courseId={courseId} value={(p.url as string) ?? ""} onUploaded={(url) => onChange({ url })} />
          </Field>
          <Field label="Image URL"><input className={inputCls} value={(p.url as string) ?? ""} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://…" /></Field>
          <Field label="Alt text"><input className={inputCls} value={courseText(p.alt)} onChange={(e) => onChange({ alt: e.target.value })} /></Field>
          <Field label="Caption"><input className={inputCls} value={courseText(p.caption)} onChange={(e) => onChange({ caption: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Fit">
              <select className={inputCls} value={(p.fit as string) ?? "cover"} onChange={(e) => onChange({ fit: e.target.value })}>
                <option value="cover">Cover</option><option value="contain">Contain</option>
              </select>
            </Field>
            <Field label="Position">
              <select className={inputCls} value={(p.position as string) ?? "center"} onChange={(e) => onChange({ position: e.target.value })}>
                <option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option>
                <option value="left">Left</option><option value="right">Right</option>
              </select>
            </Field>
            <Field label="Radius"><input type="number" className={inputCls} value={(p.radius as number) ?? 12} onChange={(e) => onChange({ radius: Number(e.target.value) })} /></Field>
            <Field label="Link URL"><input className={inputCls} value={(p.href as string) ?? ""} onChange={(e) => onChange({ href: e.target.value })} placeholder="optional" /></Field>
          </div>
          <ListShell label="Annotations" onAdd={() => onChange({ annotations: [...rowsOf(p, "annotations"), { kind: "marker", x: 50, y: 50, n: rowsOf(p, "annotations").length + 1, label: "" }] })}>
            {rowsOf(p, "annotations").map((a, i) => {
              const setA = (patch: Record<string, unknown>) => {
                const next = rowsOf(p, "annotations");
                next[i] = { ...next[i], ...patch };
                onChange({ annotations: next });
              };
              return (
                <RowShell key={i} onDelete={() => onChange({ annotations: rowsOf(p, "annotations").filter((_, ai) => ai !== i) })}>
                  <div className="grid grid-cols-3 gap-1">
                    <select className={inputCls} value={(a.kind as string) ?? "marker"} onChange={(e) => setA({ kind: e.target.value })}>
                      <option value="marker">Marker</option><option value="box">Box</option><option value="arrow">Arrow</option>
                    </select>
                    <input type="number" className={inputCls} value={(a.x as number) ?? 0} onChange={(e) => setA({ x: Number(e.target.value) })} title="X %" />
                    <input type="number" className={inputCls} value={(a.y as number) ?? 0} onChange={(e) => setA({ y: Number(e.target.value) })} title="Y %" />
                  </div>
                  {a.kind === "box" && (
                    <div className="grid grid-cols-2 gap-1">
                      <input type="number" className={inputCls} value={(a.width as number) ?? 10} onChange={(e) => setA({ width: Number(e.target.value) })} title="W %" />
                      <input type="number" className={inputCls} value={(a.height as number) ?? 10} onChange={(e) => setA({ height: Number(e.target.value) })} title="H %" />
                    </div>
                  )}
                  <input className={inputCls} value={courseText(a.label)} placeholder="Label" onChange={(e) => setA({ label: e.target.value })} />
                </RowShell>
              );
            })}
          </ListShell>
        </>
      )}

      {block.block_type === "true_false" && (
        <>
          <Field label="Statement"><textarea className={inputCls} rows={2} value={courseText(p.statement)} onChange={(e) => onChange({ statement: e.target.value })} /></Field>
          <Field label="Correct answer">
            <select className={inputCls} value={String(p.correct ?? "true")} onChange={(e) => onChange({ correct: e.target.value === "true" })}>
              <option value="true">True</option><option value="false">False</option>
            </select>
          </Field>
        </>
      )}

      {block.block_type === "image_choice" && (
        <>
          <Field label="Question"><textarea className={inputCls} rows={2} value={courseText(p.question)} onChange={(e) => onChange({ question: e.target.value })} /></Field>
          <ListShell label="Image options" onAdd={() => onChange({ options: [...rowsOf(p, "options"), { url: "", label: String.fromCharCode(65 + rowsOf(p, "options").length), correct: false }] })}>
            {rowsOf(p, "options").map((o, i) => {
              const setO = (patch: Record<string, unknown>) => {
                const next = rowsOf(p, "options");
                next[i] = { ...next[i], ...patch };
                onChange({ options: next });
              };
              return (
                <RowShell key={i} onDelete={() => onChange({ options: rowsOf(p, "options").filter((_, oi) => oi !== i) })}>
                  <ImageUploader courseId={courseId} value={(o.url as string) ?? ""} onUploaded={(url) => setO({ url })} />
                  <div className="flex items-center gap-2">
                    <input className={inputCls} value={courseText(o.label)} placeholder="Label" onChange={(e) => setO({ label: e.target.value })} />
                    <label className="flex shrink-0 items-center gap-1 text-xs text-slate-600">
                      <input type="checkbox" checked={o.correct === true} onChange={(e) => setO({ correct: e.target.checked })} /> Correct
                    </label>
                  </div>
                </RowShell>
              );
            })}
          </ListShell>
        </>
      )}

      {block.block_type === "sort" && (
        <>
          <Field label="Prompt"><input className={inputCls} value={courseText(p.prompt)} onChange={(e) => onChange({ prompt: e.target.value })} /></Field>
          <Field label="Categories (one per line, 2–4)">
            <textarea className={inputCls} rows={2}
              value={(Array.isArray(p.categories) ? (p.categories as string[]) : []).join("\n")}
              onChange={(e) => onChange({ categories: e.target.value.split("\n").filter(Boolean) })} />
          </Field>
          <ListShell label="Items" onAdd={() => onChange({ items: [...rowsOf(p, "items"), { id: String(Date.now()), label: "", category: (Array.isArray(p.categories) ? (p.categories as string[]) : [])[0] ?? "" }] })}>
            {rowsOf(p, "items").map((it, i) => {
              const setI = (patch: Record<string, unknown>) => {
                const next = rowsOf(p, "items");
                next[i] = { ...next[i], ...patch };
                onChange({ items: next });
              };
              return (
                <RowShell key={i} onDelete={() => onChange({ items: rowsOf(p, "items").filter((_, ii) => ii !== i) })}>
                  <input className={inputCls} value={courseText(it.label)} placeholder="Item" onChange={(e) => setI({ label: e.target.value })} />
                  <select className={inputCls} value={(it.category as string) ?? ""} onChange={(e) => setI({ category: e.target.value })}>
                    {(Array.isArray(p.categories) ? (p.categories as string[]) : []).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </RowShell>
              );
            })}
          </ListShell>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={p.immediateFeedback === true} onChange={(e) => onChange({ immediateFeedback: e.target.checked })} /> Check automatically when all placed
          </label>
        </>
      )}

      {block.block_type === "order" && (
        <>
          <Field label="Prompt"><input className={inputCls} value={courseText(p.prompt)} onChange={(e) => onChange({ prompt: e.target.value })} /></Field>
          <ListShell label="Steps (in CORRECT order)" onAdd={() => onChange({ items: [...rowsOf(p, "items"), { id: String(Date.now()), label: "", correctOrder: rowsOf(p, "items").length + 1 }] })}>
            {[...rowsOf(p, "items")].sort((a, b) => (Number(a.correctOrder) || 0) - (Number(b.correctOrder) || 0)).map((it) => {
              const items = rowsOf(p, "items");
              const idx = items.findIndex((x) => x.id === it.id);
              const setI = (patch: Record<string, unknown>) => {
                const next = [...items];
                next[idx] = { ...next[idx], ...patch };
                onChange({ items: next });
              };
              return (
                <RowShell key={it.id as string} onDelete={() => onChange({ items: items.filter((x) => x.id !== it.id) })}>
                  <div className="flex items-center gap-1">
                    <input type="number" className={`${inputCls} w-14 shrink-0`} value={(it.correctOrder as number) ?? 1} onChange={(e) => setI({ correctOrder: Number(e.target.value) })} />
                    <input className={inputCls} value={courseText(it.label)} placeholder="Step" onChange={(e) => setI({ label: e.target.value })} />
                  </div>
                </RowShell>
              );
            })}
          </ListShell>
        </>
      )}

      {block.block_type === "matching" && (
        <>
          <Field label="Prompt"><input className={inputCls} value={courseText(p.prompt)} onChange={(e) => onChange({ prompt: e.target.value })} /></Field>
          <ListShell label="Pairs" onAdd={() => onChange({ pairs: [...rowsOf(p, "pairs"), { left: "", right: "" }] })}>
            {rowsOf(p, "pairs").map((pair, i) => {
              const setP = (patch: Record<string, unknown>) => {
                const next = rowsOf(p, "pairs");
                next[i] = { ...next[i], ...patch };
                onChange({ pairs: next });
              };
              return (
                <RowShell key={i} onDelete={() => onChange({ pairs: rowsOf(p, "pairs").filter((_, pi) => pi !== i) })}>
                  <input className={inputCls} value={courseText(pair.left)} placeholder="Left (situation)" onChange={(e) => setP({ left: e.target.value })} />
                  <input className={inputCls} value={courseText(pair.right)} placeholder="Right (match)" onChange={(e) => setP({ right: e.target.value })} />
                </RowShell>
              );
            })}
          </ListShell>
        </>
      )}

      {block.block_type === "hotspot" && (
        <>
          <Field label="Image">
            <ImageUploader courseId={courseId} value={(p.url as string) ?? ""} onUploaded={(url) => onChange({ url })} />
          </Field>
          <Field label="Prompt"><input className={inputCls} value={courseText(p.prompt)} onChange={(e) => onChange({ prompt: e.target.value })} /></Field>
          <ListShell label="Regions (% of image)" onAdd={() => onChange({ hotspots: [...rowsOf(p, "hotspots"), { x: 40, y: 40, width: 20, height: 15, correct: true, label: "" }] })}>
            {rowsOf(p, "hotspots").map((h, i) => {
              const setH = (patch: Record<string, unknown>) => {
                const next = rowsOf(p, "hotspots");
                next[i] = { ...next[i], ...patch };
                onChange({ hotspots: next });
              };
              return (
                <RowShell key={i} onDelete={() => onChange({ hotspots: rowsOf(p, "hotspots").filter((_, hi) => hi !== i) })}>
                  <div className="grid grid-cols-4 gap-1">
                    {(["x", "y", "width", "height"] as const).map((k) => (
                      <input key={k} type="number" className={inputCls} value={(h[k] as number) ?? 0} title={`${k} %`} onChange={(e) => setH({ [k]: Number(e.target.value) })} />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input className={inputCls} value={courseText(h.label)} placeholder="Label (shown when found)" onChange={(e) => setH({ label: e.target.value })} />
                    <label className="flex shrink-0 items-center gap-1 text-xs text-slate-600">
                      <input type="checkbox" checked={h.correct === true} onChange={(e) => setH({ correct: e.target.checked })} /> Find
                    </label>
                  </div>
                </RowShell>
              );
            })}
          </ListShell>
          <p className="mb-3 rounded bg-slate-50 p-2 text-[11px] text-slate-500">Regions are drawn on the canvas preview — adjust x/y/width/height until the outline covers the target.</p>
        </>
      )}

      {block.block_type === "scenario" && (
        <>
          <ListShell label="Messages" onAdd={() => onChange({ messages: [...rowsOf(p, "messages"), { speaker: "Customer", text: "" }] })}>
            {rowsOf(p, "messages").map((m, i) => {
              const setM = (patch: Record<string, unknown>) => {
                const next = rowsOf(p, "messages");
                next[i] = { ...next[i], ...patch };
                onChange({ messages: next });
              };
              return (
                <RowShell key={i} onDelete={() => onChange({ messages: rowsOf(p, "messages").filter((_, mi) => mi !== i) })}>
                  <input className={inputCls} value={courseText(m.speaker)} placeholder="Speaker" onChange={(e) => setM({ speaker: e.target.value })} />
                  <textarea className={inputCls} rows={2} value={courseText(m.text)} placeholder="Message" onChange={(e) => setM({ text: e.target.value })} />
                </RowShell>
              );
            })}
          </ListShell>
          <Field label="Prompt"><input className={inputCls} value={courseText(p.prompt)} onChange={(e) => onChange({ prompt: e.target.value })} /></Field>
          <ListShell label="Responses" onAdd={() => onChange({ choices: [...rowsOf(p, "choices"), { text: "", correct: false }] })}>
            {rowsOf(p, "choices").map((ch, i) => {
              const setC = (patch: Record<string, unknown>) => {
                const next = rowsOf(p, "choices");
                next[i] = { ...next[i], ...patch };
                onChange({ choices: next });
              };
              return (
                <RowShell key={i} onDelete={() => onChange({ choices: rowsOf(p, "choices").filter((_, ci) => ci !== i) })}>
                  <textarea className={inputCls} rows={2} value={courseText(ch.text)} placeholder="Response" onChange={(e) => setC({ text: e.target.value })} />
                  <div className="flex items-center gap-2">
                    <input className={inputCls} value={courseText(ch.feedback)} placeholder="Feedback for this choice" onChange={(e) => setC({ feedback: e.target.value })} />
                    <label className="flex shrink-0 items-center gap-1 text-xs text-slate-600">
                      <input type="checkbox" checked={ch.correct === true} onChange={(e) => setC({ correct: e.target.checked })} /> Correct
                    </label>
                  </div>
                </RowShell>
              );
            })}
          </ListShell>
        </>
      )}

      {block.block_type === "before_after" && (
        <>
          <Field label="Before image">
            <ImageUploader courseId={courseId} value={(p.beforeUrl as string) ?? ""} onUploaded={(url) => onChange({ beforeUrl: url })} />
          </Field>
          <Field label="After image">
            <ImageUploader courseId={courseId} value={(p.afterUrl as string) ?? ""} onUploaded={(url) => onChange({ afterUrl: url })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Before label"><input className={inputCls} value={courseText(p.beforeLabel)} onChange={(e) => onChange({ beforeLabel: e.target.value })} /></Field>
            <Field label="After label"><input className={inputCls} value={courseText(p.afterLabel)} onChange={(e) => onChange({ afterLabel: e.target.value })} /></Field>
          </div>
          <Field label="Mode">
            <select className={inputCls} value={(p.mode as string) ?? "slider"} onChange={(e) => onChange({ mode: e.target.value })}>
              <option value="slider">Slider</option><option value="side_by_side">Side by side</option>
            </select>
          </Field>
        </>
      )}

      {block.block_type === "timeline" && (
        <>
          <ListShell label="Steps" onAdd={() => onChange({ steps: [...rowsOf(p, "steps"), { title: "" }] })}>
            {rowsOf(p, "steps").map((s, i) => {
              const setS = (patch: Record<string, unknown>) => {
                const next = rowsOf(p, "steps");
                next[i] = { ...next[i], ...patch };
                onChange({ steps: next });
              };
              return (
                <RowShell key={i} onDelete={() => onChange({ steps: rowsOf(p, "steps").filter((_, si) => si !== i) })}>
                  <input className={inputCls} value={courseText(s.title)} placeholder="Title" onChange={(e) => setS({ title: e.target.value })} />
                  <input className={inputCls} value={courseText(s.description)} placeholder="Description (optional)" onChange={(e) => setS({ description: e.target.value })} />
                  <select className={inputCls} value={(s.icon as string) ?? ""} onChange={(e) => setS({ icon: e.target.value || undefined })}>
                    <option value="">no icon</option>
                    {COURSE_ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                  </select>
                </RowShell>
              );
            })}
          </ListShell>
          <Field label="Orientation">
            <select className={inputCls} value={(p.orientation as string) ?? "horizontal"} onChange={(e) => onChange({ orientation: e.target.value })}>
              <option value="horizontal">Horizontal</option><option value="vertical">Vertical</option>
            </select>
          </Field>
        </>
      )}

      {block.block_type === "shape" && (
        <>
          <Field label="Shape">
            <select className={inputCls} value={(p.shape as string) ?? "rect"} onChange={(e) => onChange({ shape: e.target.value })}>
              <option value="rect">Rectangle</option><option value="ellipse">Ellipse</option><option value="line">Line</option>
            </select>
          </Field>
          <Field label="Fill"><input type="color" className="h-9 w-full rounded border border-slate-300 bg-white" value={(p.fill as string) ?? "#2DD4BF"} onChange={(e) => onChange({ fill: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Border px"><input type="number" className={inputCls} value={(p.border as number) ?? 0} onChange={(e) => onChange({ border: Number(e.target.value) })} /></Field>
            <Field label="Radius"><input type="number" className={inputCls} value={(p.radius as number) ?? 12} onChange={(e) => onChange({ radius: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Border color"><input type="color" className="h-9 w-full rounded border border-slate-300 bg-white" value={(p.borderColor as string) ?? "#0f766e"} onChange={(e) => onChange({ borderColor: e.target.value })} /></Field>
        </>
      )}

      {block.block_type === "divider" && (
        <>
          <Field label="Color"><input type="color" className="h-9 w-full rounded border border-slate-300 bg-white" value={(p.color as string) ?? "#cbd5e1"} onChange={(e) => onChange({ color: e.target.value })} /></Field>
          <Field label="Thickness"><input type="number" className={inputCls} value={(p.thickness as number) ?? 2} onChange={(e) => onChange({ thickness: Number(e.target.value) })} /></Field>
        </>
      )}

      {block.block_type === "callout" && (
        <>
          <Field label="Variant">
            <select className={inputCls} value={(p.variant as string) ?? "info"} onChange={(e) => onChange({ variant: e.target.value })}>
              <option value="info">Info</option><option value="warning">Warning</option>
              <option value="success">Success</option><option value="tip">Tip</option>
            </select>
          </Field>
          <Field label="Title"><input className={inputCls} value={courseText(p.title)} onChange={(e) => onChange({ title: e.target.value })} /></Field>
          <Field label="Body"><textarea className={inputCls} rows={3} value={courseText(p.body)} onChange={(e) => onChange({ body: e.target.value })} /></Field>
        </>
      )}

      {block.block_type === "video" && (
        <>
          <Field label="Video">
            <StreamUploader
              streamId={(p.streamId as string) ?? ""}
              onChange={onChange}
            />
          </Field>
          <Field label="Required watch %"><input type="number" className={inputCls} value={(p.requireWatchPercent as number) ?? 95} onChange={(e) => onChange({ requireWatchPercent: Number(e.target.value) })} /></Field>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={Boolean(p.allowSkip)} onChange={(e) => onChange({ allowSkip: e.target.checked })} /> Allow skip
          </label>
        </>
      )}

      {block.block_type === "embed" && (
        <Field label="Embed URL"><input className={inputCls} value={(p.url as string) ?? ""} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://…" /></Field>
      )}

      {block.block_type === "button" && (
        <>
          <Field label="Label"><input className={inputCls} value={courseText(p.label)} onChange={(e) => onChange({ label: e.target.value })} /></Field>
          <Field label="Color"><input type="color" className="h-9 w-full rounded border border-slate-300 bg-white" value={(p.color as string) ?? "#14b8a6"} onChange={(e) => onChange({ color: e.target.value })} /></Field>
          <Field label="Action">
            <select className={inputCls} value={(p.action as string) ?? "next"} onChange={(e) => onChange({ action: e.target.value })}>
              <option value="next">Next slide</option><option value="prev">Previous slide</option>
              <option value="url">Open URL</option><option value="complete">Complete course</option>
            </select>
          </Field>
          {p.action === "url" && (
            <Field label="URL"><input className={inputCls} value={(p.url as string) ?? ""} onChange={(e) => onChange({ url: e.target.value })} /></Field>
          )}
        </>
      )}

      {block.block_type === "checklist" && (
        <Field label="Items (one per line)">
          <textarea className={inputCls} rows={5} value={courseChecklistItems(p.items).join("\n")}
            onChange={(e) => onChange({ items: e.target.value.split("\n").filter(Boolean) })} />
        </Field>
      )}

      {block.block_type === "acknowledgment" && (
        <>
          <Field label="Statement"><textarea className={inputCls} rows={3} value={courseText(p.statement)} onChange={(e) => onChange({ statement: e.target.value })} /></Field>
          <Field label="Method">
            <select className={inputCls} value={(p.method as string) ?? "checkbox"} onChange={(e) => onChange({ method: e.target.value })}>
              <option value="checkbox">Checkbox</option><option value="typed_name">Typed name</option>
              <option value="initials">Initials</option><option value="signature">Signature</option>
            </select>
          </Field>
        </>
      )}

      {block.block_type === "quiz" && (
        <>
          <Field label="Passing score % (this block)">
            <input type="number" className={inputCls} value={(p.passingScore as number) ?? 80} onChange={(e) => onChange({ passingScore: Number(e.target.value) })} />
          </Field>
          <ListShell label="Questions" onAdd={() => onChange({ questions: [...rowsOf(p, "questions"), { question: "", options: [{ text: "", correct: true }, { text: "", correct: false }] }] })}>
            {rowsOf(p, "questions").map((q, qi) => {
              const setQ = (patch: Record<string, unknown>) => {
                const next = rowsOf(p, "questions");
                next[qi] = { ...next[qi], ...patch };
                onChange({ questions: next });
              };
              const options = Array.isArray(q.options) ? ([...(q.options as Array<Record<string, unknown>>)]) : [];
              const setOption = (oi: number, patch: Record<string, unknown>) => {
                const nextOptions = [...options];
                nextOptions[oi] = { ...nextOptions[oi], ...patch };
                setQ({ options: nextOptions });
              };
              return (
                <RowShell key={qi} onDelete={() => onChange({ questions: rowsOf(p, "questions").filter((_, i) => i !== qi) })}>
                  <textarea className={inputCls} rows={2} value={courseText(q.question)} placeholder={`Question ${qi + 1}`} onChange={(e) => setQ({ question: e.target.value })} />
                  {options.map((o, oi) => (
                    <div key={oi} className="flex items-center gap-1.5">
                      <input className={inputCls} value={courseText(o.text)} placeholder={`Option ${oi + 1}`} onChange={(e) => setOption(oi, { text: e.target.value })} />
                      <label className="flex shrink-0 items-center gap-1 text-xs text-slate-600">
                        <input type="checkbox" checked={o.correct === true} onChange={(e) => setOption(oi, { correct: e.target.checked })} /> ✓
                      </label>
                      <button onClick={() => setQ({ options: options.filter((_, i) => i !== oi) })} className="rounded p-0.5 text-rose-400 hover:bg-rose-50"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <button onClick={() => setQ({ options: [...options, { text: "", correct: false }] })} className="text-xs text-seafoam-700 hover:underline">+ option</button>
                    <label className="flex items-center gap-1 text-xs text-slate-600">
                      <input type="checkbox" checked={q.multi === true} onChange={(e) => setQ({ multi: e.target.checked })} /> multi-select
                    </label>
                  </div>
                  <input className={inputCls} value={courseText(q.explanation)} placeholder="Explanation (optional)" onChange={(e) => setQ({ explanation: e.target.value })} />
                </RowShell>
              );
            })}
          </ListShell>
        </>
      )}

      {GRADEABLE_TYPES.has(block.block_type) && <FeedbackFields p={p} onChange={onChange} />}
      {STYLEABLE_TYPES.has(block.block_type) && <StyleFields p={p} onChange={onChange} />}
      {locales.includes("es") && <TranslationFields block={block} onChange={onChange} />}

      {/* Geometry */}
      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="X %"><input type="number" className={inputCls} value={Math.round(block.x)} onChange={(e) => onGeom({ x: Number(e.target.value) })} /></Field>
          <Field label="Y %"><input type="number" className={inputCls} value={Math.round(block.y)} onChange={(e) => onGeom({ y: Number(e.target.value) })} /></Field>
          <Field label="W %"><input type="number" className={inputCls} value={Math.round(block.width)} onChange={(e) => onGeom({ width: Number(e.target.value) })} /></Field>
          <Field label="H %"><input type="number" className={inputCls} value={Math.round(block.height)} onChange={(e) => onGeom({ height: Number(e.target.value) })} /></Field>
        </div>
      </div>
    </div>
  );
}
