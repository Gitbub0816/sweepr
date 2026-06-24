import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  Undo2, Redo2, Plus, Type, Heading, Image as ImageIcon, Video, ListChecks,
  CheckSquare, MousePointerClick, HelpCircle, Eye, Send, ChevronLeft,
  Copy, Trash2, Save, Palette, Square, Minus, MessageSquare,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  BringToFront, SendToBack, AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter, Layout,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

// ─── Types ──────────────────────────────────────────────────────────────────

type BlockType =
  | "text" | "heading" | "image" | "video" | "embed"
  | "shape" | "divider" | "spacer" | "callout"
  | "quiz" | "button" | "checklist" | "acknowledgment";

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
  blocks: Block[];
}

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `tmp-${Math.random().toString(36).slice(2)}`);

const FONTS = ["Inter", "Georgia", "Arial", "Times New Roman", "Courier New", "Verdana"];

const BLOCK_DEFAULTS: Record<BlockType, Partial<Block>> = {
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

const INSERT_GROUPS: { label: string; items: { type: BlockType; label: string; icon: typeof Type }[] }[] = [
  {
    label: "Content",
    items: [
      { type: "heading", label: "Heading", icon: Heading },
      { type: "text", label: "Text", icon: Type },
      { type: "image", label: "Image", icon: ImageIcon },
      { type: "video", label: "Video", icon: Video },
    ],
  },
  {
    label: "Layout",
    items: [
      { type: "shape", label: "Shape", icon: Square },
      { type: "divider", label: "Divider", icon: Minus },
      { type: "callout", label: "Callout", icon: MessageSquare },
    ],
  },
  {
    label: "Interactive",
    items: [
      { type: "quiz", label: "Quiz", icon: HelpCircle },
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
  const def = BLOCK_DEFAULTS[type];
  return {
    id: uid(), block_type: type, x: 8, y: 8, width: 40, height: 16, z_index: 0,
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
        const loaded: Slide[] = (data.slides ?? []).map((s: Slide) => ({
          ...s,
          background: s.background ?? {},
          completion_rule: s.completion_rule ?? { type: "viewed" },
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
      slide_order: order, background: { color: "#ffffff" }, completion_rule: { type: "viewed" }, blocks: [],
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
      slides: slides.map((s, i) => ({
        title: s.title, slide_type: s.slide_type, slide_order: i,
        background: s.background, completion_rule: s.completion_rule,
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
  }, [getToken, id, slides, title]);

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
        <span className="text-xs text-slate-400 w-16">
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
                    <span className="text-[10px] font-medium text-slate-400">{i + 1}</span>
                    <span className="text-[9px] uppercase text-slate-400">{s.slide_type}</span>
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
            <button onClick={() => addSlide()} className="flex w-full items-center justify-center gap-1 rounded-md border-2 border-dashed border-slate-300 py-3 text-xs text-slate-400 hover:border-slate-400">
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
                onChange={(props) => updateBlockProps(selected.id, props)}
                onGeom={(patch) => updateBlock(selected.id, patch)}
                onDelete={() => deleteBlock(selected.id)}
              />
            ) : (
              <SlideInspector slide={slide} onChange={updateSlide} />
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
      <span className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-400">{label}</span>
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

const CALLOUT_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  info: { bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af" },
  warning: { bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
  success: { bg: "#ecfdf5", border: "#a7f3d0", text: "#065f46" },
  tip: { bg: "#f5f3ff", border: "#ddd6fe", text: "#5b21b6" },
};

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
          defaultValue={(p.content as string) ?? ""}
          onBlur={(e) => { onEditContent(e.target.value); onEndEdit(); }}
          onKeyDown={(e) => { if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur(); }}
          className="h-full w-full resize-none bg-transparent outline-none"
          style={textStyle}
        />
      ) : (
        <div className="h-full w-full overflow-hidden whitespace-pre-wrap" style={textStyle}>
          {(p.content as string) ?? ""}
        </div>
      );
    case "image":
      return (p.url as string) ? (
        <img src={p.url as string} alt={(p.caption as string) ?? ""} className="h-full w-full"
          style={{ objectFit: (p.fit as "cover") ?? "cover", borderRadius: `${(p.radius as number) ?? 12}px` }} />
      ) : (
        <div className="grid h-full w-full place-items-center bg-slate-100 text-xs text-slate-400" style={{ borderRadius: `${(p.radius as number) ?? 12}px` }}>
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
        <div className="grid h-full w-full place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
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
      const st = CALLOUT_STYLES[(p.variant as string) ?? "info"] ?? CALLOUT_STYLES.info;
      return (
        <div className="h-full w-full overflow-hidden rounded-lg p-3" style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.text }}>
          <div className="text-sm font-semibold">{(p.title as string) ?? "Note"}</div>
          <div className="mt-0.5 text-xs">{(p.body as string) ?? ""}</div>
        </div>
      );
    }
    case "button":
      return (
        <div className="grid h-full w-full place-items-center rounded-lg text-sm font-semibold text-white" style={{ background: (p.color as string) ?? "#14b8a6" }}>
          {(p.label as string) ?? "Button"}
        </div>
      );
    case "checklist":
      return (
        <div className="h-full w-full overflow-hidden rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
          {((p.items as string[]) ?? []).map((it, i) => (
            <div key={i} className="flex items-center gap-1.5 py-0.5"><CheckSquare className="h-3 w-3 text-slate-400" />{it}</div>
          ))}
        </div>
      );
    case "acknowledgment":
      return (
        <div className="flex h-full w-full items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          <CheckSquare className="h-4 w-4" />{(p.statement as string) ?? "I acknowledge."}
        </div>
      );
    case "quiz":
      return (
        <div className="h-full w-full rounded-lg border-2 border-dashed border-violet-300 bg-violet-50 p-3 text-xs text-violet-700">
          <div className="flex items-center gap-1.5 font-semibold"><HelpCircle className="h-4 w-4" /> Quiz</div>
          <div className="mt-1">{((p.questions as unknown[]) ?? []).length} question(s) · pass {(p.passingScore as number) ?? 80}%</div>
        </div>
      );
    default:
      return null;
  }
}

function ThumbBlock({ block }: { block: Block }) {
  const p = block.props;
  const common: React.CSSProperties = { left: `${block.x}%`, top: `${block.y}%`, width: `${block.width}%`, height: `${block.height}%`, position: "absolute" };
  if (block.block_type === "heading" || block.block_type === "text") {
    return <div style={{ ...common, color: (p.color as string) ?? "#0f172a", fontSize: 4, overflow: "hidden", fontWeight: (p.weight as number) ?? 400, textAlign: (p.align as "left") ?? "left" }}>{(p.content as string) ?? ""}</div>;
  }
  if (block.block_type === "shape") {
    return <div style={{ ...common, background: (p.fill as string) ?? "#2DD4BF", borderRadius: p.shape === "ellipse" ? "50%" : 2 }} />;
  }
  if (block.block_type === "divider") return <div style={{ ...common, borderTop: `1px solid ${(p.color as string) ?? "#cbd5e1"}` }} />;
  return <div style={{ ...common, background: "#e2e8f0", borderRadius: 2 }} />;
}

// ─── Inspectors ───────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}
const inputCls = "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-seafoam-400";

function SlideInspector({ slide, onChange }: { slide: Slide; onChange: (p: Partial<Slide>) => void }) {
  return (
    <div>
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4 text-seafoam-500" /> Slide</h3>
      <Field label="Title">
        <input className={inputCls} value={slide.title ?? ""} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
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
      <p className="mt-6 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-400">
        Tip: double-click a text or heading block to edit it inline. Use arrow keys to nudge, ⌘D to duplicate, ⌫ to delete.
      </p>
    </div>
  );
}

function BlockInspector({ block, onChange, onGeom, onDelete }: {
  block: Block; onChange: (p: Record<string, unknown>) => void;
  onGeom: (p: Partial<Block>) => void; onDelete: () => void;
}) {
  const p = block.props;
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold capitalize">{block.block_type}</h3>
        <button onClick={onDelete} className="rounded p-1 text-rose-500 hover:bg-rose-50" title="Delete block">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {(block.block_type === "text" || block.block_type === "heading") && (
        <>
          <Field label="Content">
            <textarea className={inputCls} rows={3} value={(p.content as string) ?? ""} onChange={(e) => onChange({ content: e.target.value })} />
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
          <Field label="Image URL"><input className={inputCls} value={(p.url as string) ?? ""} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://…" /></Field>
          <Field label="Caption"><input className={inputCls} value={(p.caption as string) ?? ""} onChange={(e) => onChange({ caption: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Fit">
              <select className={inputCls} value={(p.fit as string) ?? "cover"} onChange={(e) => onChange({ fit: e.target.value })}>
                <option value="cover">Cover</option><option value="contain">Contain</option>
              </select>
            </Field>
            <Field label="Radius"><input type="number" className={inputCls} value={(p.radius as number) ?? 12} onChange={(e) => onChange({ radius: Number(e.target.value) })} /></Field>
          </div>
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
          <Field label="Title"><input className={inputCls} value={(p.title as string) ?? ""} onChange={(e) => onChange({ title: e.target.value })} /></Field>
          <Field label="Body"><textarea className={inputCls} rows={3} value={(p.body as string) ?? ""} onChange={(e) => onChange({ body: e.target.value })} /></Field>
        </>
      )}

      {block.block_type === "video" && (
        <>
          <Field label="Cloudflare Stream ID"><input className={inputCls} value={(p.streamId as string) ?? ""} onChange={(e) => onChange({ streamId: e.target.value })} /></Field>
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
          <Field label="Label"><input className={inputCls} value={(p.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} /></Field>
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
          <textarea className={inputCls} rows={5} value={((p.items as string[]) ?? []).join("\n")}
            onChange={(e) => onChange({ items: e.target.value.split("\n").filter(Boolean) })} />
        </Field>
      )}

      {block.block_type === "acknowledgment" && (
        <>
          <Field label="Statement"><textarea className={inputCls} rows={3} value={(p.statement as string) ?? ""} onChange={(e) => onChange({ statement: e.target.value })} /></Field>
          <Field label="Method">
            <select className={inputCls} value={(p.method as string) ?? "checkbox"} onChange={(e) => onChange({ method: e.target.value })}>
              <option value="checkbox">Checkbox</option><option value="typed_name">Typed name</option>
              <option value="initials">Initials</option><option value="signature">Signature</option>
            </select>
          </Field>
        </>
      )}

      {block.block_type === "quiz" && (
        <Field label="Passing score %">
          <input type="number" className={inputCls} value={(p.passingScore as number) ?? 80} onChange={(e) => onChange({ passingScore: Number(e.target.value) })} />
        </Field>
      )}

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
