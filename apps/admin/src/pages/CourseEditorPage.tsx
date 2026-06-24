import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  Undo2, Redo2, Plus, Type, Image as ImageIcon, Video, ListChecks,
  CheckSquare, MousePointerClick, HelpCircle, Eye, Send, ChevronLeft,
  Copy, Trash2, Save, Palette,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

// ─── Types ──────────────────────────────────────────────────────────────────

type BlockType =
  | "text" | "image" | "video" | "quiz" | "button" | "checklist" | "acknowledgment";

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

const BLOCK_DEFAULTS: Record<BlockType, Partial<Block>> = {
  text: { width: 84, height: 16, props: { content: "New text", size: 18, weight: 600, color: "#0f172a", align: "left" } },
  image: { width: 84, height: 40, props: { url: "", caption: "", fit: "cover" } },
  video: { width: 84, height: 40, props: { streamId: "", requireWatchPercent: 95, allowSkip: false } },
  quiz: { width: 84, height: 44, props: { passingScore: 80, questions: [] } },
  button: { width: 50, height: 10, props: { label: "Next", action: "next" } },
  checklist: { width: 84, height: 30, props: { items: ["First step", "Second step"] } },
  acknowledgment: { width: 84, height: 18, props: { statement: "I acknowledge this policy.", method: "checkbox" } },
};

const INSERT_ITEMS: { type: BlockType; label: string; icon: typeof Type }[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "video", label: "Video", icon: Video },
  { type: "quiz", label: "Quiz", icon: HelpCircle },
  { type: "button", label: "Button", icon: MousePointerClick },
  { type: "checklist", label: "Checklist", icon: ListChecks },
  { type: "acknowledgment", label: "Acknowledgment", icon: CheckSquare },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function CourseEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const [title, setTitle] = useState("");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [current, setCurrent] = useState(0);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "dirty">("saved");
  const [preview, setPreview] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

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
      slide_order: order, background: {}, completion_rule: { type: "viewed" }, blocks: [],
    };
  }

  // ── History-tracked mutation ──
  const commit = useCallback((next: Slide[]) => {
    history.current.push(slides);
    if (history.current.length > 50) history.current.shift();
    future.current = [];
    setSlides(next);
    setSaveStatus("dirty");
  }, [slides]);

  function undo() {
    const prev = history.current.pop();
    if (!prev) return;
    future.current.push(slides);
    setSlides(prev);
    setSaveStatus("dirty");
  }
  function redo() {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(slides);
    setSlides(next);
    setSaveStatus("dirty");
  }

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
    const def = BLOCK_DEFAULTS[type];
    const block: Block = {
      id: uid(), block_type: type, x: 8, y: 8, width: 84, height: 20,
      z_index: slide.blocks.length, props: {}, ...def,
    } as Block;
    updateSlide({ blocks: [...slide.blocks, block] });
    setSelectedBlock(block.id);
    setInsertOpen(false);
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

  // ── Slide ops ──
  function addSlide() {
    const next = [...slides, newSlide(slides.length)];
    commit(next);
    setCurrent(next.length - 1);
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

  // ── Drag / resize ──
  function startDrag(e: React.PointerEvent, block: Block, mode: "move" | "resize") {
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
          return { ...b, width: clamp(orig.w + dx, 8, 100 - b.x), height: clamp(orig.h + dy, 5, 100 - b.y) };
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
    return <div className="min-h-screen grid place-items-center bg-slate-900 text-slate-300">Loading editor…</div>;
  }

  const selected = slide.blocks.find((b) => b.id === selectedBlock) ?? null;

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-900 text-slate-100 select-none">
      {/* ── Top toolbar ── */}
      <div className="flex items-center gap-2 border-b border-slate-700 bg-slate-800 px-3 py-2">
        <button onClick={() => navigate("/courses")} className="rounded p-1.5 hover:bg-slate-700" title="Back to library">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); setSaveStatus("dirty"); }}
          className="bg-transparent text-sm font-semibold outline-none focus:bg-slate-700 rounded px-2 py-1 w-56"
        />
        <span className="text-xs text-slate-400 w-16">
          {saveStatus === "saving" ? "Saving…" : saveStatus === "dirty" ? "Unsaved" : "Saved"}
        </span>

        <div className="mx-2 h-5 w-px bg-slate-700" />
        <ToolbarBtn onClick={undo} icon={Undo2} label="Undo" />
        <ToolbarBtn onClick={redo} icon={Redo2} label="Redo" />
        <ToolbarBtn onClick={addSlide} icon={Plus} label="Add Slide" />

        <div className="relative">
          <button
            onClick={() => setInsertOpen((v) => !v)}
            className="flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium hover:bg-slate-700"
          >
            Insert
          </button>
          {insertOpen && (
            <div className="absolute z-30 mt-1 w-44 rounded-lg border border-slate-700 bg-slate-800 p-1 shadow-xl">
              {INSERT_ITEMS.map((it) => (
                <button
                  key={it.type}
                  onClick={() => addBlock(it.type)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-700"
                >
                  <it.icon className="h-3.5 w-3.5 text-seafoam-400" /> {it.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ToolbarBtn onClick={() => save()} icon={Save} label="Save" />
          <button
            onClick={() => setPreview((v) => !v)}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium ${preview ? "bg-seafoam-500 text-white" : "hover:bg-slate-700"}`}
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

      <div className="flex flex-1 overflow-hidden">
        {/* ── Slide rail ── */}
        <div className="w-44 shrink-0 overflow-y-auto border-r border-slate-700 bg-slate-800/40 p-2 space-y-2">
          {slides.map((s, i) => (
            <div key={s.id} className="group relative">
              <button
                onClick={() => { setCurrent(i); setSelectedBlock(null); }}
                className={`block w-full rounded-md border-2 p-1 text-left transition ${i === current ? "border-seafoam-400" : "border-slate-700 hover:border-slate-600"}`}
              >
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className="text-[10px] text-slate-400">{i + 1}</span>
                  <span className="text-[9px] uppercase text-slate-500">{s.slide_type}</span>
                </div>
                <div className="relative aspect-[9/16] overflow-hidden rounded bg-white">
                  {s.blocks.map((b) => (
                    <div key={b.id} className="absolute bg-seafoam-200/70"
                      style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.width}%`, height: `${b.height}%` }} />
                  ))}
                </div>
              </button>
              <div className="absolute right-1 top-5 hidden gap-1 group-hover:flex">
                <button onClick={() => duplicateSlide(i)} className="rounded bg-slate-700 p-1 hover:bg-slate-600" title="Duplicate">
                  <Copy className="h-3 w-3" />
                </button>
                {slides.length > 1 && (
                  <button onClick={() => deleteSlide(i)} className="rounded bg-slate-700 p-1 hover:bg-rose-600" title="Delete">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button onClick={addSlide} className="flex w-full items-center justify-center gap-1 rounded-md border-2 border-dashed border-slate-700 py-3 text-xs text-slate-400 hover:border-slate-500">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>

        {/* ── Canvas ── */}
        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-900 p-8"
          onClick={() => setSelectedBlock(null)}>
          <div
            ref={canvasRef}
            className="relative aspect-[9/16] h-[640px] max-h-full overflow-hidden rounded-2xl bg-white shadow-2xl"
            style={{ background: (slide.background.color as string) ?? "#ffffff" }}
          >
            {slide.blocks.map((b) => (
              <BlockView
                key={b.id}
                block={b}
                selected={!preview && b.id === selectedBlock}
                preview={preview}
                onSelect={() => setSelectedBlock(b.id)}
                onDragStart={(e) => startDrag(e, b, "move")}
                onResizeStart={(e) => startDrag(e, b, "resize")}
              />
            ))}
          </div>
        </div>

        {/* ── Inspector ── */}
        {!preview && (
          <div className="w-72 shrink-0 overflow-y-auto border-l border-slate-700 bg-slate-800 p-4">
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

function ToolbarBtn({ onClick, icon: Icon, label }: { onClick: () => void; icon: typeof Type; label: string }) {
  return (
    <button onClick={onClick} title={label} className="flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium hover:bg-slate-700">
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

// ─── Block rendering ─────────────────────────────────────────────────────────

function BlockView({ block, selected, preview, onSelect, onDragStart, onResizeStart }: {
  block: Block; selected: boolean; preview: boolean;
  onSelect: () => void; onDragStart: (e: React.PointerEvent) => void; onResizeStart: (e: React.PointerEvent) => void;
}) {
  const p = block.props;
  return (
    <div
      onPointerDown={preview ? undefined : onDragStart}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      className={`absolute ${preview ? "" : "cursor-move"} ${selected ? "outline outline-2 outline-seafoam-500" : ""}`}
      style={{ left: `${block.x}%`, top: `${block.y}%`, width: `${block.width}%`, height: `${block.height}%`, zIndex: block.z_index }}
    >
      <BlockContent block={block} p={p} />
      {selected && (
        <div
          onPointerDown={onResizeStart}
          className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-full border-2 border-white bg-seafoam-500"
        />
      )}
    </div>
  );
}

function BlockContent({ block, p }: { block: Block; p: Record<string, unknown> }) {
  switch (block.block_type) {
    case "text":
      return (
        <div className="h-full w-full overflow-hidden" style={{
          fontSize: `${(p.size as number) ?? 18}px`, fontWeight: (p.weight as number) ?? 600,
          color: (p.color as string) ?? "#0f172a", textAlign: (p.align as "left") ?? "left",
        }}>{(p.content as string) ?? ""}</div>
      );
    case "image":
      return p.url ? (
        <img src={p.url as string} alt={(p.caption as string) ?? ""} className="h-full w-full rounded-lg"
          style={{ objectFit: (p.fit as "cover") ?? "cover" }} />
      ) : (
        <div className="grid h-full w-full place-items-center rounded-lg bg-slate-100 text-xs text-slate-400">Image</div>
      );
    case "video":
      return (
        <div className="grid h-full w-full place-items-center rounded-lg bg-slate-900 text-xs text-slate-300">
          ▶ {p.streamId ? "Stream video" : "No video set"}
        </div>
      );
    case "quiz":
      return (
        <div className="h-full w-full rounded-lg border-2 border-dashed border-violet-300 bg-violet-50 p-2 text-xs text-violet-700">
          Quiz · {((p.questions as unknown[]) ?? []).length} questions · pass {(p.passingScore as number) ?? 80}%
        </div>
      );
    case "button":
      return (
        <div className="grid h-full w-full place-items-center rounded-lg bg-seafoam-500 text-sm font-semibold text-white">
          {(p.label as string) ?? "Button"}
        </div>
      );
    case "checklist":
      return (
        <div className="h-full w-full overflow-hidden rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
          {((p.items as string[]) ?? []).map((it, i) => (
            <div key={i} className="flex items-center gap-1.5"><span>☐</span>{it}</div>
          ))}
        </div>
      );
    case "acknowledgment":
      return (
        <div className="flex h-full w-full items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          <span>☐</span>{(p.statement as string) ?? "I acknowledge."}
        </div>
      );
    default:
      return null;
  }
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
const inputCls = "w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-seafoam-400";

function SlideInspector({ slide, onChange }: { slide: Slide; onChange: (p: Partial<Slide>) => void }) {
  return (
    <div>
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4 text-seafoam-400" /> Slide</h3>
      <Field label="Title">
        <input className={inputCls} value={slide.title ?? ""} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <Field label="Background color">
        <input type="color" className="h-9 w-full rounded border border-slate-600 bg-slate-900"
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
        <button onClick={onDelete} className="rounded p-1 text-rose-400 hover:bg-slate-700" title="Delete block">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {block.block_type === "text" && (
        <>
          <Field label="Content">
            <textarea className={inputCls} rows={3} value={(p.content as string) ?? ""} onChange={(e) => onChange({ content: e.target.value })} />
          </Field>
          <Field label="Size"><input type="number" className={inputCls} value={(p.size as number) ?? 18} onChange={(e) => onChange({ size: Number(e.target.value) })} /></Field>
          <Field label="Weight">
            <select className={inputCls} value={(p.weight as number) ?? 600} onChange={(e) => onChange({ weight: Number(e.target.value) })}>
              <option value={400}>Regular</option><option value={600}>Semibold</option><option value={700}>Bold</option>
            </select>
          </Field>
          <Field label="Color"><input type="color" className="h-9 w-full rounded border border-slate-600 bg-slate-900" value={(p.color as string) ?? "#0f172a"} onChange={(e) => onChange({ color: e.target.value })} /></Field>
          <Field label="Align">
            <select className={inputCls} value={(p.align as string) ?? "left"} onChange={(e) => onChange({ align: e.target.value })}>
              <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
            </select>
          </Field>
        </>
      )}

      {block.block_type === "image" && (
        <>
          <Field label="Image URL"><input className={inputCls} value={(p.url as string) ?? ""} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://…" /></Field>
          <Field label="Caption"><input className={inputCls} value={(p.caption as string) ?? ""} onChange={(e) => onChange({ caption: e.target.value })} /></Field>
          <Field label="Fit">
            <select className={inputCls} value={(p.fit as string) ?? "cover"} onChange={(e) => onChange({ fit: e.target.value })}>
              <option value="cover">Cover</option><option value="contain">Contain</option>
            </select>
          </Field>
        </>
      )}

      {block.block_type === "video" && (
        <>
          <Field label="Cloudflare Stream ID"><input className={inputCls} value={(p.streamId as string) ?? ""} onChange={(e) => onChange({ streamId: e.target.value })} /></Field>
          <Field label="Required watch %"><input type="number" className={inputCls} value={(p.requireWatchPercent as number) ?? 95} onChange={(e) => onChange({ requireWatchPercent: Number(e.target.value) })} /></Field>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={Boolean(p.allowSkip)} onChange={(e) => onChange({ allowSkip: e.target.checked })} /> Allow skip
          </label>
        </>
      )}

      {block.block_type === "button" && (
        <>
          <Field label="Label"><input className={inputCls} value={(p.label as string) ?? ""} onChange={(e) => onChange({ label: e.target.value })} /></Field>
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
      <div className="mt-4 border-t border-slate-700 pt-3">
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
