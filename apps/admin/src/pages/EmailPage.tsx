/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useState } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, Card, Button, Input, toast } from "@sweepr/ui";
import { Send, Newspaper, Pencil, Type, AlignLeft, Minus, Link2, Image as ImageIcon, List } from "lucide-react";
import { BroadcastsPage } from "./BroadcastsPage";
import { NewsletterPage } from "./NewsletterPage";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

// ─── Tab routing (query param, mirrors PricingPage) ─────────────────────────────

const TABS = [
  { id: "compose",    label: "Compose",    icon: Pencil },
  { id: "broadcasts", label: "Broadcasts", icon: Send },
  { id: "newsletter", label: "Newsletter", icon: Newspaper },
] as const;
type TabId = typeof TABS[number]["id"];

function useEmailTab(): [TabId, (t: TabId) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const active: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : "compose";
  return [
    active,
    (t) => {
      const params = new URLSearchParams(searchParams);
      if (t === "compose") params.delete("tab");
      else params.set("tab", t);
      setSearchParams(params, { replace: true });
    },
  ];
}

// ─── Sub-tab shell ─────────────────────────────────────────────────────────────

function SubTabs({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 mb-6 pb-0">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button key={id} onClick={() => onChange(id)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
            active === id
              ? "border-seafoam-500 text-seafoam-700 dark:text-seafoam-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
          }`}>
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Compose (one-off branded email builder) ────────────────────────────────────

type BlockType = "heading" | "text" | "card" | "divider" | "button" | "image";

interface Block {
  id: string;
  type: BlockType;
  content: string;
  meta?: Record<string, string>;
}

function uid() { return Math.random().toString(36).slice(2, 9); }

const BLOCK_BUTTONS: Array<{ type: BlockType; label: string; icon: React.ReactNode }> = [
  { type: "heading",  label: "Heading",   icon: <Type className="h-4 w-4" /> },
  { type: "text",     label: "Paragraph", icon: <AlignLeft className="h-4 w-4" /> },
  { type: "card",     label: "Info Card", icon: <List className="h-4 w-4" /> },
  { type: "divider",  label: "Divider",   icon: <Minus className="h-4 w-4" /> },
  { type: "button",   label: "Button",    icon: <Link2 className="h-4 w-4" /> },
  { type: "image",    label: "Image",     icon: <ImageIcon className="h-4 w-4" /> },
];

function buildHtml(subject: string, sectionLabel: string, blocks: Block[]): string {
  const blockHtml = blocks.map(b => {
    if (b.type === "heading") {
      return `<h1 style="margin:0 0 18px;font-size:28px;line-height:1.2;color:#1d2327;">${esc(b.content)}</h1>`;
    }
    if (b.type === "text") {
      return `<p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#4a5963;">${esc(b.content)}</p>`;
    }
    if (b.type === "card") {
      return `<div style="background:#f8fafb;border:1px solid #d8dde3;border-radius:12px;padding:18px;margin:26px 0;"><p style="margin:0;font-size:14px;line-height:1.75;color:#44515a;">${esc(b.content).replace(/\n/g, "<br />")}</p></div>`;
    }
    if (b.type === "divider") {
      return `<hr style="border:none;border-top:1px solid #e5e8eb;margin:30px 0;" />`;
    }
    if (b.type === "button") {
      const [label, url] = b.content.split("|");
      return `<div style="text-align:center;margin:24px 0;"><a href="${esc(url ?? "#")}" style="display:inline-block;background:#21c9a5;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;">${esc(label ?? "Click here")}</a></div>`;
    }
    if (b.type === "image") {
      return `<div style="margin:20px 0;text-align:center;"><img src="${esc(b.content)}" alt="" style="max-width:100%;border-radius:10px;border:0;" /></div>`;
    }
    return "";
  }).join("\n");

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f7f8;font-family:Arial,Helvetica,sans-serif;color:#1d2327;">
    <div style="max-width:660px;margin:0 auto;padding:32px 18px;">
      <div style="background:#ffffff;border:1px solid #d8dde3;border-radius:14px;overflow:hidden;">
        <div style="padding:28px 30px 12px;text-align:center;">
          <img src="https://objects.getsweepr.com/site_assets/public/Sweepr-logo.png" alt="Sweepr" width="240" style="display:block;margin:0 auto;width:100%;max-width:240px;height:auto;border:0;" />
        </div>
        <div style="padding:18px 34px 36px;">
          ${sectionLabel ? `<p style="margin:0 0 12px;color:#4d6572;font-weight:700;font-size:12px;letter-spacing:.12em;text-transform:uppercase;">${esc(sectionLabel)}</p>` : ""}
          ${blockHtml}
          <p style="margin:30px 0 0;font-size:12px;color:#8a959d;">
            Sweepr · <a href="{{unsubscribe_url}}" style="color:#8a959d;">Unsubscribe</a>
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function BlockEditor({ block, onChange, onRemove }: { block: Block; onChange: (b: Block) => void; onRemove: () => void }) {
  const isText = block.type === "text" || block.type === "card";
  return (
    <div className="group relative rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400">{block.type}</span>
        <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition">Remove</button>
      </div>
      {block.type === "divider" ? (
        <div className="border-t border-slate-300 my-2 dark:border-slate-600" />
      ) : block.type === "button" ? (
        <div className="flex gap-2">
          <input className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white" placeholder="Button label"
            value={block.content.split("|")[0] ?? ""} onChange={e => onChange({ ...block, content: `${e.target.value}|${block.content.split("|")[1] ?? ""}` })} />
          <input className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white" placeholder="URL (https://...)"
            value={block.content.split("|")[1] ?? ""} onChange={e => onChange({ ...block, content: `${block.content.split("|")[0] ?? ""}|${e.target.value}` })} />
        </div>
      ) : isText ? (
        <textarea rows={block.type === "card" ? 4 : 3}
          className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          placeholder={block.type === "card" ? "Key: Value\nKey: Value" : "Enter text…"}
          value={block.content} onChange={e => onChange({ ...block, content: e.target.value })} />
      ) : (
        <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          placeholder={block.type === "image" ? "Image URL (https://...)" : "Enter heading…"}
          value={block.content} onChange={e => onChange({ ...block, content: e.target.value })} />
      )}
    </div>
  );
}

function ComposeTab() {
  const { getToken } = useAuth();
  const [toEmail, setToEmail] = useState("");
  const [fromLabel, setFromLabel] = useState("Sweepr");
  const [subject, setSubject] = useState("");
  const [sectionLabel, setSectionLabel] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([
    { id: uid(), type: "heading", content: "" },
    { id: uid(), type: "text", content: "" },
  ]);
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);

  function addBlock(type: BlockType) {
    setBlocks(bs => [...bs, { id: uid(), type, content: "" }]);
  }

  function updateBlock(id: string, updated: Block) {
    setBlocks(bs => bs.map(b => b.id === id ? updated : b));
  }

  function removeBlock(id: string) {
    setBlocks(bs => bs.filter(b => b.id !== id));
  }

  const html = buildHtml(subject, sectionLabel, blocks);

  async function handleSend() {
    if (!toEmail || !subject) { toast.error("To and Subject are required."); return; }
    setSending(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: toEmail, from_label: fromLabel, subject, html }),
      });
      if (!res.ok) throw new Error("Send failed");
      toast.success("Email sent.");
      setToEmail(""); setSubject(""); setBlocks([{ id: uid(), type: "heading", content: "" }, { id: uid(), type: "text", content: "" }]);
    } catch {
      toast.error("Failed to send email.");
    } finally { setSending(false); }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Builder */}
      <div className="space-y-4">
        <Card className="p-5 space-y-4">
          <h3 className="text-sm font-semibold text-charcoal dark:text-white">Email details</h3>
          <Input label="To" type="email" value={toEmail} onChange={e => setToEmail(e.target.value)} placeholder="recipient@example.com" />
          <Input label="From label" value={fromLabel} onChange={e => setFromLabel(e.target.value)} placeholder="Sweepr" />
          <Input label="Subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Your subject line" />
          <Input label="Section label (optional)" value={sectionLabel} onChange={e => setSectionLabel(e.target.value)} placeholder="e.g. Product Update" />
        </Card>

        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-semibold text-charcoal dark:text-white">Content blocks</h3>
          <div className="space-y-2">
            {blocks.map(b => (
              <BlockEditor key={b.id} block={b} onChange={updated => updateBlock(b.id, updated)} onRemove={() => removeBlock(b.id)} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {BLOCK_BUTTONS.map(({ type, label, icon }) => (
              <button key={type} onClick={() => addBlock(type)}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:border-seafoam-400 hover:text-seafoam-700 dark:border-slate-600 dark:text-slate-400 transition">
                {icon} {label}
              </button>
            ))}
          </div>
        </Card>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setPreview(p => !p)} className="flex-1">
            {preview ? "Hide preview" : "Preview HTML"}
          </Button>
          <Button onClick={() => void handleSend()} disabled={sending} className="flex-1">
            {sending ? "Sending…" : "Send email"}
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div>
        {preview ? (
          <Card className="p-0 overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-500 dark:border-slate-700">Preview</div>
            <iframe
              srcDoc={html}
              className="w-full h-[700px] border-0"
              title="Email preview"
              sandbox="allow-same-origin"
            />
          </Card>
        ) : (
          <Card className="p-8 text-center text-slate-600 dark:text-slate-400">
            <Pencil className="mx-auto mb-3 h-8 w-8 opacity-30" />
            <p className="text-sm">Click "Preview HTML" to see a live render of your email.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Page root ─────────────────────────────────────────────────────────────────

export function EmailPage() {
  const [activeTab, setActiveTab] = useEmailTab();

  return (
    <DashboardShell title="Email" description="Compose one-off emails, send broadcasts, and manage the newsletter.">
      <SubTabs active={activeTab} onChange={setActiveTab} />
      {activeTab === "compose"    && <ComposeTab />}
      {activeTab === "broadcasts" && <BroadcastsPage embedded />}
      {activeTab === "newsletter" && <NewsletterPage embedded />}
    </DashboardShell>
  );
}
