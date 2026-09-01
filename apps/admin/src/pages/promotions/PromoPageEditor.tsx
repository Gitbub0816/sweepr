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
 * Editor for ONE page of a promotion: the mode switcher (blocks / canvas /
 * poster / code) plus whichever mode-specific content editor is active, and
 * the page's own multi-CTA list (PromoCtaEditor). Switching modes never
 * destroys the other modes' data — an admin can flip back and forth while
 * drafting without losing work, matching the promotion-level "new from
 * template" precedent of keeping unused fields around.
 *
 * Code mode's live preview renders through the SAME
 * `assemblePromoCodeSrcdoc` + `PROMO_CODE_IFRAME_SANDBOX` the real
 * `PromoWidget` uses (packages/ui/src/components/PromoWidget.tsx's
 * `CodeModeRender`), so what an admin previews here is exactly what a
 * customer's browser will render — see promoSandbox.ts's docblock for the
 * isolation model (`sandbox="allow-scripts"`, deliberately no
 * `allow-same-origin`).
 */

import { useState } from "react";
import { Card, Button, Input, Textarea, toast } from "@sweepr/ui";
import {
  PROMO_CODE_MAX_BYTES,
  promoCodeByteSize,
  PROMO_BLOCK_TYPES,
  assemblePromoCodeSrcdoc,
  PROMO_CODE_IFRAME_SANDBOX,
  type PromoPageV2,
  type PromoBlockV2,
  type PromoCodeV2,
  type PromoHotspotV2,
  type PromoCtaV2,
} from "@sweepr/utils";
import { Plus, GripVertical, Upload, Code2 } from "lucide-react";
import { PromoCanvasEditor } from "../../components/PromoCanvasEditor";
import { PromoCtaEditor, newCta } from "./PromoCtaEditor";

type PageRef = { key: string; name?: string };

const MODE_LABEL: Record<PromoPageV2["mode"], string> = {
  blocks: "Stacked blocks",
  canvas: "Free-form canvas",
  poster: "Poster image",
  code: "Custom code",
};

export function PromoPageEditor({
  page,
  pages,
  onChange,
  promoId,
  authed,
}: {
  page: PromoPageV2;
  pages: PageRef[];
  onChange: (page: PromoPageV2) => void;
  promoId: string;
  authed: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  function patch(p: Partial<PromoPageV2>) {
    onChange({ ...page, ...p });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">Page name (admin-facing)
            <Input value={page.name ?? ""} onChange={(e) => patch({ name: e.target.value })} className="mt-1" placeholder={page.key} />
          </label>
          <label className="text-xs">Content mode
            <select value={page.mode} onChange={(e) => patch({ mode: e.target.value as PromoPageV2["mode"] })}
              className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
              {(Object.keys(MODE_LABEL) as PromoPageV2["mode"][]).map((m) => (
                <option key={m} value={m}>{MODE_LABEL[m]}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">Theme (page override, blank = promotion default)
            <select value={page.theme ?? ""} onChange={(e) => patch({ theme: (e.target.value || undefined) as PromoPageV2["theme"] })}
              className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
              <option value="">Default</option><option value="light">Light</option><option value="dark">Dark</option><option value="brand">Brand</option>
            </select>
          </label>
          <label className="text-xs">Accent color (page override)
            <Input value={page.accent ?? ""} placeholder="#0f766e" onChange={(e) => patch({ accent: e.target.value || undefined })} className="mt-1" />
          </label>
        </div>
      </Card>

      {page.mode === "blocks" ? <BlocksEditor blocks={page.blocks ?? []} onChange={(blocks) => patch({ blocks })} /> : null}

      {page.mode === "canvas" ? (
        <Card className="space-y-3 p-4">
          <h3 className="font-semibold">Free-form canvas</h3>
          <PromoCanvasEditor
            promoId={promoId}
            canvas={page.canvas ?? { aspect: "4:5", background: "#ffffff", elements: [] }}
            onChange={(canvas) => patch({ canvas })}
            authed={authed}
            pages={pages}
          />
        </Card>
      ) : null}

      {page.mode === "poster" ? (
        <Card className="space-y-3 p-4">
          <h3 className="font-semibold">Poster image</h3>
          <PosterEditor
            promoId={promoId}
            poster={page.poster ?? { src: "", hotspots: [] }}
            onChange={(poster) => patch({ poster })}
            authed={authed}
            pages={pages}
          />
        </Card>
      ) : null}

      {page.mode === "code" ? (
        <CodeEditor code={page.code ?? { html: "", css: "", js: "" }} onChange={(code) => patch({ code })} />
      ) : null}

      <Card className="space-y-3 p-4">
        <h3 className="font-semibold">Buttons on this page</h3>
        <PromoCtaEditor ctas={page.ctas} onChange={(ctas) => patch({ ctas })} pages={pages} ownPageKey={page.key} />
      </Card>
    </div>
  );
}

// ─── Blocks mode ─────────────────────────────────────────────────────────────

function BlocksEditor({ blocks, onChange }: { blocks: PromoBlockV2[]; onChange: (b: PromoBlockV2[]) => void }) {
  function patchBlock(i: number, patch: Partial<PromoBlockV2>) {
    onChange(blocks.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function addBlock() {
    onChange([...blocks, { type: "text", text: "New text", align: "center" }]);
  }
  function removeBlock(i: number) {
    onChange(blocks.filter((_, idx) => idx !== i));
  }
  function moveBlock(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Content blocks</h3>
        <Button size="sm" variant="secondary" onClick={addBlock}><Plus className="mr-1 h-4 w-4" />Add block</Button>
      </div>
      <div className="space-y-2">
        {blocks.map((b, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <div className="mb-1.5 flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-slate-300" />
              <select value={b.type} onChange={(e) => patchBlock(i, { type: e.target.value as PromoBlockV2["type"] })}
                className="rounded-md border border-slate-200 bg-transparent px-1.5 py-1 text-xs dark:border-slate-700">
                {PROMO_BLOCK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={b.align ?? "left"} onChange={(e) => patchBlock(i, { align: e.target.value as PromoBlockV2["align"] })}
                className="rounded-md border border-slate-200 bg-transparent px-1.5 py-1 text-xs dark:border-slate-700">
                <option value="left">left</option><option value="center">center</option><option value="right">right</option>
              </select>
              {b.type === "heading" ? (
                <select value={b.size ?? "lg"} onChange={(e) => patchBlock(i, { size: e.target.value as PromoBlockV2["size"] })}
                  className="rounded-md border border-slate-200 bg-transparent px-1.5 py-1 text-xs dark:border-slate-700">
                  <option value="sm">sm</option><option value="md">md</option><option value="lg">lg</option><option value="xl">xl</option>
                </select>
              ) : null}
              <div className="ml-auto flex gap-1">
                <button onClick={() => moveBlock(i, -1)} className="px-1 text-slate-400 hover:text-slate-700">↑</button>
                <button onClick={() => moveBlock(i, 1)} className="px-1 text-slate-400 hover:text-slate-700">↓</button>
                <button onClick={() => removeBlock(i)} className="px-1 text-red-400 hover:text-red-600">✕</button>
              </div>
            </div>
            {b.type === "bullets" ? (
              <Textarea rows={3} value={(b.items ?? []).join("\n")} placeholder="One bullet per line"
                onChange={(e) => patchBlock(i, { items: e.target.value.split("\n").filter(Boolean) })} />
            ) : b.type === "image" ? (
              <Input value={b.src ?? ""} placeholder="https://objects.getsweepr.com/…" onChange={(e) => patchBlock(i, { src: e.target.value })} />
            ) : b.type === "divider" || b.type === "spacer" ? (
              <p className="text-xs text-slate-400">No content</p>
            ) : (
              <Textarea rows={2} value={b.text ?? ""} onChange={(e) => patchBlock(i, { text: e.target.value })} />
            )}
          </div>
        ))}
        {blocks.length === 0 ? <p className="text-xs text-slate-400">No blocks yet.</p> : null}
      </div>
    </Card>
  );
}

// ─── Code mode ───────────────────────────────────────────────────────────────

type CodeField = "html" | "css" | "js";
const CODE_FILE_EXT: Record<CodeField, string> = { html: ".html", css: ".css", js: ".js,.ts" };

function CodeEditor({ code, onChange }: { code: PromoCodeV2; onChange: (c: PromoCodeV2) => void }) {
  const [tab, setTab] = useState<CodeField>("html");
  const size = promoCodeByteSize(code);
  const overLimit = size > PROMO_CODE_MAX_BYTES;

  async function uploadInto(field: CodeField, file: File) {
    const text = await file.text();
    onChange({ ...code, [field]: text });
    toast.success(`Loaded ${file.name} into ${field.toUpperCase()}`);
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold"><Code2 className="h-4 w-4" />Custom code widget</h3>
        <span className={overLimit ? "text-xs font-semibold text-red-600" : "text-xs text-slate-400"}>
          {size.toLocaleString()} / {PROMO_CODE_MAX_BYTES.toLocaleString()} bytes
        </span>
      </div>
      <p className="text-xs text-slate-500">
        Upload or paste HTML, CSS, and JavaScript. It renders in a sandboxed iframe with no access to
        cookies, storage, or the parent page. This is the exact same assembly the live widget uses,
        so the preview is exactly what customers will see.
      </p>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {(["html", "css", "js"] as CodeField[]).map((f) => (
          <button key={f} onClick={() => setTab(f)}
            className={`border-b-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
              tab === f ? "border-seafoam-600 text-seafoam-700 dark:text-seafoam-400" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            {f}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-1 self-center rounded-lg border border-slate-200 px-2 py-1 text-xs hover:border-seafoam-400 dark:border-slate-700">
          <Upload className="h-3.5 w-3.5" />Upload {tab.toUpperCase()}
          <input type="file" accept={CODE_FILE_EXT[tab]} className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadInto(tab, f); }} />
        </label>
      </div>

      <Textarea
        rows={12}
        value={code[tab] ?? ""}
        onChange={(e) => onChange({ ...code, [tab]: e.target.value })}
        className="font-mono text-xs"
        placeholder={tab === "html" ? "<div>Your widget markup…</div>" : tab === "css" ? "/* styles, scoped to this widget's iframe */" : "// interactive behavior. Runs sandboxed, with no DOM access outside this widget."}
      />

      <div>
        <p className="mb-1 text-xs font-semibold uppercase text-slate-400">Live preview</p>
        <iframe
          title="Code widget preview"
          srcDoc={assemblePromoCodeSrcdoc(code)}
          sandbox={PROMO_CODE_IFRAME_SANDBOX}
          referrerPolicy="no-referrer"
          className="h-[360px] w-full rounded-lg border border-slate-200 dark:border-slate-700"
        />
      </div>
    </Card>
  );
}

// ─── Poster mode ─────────────────────────────────────────────────────────────

/**
 * Poster editor: upload the poster image (admin 'promo' storage scope → R2),
 * then drag on the preview to draw interactive hotspots. Each hotspot gets a
 * full `PromoCtaV2` (label + action + style + url/requireField/successMessage,
 * and — for `goto_page` — a target page), so a poster hotspot is exactly as
 * customizable as a page-level button. All geometry is stored as % of the
 * image so it scales with the widget.
 */
function PosterEditor({
  promoId,
  poster,
  onChange,
  authed,
  pages,
}: {
  promoId: string;
  poster: { src: string; hotspots?: PromoHotspotV2[] };
  onChange: (p: { src: string; hotspots?: PromoHotspotV2[] }) => void;
  authed: (path: string, init?: RequestInit) => Promise<Response>;
  pages: PageRef[];
}) {
  const [uploading, setUploading] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  async function upload(file: File) {
    setUploading(true);
    try {
      const sign = await authed("/storage/sign-upload", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          purpose: "promo_asset",
          scope: "promo",
          refId: promoId,
        }),
      });
      if (!sign.ok) { toast.error("Upload authorization failed"); return; }
      const { uploadUrl, publicUrl, requiredHeaders } = (await sign.json()) as {
        uploadUrl: string; publicUrl: string; requiredHeaders: Record<string, string>;
      };
      const put = await fetch(uploadUrl, { method: "PUT", headers: requiredHeaders, body: file });
      if (!put.ok) { toast.error("Upload failed"); return; }
      onChange({ ...poster, src: publicUrl });
      toast.success("Poster uploaded");
    } finally { setUploading(false); }
  }

  function pct(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function finishDraw() {
    if (drawRect && drawRect.w > 2 && drawRect.h > 2) {
      onChange({
        ...poster,
        hotspots: [...(poster.hotspots ?? []), { ...drawRect, cta: newCta("Claim offer") }],
      });
    }
    setDrawStart(null);
    setDrawRect(null);
  }

  const hotspots = poster.hotspots ?? [];
  function patchHotspotCta(i: number, patch: Partial<PromoCtaV2>) {
    onChange({
      ...poster,
      hotspots: hotspots.map((h, j) => (j === i ? { ...h, cta: { ...h.cta, ...patch } } : h)),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={poster.src} placeholder="https://objects.getsweepr.com/promos/…"
          onChange={(e) => onChange({ ...poster, src: e.target.value })} className="flex-1" />
        <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:border-seafoam-400 dark:border-slate-700">
          {uploading ? "Uploading…" : "Upload image"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
        </label>
      </div>

      {poster.src ? (
        <>
          <p className="text-xs text-slate-500">Drag on the image to draw a hotspot, then assign its button below.</p>
          <div
            className="relative select-none overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
            onMouseDown={(e) => { const p0 = pct(e); setDrawStart(p0); setDrawRect({ ...p0, w: 0, h: 0 }); }}
            onMouseMove={(e) => {
              if (!drawStart) return;
              const p1 = pct(e);
              setDrawRect({
                x: Math.min(drawStart.x, p1.x), y: Math.min(drawStart.y, p1.y),
                w: Math.abs(p1.x - drawStart.x), h: Math.abs(p1.y - drawStart.y),
              });
            }}
            onMouseUp={finishDraw}
            onMouseLeave={() => { if (drawStart) finishDraw(); }}
          >
            <img src={poster.src} alt="Poster" className="block w-full" draggable={false} />
            {hotspots.map((h, i) => (
              <div key={i}
                className="absolute flex items-center justify-center rounded border-2 border-seafoam-500 bg-seafoam-500/15 text-[10px] font-bold text-seafoam-700"
                style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${h.w}%`, height: `${h.h}%` }}>
                {i + 1}
              </div>
            ))}
            {drawRect ? (
              <div className="absolute rounded border-2 border-dashed border-amber-500 bg-amber-400/15"
                style={{ left: `${drawRect.x}%`, top: `${drawRect.y}%`, width: `${drawRect.w}%`, height: `${drawRect.h}%` }} />
            ) : null}
          </div>

          {hotspots.map((h, i) => (
            <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] items-end gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
              <span className="pb-1.5 text-xs font-bold text-seafoam-700">#{i + 1}</span>
              <label className="text-xs">Button label
                <Input value={h.cta.label} onChange={(e) => patchHotspotCta(i, { label: e.target.value })} className="mt-1" />
              </label>
              <label className="text-xs">Action
                <select value={h.cta.action} onChange={(e) => patchHotspotCta(i, { action: e.target.value as PromoCtaV2["action"] })}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                  <option value="claim">Claim (+ reward)</option>
                  <option value="newsletter">Newsletter (+ reward)</option>
                  <option value="waitlist">Waitlist (+ reward)</option>
                  <option value="book_now">Book now</option>
                  <option value="link">Open link</option>
                  <option value="goto_page">Go to another page</option>
                  <option value="dismiss">Dismiss</option>
                </select>
              </label>
              {h.cta.action === "goto_page" ? (
                <label className="text-xs">Target page
                  <select value={h.cta.targetPageKey ?? ""} onChange={(e) => patchHotspotCta(i, { targetPageKey: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700">
                    <option value="">Choose a page…</option>
                    {pages.map((p) => <option key={p.key} value={p.key}>{p.name ?? p.key}</option>)}
                  </select>
                </label>
              ) : (
                <label className="text-xs">URL (link / book now)
                  <Input value={h.cta.url ?? ""} onChange={(e) => patchHotspotCta(i, { url: e.target.value })} className="mt-1" />
                </label>
              )}
              <Button size="sm" variant="ghost" onClick={() => onChange({ ...poster, hotspots: hotspots.filter((_, j) => j !== i) })}>✕</Button>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
