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
 * PowerPoint-grade single-slide editor for promotions.
 *
 * Free-form canvas: text boxes, photos (uploaded to R2), shapes (rect/ellipse),
 * and CTA buttons — drag to move, corner-drag to resize, layer order (front/
 * back), rotation, colors, background color/image, and aspect presets. The
 * live widget renders the same data through CanvasRender, so what you design
 * here is exactly what visitors see.
 */

import { useCallback, useRef, useState } from "react";
import { Button, Input, Textarea, toast, type PromoCanvas, type CanvasElement, type PromoCTA, CANVAS_ASPECTS } from "@sweepr/ui";
import { Type, ImageIcon, Square, MousePointerClick, Circle, ArrowUp, ArrowDown, Trash2 } from "lucide-react";

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULTS: Record<CanvasElement["type"], Partial<CanvasElement>> = {
  text: { w: 60, h: 12, text: "Double-click to edit text", fontSize: 22, bold: true, color: "#111827", align: "center" },
  image: { w: 40, h: 30, fit: "cover", radius: 8 },
  shape: { w: 30, h: 18, shape: "rect", fill: "#0f766e", radius: 8 },
  button: { w: 44, h: 10, btnBg: "#0f766e", btnColor: "#ffffff", fontSize: 16, radius: 8 },
};

export function PromoCanvasEditor({
  promoId,
  canvas,
  onChange,
  authed,
}: {
  promoId: string;
  canvas: PromoCanvas;
  onChange: (c: PromoCanvas) => void;
  authed: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; orig: CanvasElement } | null>(null);

  const elements = canvas.elements ?? [];
  const selected = elements.find((e) => e.id === selectedId) ?? null;

  const patch = useCallback(
    (id: string, p: Partial<CanvasElement>) =>
      onChange({ ...canvas, elements: elements.map((e) => (e.id === id ? { ...e, ...p } : e)) }),
    [canvas, elements, onChange],
  );

  function add(type: CanvasElement["type"]) {
    const el: CanvasElement = {
      id: uid(), type, x: 20, y: 20,
      w: 40, h: 12,
      ...(type === "button" ? { cta: { label: "Claim offer", action: "claim", requireField: "none" } as PromoCTA } : {}),
      ...DEFAULTS[type],
    } as CanvasElement;
    onChange({ ...canvas, elements: [...elements, el] });
    setSelectedId(el.id);
  }

  function remove(id: string) {
    onChange({ ...canvas, elements: elements.filter((e) => e.id !== id) });
    setSelectedId(null);
  }

  function reorder(id: string, dir: 1 | -1) {
    const i = elements.findIndex((e) => e.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= elements.length) return;
    const next = [...elements];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...canvas, elements: next });
  }

  async function upload(file: File): Promise<string | null> {
    setUploading(true);
    try {
      const sign = await authed("/storage/sign-upload", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name, contentType: file.type, sizeBytes: file.size,
          purpose: "promo_asset", scope: "promo", refId: promoId,
        }),
      });
      if (!sign.ok) { toast.error("Upload authorization failed"); return null; }
      const { uploadUrl, publicUrl, requiredHeaders } = (await sign.json()) as {
        uploadUrl: string; publicUrl: string; requiredHeaders: Record<string, string>;
      };
      const put = await fetch(uploadUrl, { method: "PUT", headers: requiredHeaders, body: file });
      if (!put.ok) { toast.error("Upload failed"); return null; }
      return publicUrl;
    } finally { setUploading(false); }
  }

  // ── Drag / resize (pointer math in canvas %) ────────────────────────────────
  function pctDelta(e: React.MouseEvent) {
    const rect = boardRef.current!.getBoundingClientRect();
    const d = dragRef.current!;
    return {
      dx: ((e.clientX - d.startX) / rect.width) * 100,
      dy: ((e.clientY - d.startY) / rect.height) * 100,
    };
  }

  function onBoardMouseMove(e: React.MouseEvent) {
    const d = dragRef.current;
    if (!d) return;
    const { dx, dy } = pctDelta(e);
    if (d.mode === "move") {
      patch(d.id, {
        x: Math.max(0, Math.min(100 - d.orig.w, d.orig.x + dx)),
        y: Math.max(0, Math.min(100 - d.orig.h, d.orig.y + dy)),
      });
    } else {
      patch(d.id, {
        w: Math.max(4, Math.min(100 - d.orig.x, d.orig.w + dx)),
        h: Math.max(3, Math.min(100 - d.orig.y, d.orig.h + dy)),
      });
    }
  }

  const aspectPct = CANVAS_ASPECTS[canvas.aspect ?? "4:5"];
  const scale = 480 / 480; // editor board is rendered at ~480px wide

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_290px]">
      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => add("text")}><Type className="mr-1 h-4 w-4" />Text</Button>
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:border-seafoam-400 dark:border-slate-700">
            <ImageIcon className="mr-1 h-4 w-4" />{uploading ? "Uploading…" : "Photo"}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = "";
                if (!f) return;
                const url = await upload(f);
                if (url) {
                  const el: CanvasElement = { id: uid(), type: "image", x: 20, y: 20, ...DEFAULTS.image, src: url } as CanvasElement;
                  onChange({ ...canvas, elements: [...elements, el] });
                  setSelectedId(el.id);
                }
              }} />
          </label>
          <Button size="sm" variant="secondary" onClick={() => add("shape")}><Square className="mr-1 h-4 w-4" />Shape</Button>
          <Button size="sm" variant="secondary" onClick={() => add("button")}><MousePointerClick className="mr-1 h-4 w-4" />CTA Button</Button>
          <select value={canvas.aspect ?? "4:5"} onChange={(e) => onChange({ ...canvas, aspect: e.target.value as PromoCanvas["aspect"] })}
            className="rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-xs dark:border-slate-700">
            <option value="4:5">Portrait 4:5</option><option value="3:4">Portrait 3:4</option>
            <option value="1:1">Square</option><option value="16:9">Landscape 16:9</option>
          </select>
          <label className="flex items-center gap-1 text-xs">Bg
            <input type="color" value={canvas.background?.startsWith("#") ? canvas.background : "#ffffff"}
              onChange={(e) => onChange({ ...canvas, background: e.target.value })} className="h-7 w-9 cursor-pointer rounded" />
          </label>
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-200 px-2 py-1.5 text-xs hover:border-seafoam-400 dark:border-slate-700">
            Bg image
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = "";
                if (!f) return;
                const url = await upload(f);
                if (url) onChange({ ...canvas, backgroundImage: url });
              }} />
          </label>
          {canvas.backgroundImage ? (
            <button className="text-xs text-red-500 hover:underline" onClick={() => onChange({ ...canvas, backgroundImage: undefined })}>clear bg image</button>
          ) : null}
        </div>

        {/* Board */}
        <div
          ref={boardRef}
          className="relative w-full max-w-[480px] select-none overflow-hidden rounded-xl border-2 border-slate-300 shadow-inner dark:border-slate-600"
          style={{ paddingTop: `${aspectPct}%`, background: canvas.background ?? "#ffffff" }}
          onMouseMove={onBoardMouseMove}
          onMouseUp={() => (dragRef.current = null)}
          onMouseLeave={() => (dragRef.current = null)}
          onMouseDown={(e) => { if (e.target === boardRef.current) setSelectedId(null); }}
        >
          {canvas.backgroundImage ? (
            <img src={canvas.backgroundImage} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
          ) : null}
          {elements.map((el) => {
            const isSel = el.id === selectedId;
            const style: React.CSSProperties = {
              left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`,
              transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
              cursor: "move",
              outline: isSel ? "2px solid #0ea5e9" : undefined,
              outlineOffset: 1,
            };
            const startDrag = (ev: React.MouseEvent, mode: "move" | "resize") => {
              ev.stopPropagation();
              setSelectedId(el.id);
              dragRef.current = { id: el.id, mode, startX: ev.clientX, startY: ev.clientY, orig: { ...el } };
            };
            return (
              <div key={el.id} className="absolute" style={style} onMouseDown={(ev) => startDrag(ev, "move")}>
                {el.type === "text" ? (
                  <div className="flex h-full flex-col justify-center overflow-hidden whitespace-pre-wrap p-0.5"
                    style={{ fontSize: (el.fontSize ?? 18) * scale, fontWeight: el.bold ? 700 : 400, fontStyle: el.italic ? "italic" : undefined, color: el.color, textAlign: el.align, background: el.bg || undefined, lineHeight: 1.25 }}>
                    {el.text}
                  </div>
                ) : el.type === "image" && el.src ? (
                  <img src={el.src} alt="" className="h-full w-full" style={{ objectFit: el.fit ?? "cover", borderRadius: el.radius ?? 0 }} draggable={false} />
                ) : el.type === "shape" ? (
                  <div className="h-full w-full" style={{ background: el.fill, border: el.stroke ? `${el.strokeWidth ?? 2}px solid ${el.stroke}` : undefined, borderRadius: el.shape === "ellipse" ? "50%" : el.radius ?? 0 }} />
                ) : el.type === "button" ? (
                  <div className="flex h-full w-full items-center justify-center font-semibold" style={{ background: el.btnBg, color: el.btnColor, fontSize: el.fontSize ?? 16, borderRadius: el.radius ?? 8 }}>
                    {el.cta?.label ?? "Button"}
                  </div>
                ) : null}
                {isSel ? (
                  <div onMouseDown={(ev) => startDrag(ev, "resize")}
                    className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-white bg-sky-500" />
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-500">Click to select · drag to move · corner handle to resize. The right panel edits the selected element.</p>
      </div>

      {/* Properties panel */}
      <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        {selected ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold capitalize">{selected.type}</p>
              <div className="flex gap-1">
                <button title="Bring forward" onClick={() => reorder(selected.id, 1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowUp className="h-4 w-4" /></button>
                <button title="Send back" onClick={() => reorder(selected.id, -1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowDown className="h-4 w-4" /></button>
                <button title="Delete" onClick={() => remove(selected.id)} className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>

            <label className="block text-xs">Rotation ({selected.rotation ?? 0}°)
              <input type="range" min={-180} max={180} value={selected.rotation ?? 0}
                onChange={(e) => patch(selected.id, { rotation: Number(e.target.value) })} className="mt-1 w-full" />
            </label>

            {selected.type === "text" ? (
              <>
                <label className="block text-xs">Text
                  <Textarea rows={3} value={selected.text ?? ""} onChange={(e) => patch(selected.id, { text: e.target.value })} className="mt-1" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs">Size
                    <Input type="number" min={8} max={96} value={selected.fontSize ?? 18} onChange={(e) => patch(selected.id, { fontSize: Number(e.target.value) })} className="mt-1" />
                  </label>
                  <label className="text-xs">Color
                    <input type="color" value={selected.color ?? "#111827"} onChange={(e) => patch(selected.id, { color: e.target.value })} className="mt-1 h-9 w-full cursor-pointer rounded" />
                  </label>
                  <label className="text-xs">Align
                    <select value={selected.align ?? "left"} onChange={(e) => patch(selected.id, { align: e.target.value as CanvasElement["align"] })}
                      className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                      <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                    </select>
                  </label>
                  <div className="flex items-end gap-2 pb-1">
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={selected.bold ?? false} onChange={(e) => patch(selected.id, { bold: e.target.checked })} />B</label>
                    <label className="flex items-center gap-1 text-xs italic"><input type="checkbox" checked={selected.italic ?? false} onChange={(e) => patch(selected.id, { italic: e.target.checked })} />I</label>
                  </div>
                </div>
              </>
            ) : null}

            {selected.type === "image" ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs">Fit
                  <select value={selected.fit ?? "cover"} onChange={(e) => patch(selected.id, { fit: e.target.value as CanvasElement["fit"] })}
                    className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                    <option value="cover">Cover (fill)</option><option value="contain">Contain (fit)</option>
                  </select>
                </label>
                <label className="text-xs">Corner radius
                  <Input type="number" min={0} value={selected.radius ?? 0} onChange={(e) => patch(selected.id, { radius: Number(e.target.value) })} className="mt-1" />
                </label>
              </div>
            ) : null}

            {selected.type === "shape" ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs">Shape
                  <select value={selected.shape ?? "rect"} onChange={(e) => patch(selected.id, { shape: e.target.value as CanvasElement["shape"] })}
                    className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                    <option value="rect">Rectangle</option><option value="ellipse">Ellipse</option>
                  </select>
                </label>
                <label className="text-xs">Fill
                  <input type="color" value={selected.fill ?? "#0f766e"} onChange={(e) => patch(selected.id, { fill: e.target.value })} className="mt-1 h-9 w-full cursor-pointer rounded" />
                </label>
                <label className="text-xs">Border color
                  <input type="color" value={selected.stroke ?? "#000000"} onChange={(e) => patch(selected.id, { stroke: e.target.value })} className="mt-1 h-9 w-full cursor-pointer rounded" />
                </label>
                <label className="text-xs">Border width
                  <Input type="number" min={0} value={selected.strokeWidth ?? 0} onChange={(e) => patch(selected.id, { strokeWidth: Number(e.target.value) })} className="mt-1" />
                </label>
                {selected.shape === "rect" ? (
                  <label className="text-xs">Corner radius
                    <Input type="number" min={0} value={selected.radius ?? 0} onChange={(e) => patch(selected.id, { radius: Number(e.target.value) })} className="mt-1" />
                  </label>
                ) : null}
              </div>
            ) : null}

            {selected.type === "button" && selected.cta ? (
              <div className="space-y-2">
                <label className="block text-xs">Label
                  <Input value={selected.cta.label} onChange={(e) => patch(selected.id, { cta: { ...selected.cta!, label: e.target.value } })} className="mt-1" />
                </label>
                <label className="block text-xs">Action
                  <select value={selected.cta.action} onChange={(e) => patch(selected.id, { cta: { ...selected.cta!, action: e.target.value as PromoCTA["action"] } })}
                    className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                    <option value="claim">Claim (+ reward)</option>
                    <option value="newsletter">Newsletter (+ reward)</option>
                    <option value="waitlist">Waitlist (+ reward)</option>
                    <option value="book_now">Book now</option>
                    <option value="link">Open link</option>
                    <option value="dismiss">Dismiss</option>
                  </select>
                </label>
                {selected.cta.action === "link" || selected.cta.action === "book_now" ? (
                  <label className="block text-xs">URL
                    <Input value={selected.cta.url ?? ""} onChange={(e) => patch(selected.id, { cta: { ...selected.cta!, url: e.target.value } })} className="mt-1" />
                  </label>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs">Button color
                    <input type="color" value={selected.btnBg ?? "#0f766e"} onChange={(e) => patch(selected.id, { btnBg: e.target.value })} className="mt-1 h-9 w-full cursor-pointer rounded" />
                  </label>
                  <label className="text-xs">Text color
                    <input type="color" value={selected.btnColor ?? "#ffffff"} onChange={(e) => patch(selected.id, { btnColor: e.target.value })} className="mt-1 h-9 w-full cursor-pointer rounded" />
                  </label>
                  <label className="text-xs">Font size
                    <Input type="number" min={10} max={40} value={selected.fontSize ?? 16} onChange={(e) => patch(selected.id, { fontSize: Number(e.target.value) })} className="mt-1" />
                  </label>
                  <label className="text-xs">Radius
                    <Input type="number" min={0} value={selected.radius ?? 8} onChange={(e) => patch(selected.id, { radius: Number(e.target.value) })} className="mt-1" />
                  </label>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-1 text-center text-xs text-slate-400">
            <Circle className="h-5 w-5" />
            <p>Select an element on the slide,<br />or add one from the toolbar.</p>
          </div>
        )}
      </div>
    </div>
  );
}
