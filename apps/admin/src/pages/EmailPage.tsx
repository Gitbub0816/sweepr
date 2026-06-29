import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, Card, Button, Input, toast } from "@sweepr/ui";
import { Send, Newspaper, Pencil, Inbox, ChevronRight, Users, Building2, Globe, Sparkles, Megaphone, Wrench, Star, Tag, AlertCircle, Upload, Image as ImageIcon, Type, AlignLeft, Minus, Bold, Italic, Link2, List } from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

// ─── Tab routing ──────────────────────────────────────────────────────────────

const TABS = [
  { id: "compose",    label: "Compose",    icon: Pencil },
  { id: "broadcasts", label: "Broadcasts", icon: Send },
  { id: "newsletter", label: "Newsletter", icon: Newspaper },
  { id: "inbox",      label: "Inbox",      icon: Inbox },
] as const;
type TabId = typeof TABS[number]["id"];

function useEmailTab(): [TabId, (t: TabId) => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const hash = location.hash.replace("#", "") as TabId;
  const active: TabId = TABS.some(t => t.id === hash) ? hash : "compose";
  return [active, (t) => navigate({ hash: t })];
}

// ─── Sub-tab shell ─────────────────────────────────────────────────────────────

function SubTabs({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 mb-6 pb-0">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button key={id} onClick={() => onChange(id)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
            active === id
              ? "border-seafoam-500 text-seafoam-600 dark:text-seafoam-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
          }`}>
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Compose (email builder) ──────────────────────────────────────────────────

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
          <img src="https://raw.githubusercontent.com/Gitbub0816/sweepr/main/packages/ui/src/assets/Sweepr-logo.png" alt="Sweepr" width="240" style="display:block;margin:0 auto;width:100%;max-width:240px;height:auto;border:0;" />
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
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{block.type}</span>
        <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition">Remove</button>
      </div>
      {block.type === "divider" ? (
        <div className="border-t border-slate-300 my-2" />
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
      toast.success("Email sent!");
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
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:border-seafoam-400 hover:text-seafoam-600 dark:border-slate-600 dark:text-slate-400 transition">
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
          <Card className="p-8 text-center text-slate-400">
            <Pencil className="mx-auto mb-3 h-8 w-8 opacity-30" />
            <p className="text-sm">Click "Preview HTML" to see a live render of your email.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Broadcasts tab ────────────────────────────────────────────────────────────

type BroadcastCategory = "announcement" | "launch" | "feature" | "area" | "offer" | "operational";

const BROADCAST_CATEGORIES: Array<{
  value: BroadcastCategory;
  label: string;
  icon: React.ReactNode;
  description: string;
  tone: string;
}> = [
  {
    value: "announcement",
    label: "Announcement",
    icon: <Megaphone className="h-4 w-4" />,
    description: "General news — a big scrub's worth of info",
    tone: "We're thrilled to share something fresh off the mop…",
  },
  {
    value: "launch",
    label: "Launch update",
    icon: <Sparkles className="h-4 w-4" />,
    description: "We're live! Area opening, app milestone",
    tone: "Grab your bucket — we're officially open for business in…",
  },
  {
    value: "feature",
    label: "Feature update",
    icon: <Star className="h-4 w-4" />,
    description: "New product or app feature — shiny and clean",
    tone: "Something squeaky-new just dropped in the app…",
  },
  {
    value: "area",
    label: "New service area",
    icon: <Globe className="h-4 w-4" />,
    description: "New city or coverage expansion",
    tone: "Sweepr is sweeping into a new neighborhood…",
  },
  {
    value: "offer",
    label: "Promo / offer",
    icon: <Tag className="h-4 w-4" />,
    description: "Deal, discount, or referral — clean price",
    tone: "Dirt-cheap deal (pun intended) just for you…",
  },
  {
    value: "operational",
    label: "Operational notice",
    icon: <Wrench className="h-4 w-4" />,
    description: "Maintenance, service notice — boring but necessary",
    tone: "We're doing a quick dusting of our systems…",
  },
];

type Audience = "newsletter" | "waitlist_customer" | "waitlist_cleaner" | "city" | "all";

const AUDIENCE_LABELS: Record<Audience, string> = {
  newsletter: "Newsletter subscribers",
  waitlist_customer: "Waitlist — customers",
  waitlist_cleaner: "Waitlist — cleaners",
  city: "City update subscribers",
  all: "All lists (deduplicated)",
};

interface BroadcastSend {
  id: string;
  audience: string;
  broadcast_type: string;
  area_slug: string | null;
  subject: string;
  sent_count: number;
  sent_by: string;
  created_at: string;
}

function BroadcastsTab() {
  const { getToken } = useAuth();
  const [tab, setTab] = useState<"compose" | "history">("compose");
  const [category, setCategory] = useState<BroadcastCategory>("announcement");
  const [audience, setAudience] = useState<Audience>("newsletter");
  const [areaSlug, setAreaSlug] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<BroadcastSend[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const selectedCategory = BROADCAST_CATEGORIES.find(c => c.value === category)!;

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/broadcasts`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setHistory(await res.json() as BroadcastSend[]);
    } catch { /* ignore */ } finally { setLoadingHistory(false); }
  }

  async function handleSend() {
    if (!subject || !body) { toast.error("Subject and body are required."); return; }
    if (audience === "city" && !areaSlug) { toast.error("Area slug is required for city broadcasts."); return; }
    setSending(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/broadcasts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ broadcast_type: category, audience, area_slug: areaSlug || null, subject, body }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Broadcast sent!");
      setSubject(""); setBody(""); setAreaSlug("");
    } catch { toast.error("Failed to send broadcast."); } finally { setSending(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <button onClick={() => setTab("compose")} className={`px-4 py-2 text-sm font-medium rounded-lg transition ${tab === "compose" ? "bg-seafoam-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>Compose</button>
        <button onClick={() => { setTab("history"); void loadHistory(); }} className={`px-4 py-2 text-sm font-medium rounded-lg transition ${tab === "history" ? "bg-seafoam-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>History</button>
      </div>

      {tab === "compose" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Category picker */}
          <Card className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-charcoal dark:text-white">Broadcast type</h3>
            <div className="space-y-2">
              {BROADCAST_CATEGORIES.map(c => (
                <button key={c.value} onClick={() => setCategory(c.value)}
                  className={`w-full flex items-start gap-3 rounded-xl border p-3 text-left transition ${category === c.value ? "border-seafoam-400 bg-seafoam-50 dark:bg-seafoam-900/20" : "border-slate-200 hover:border-slate-300 dark:border-slate-700"}`}>
                  <span className={`mt-0.5 ${category === c.value ? "text-seafoam-600" : "text-slate-400"}`}>{c.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-charcoal dark:text-white">{c.label}</p>
                    <p className="text-xs text-slate-500">{c.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* Message */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5 space-y-4">
              <div className="rounded-lg bg-seafoam-50 border border-seafoam-200 px-4 py-3 dark:bg-seafoam-900/20 dark:border-seafoam-800/40">
                <p className="text-xs font-medium text-seafoam-700 dark:text-seafoam-400">Tone suggestion</p>
                <p className="mt-0.5 text-sm italic text-seafoam-800 dark:text-seafoam-300">"{selectedCategory.tone}"</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-white">Audience</label>
                <select value={audience} onChange={e => setAudience(e.target.value as Audience)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                  {(Object.entries(AUDIENCE_LABELS) as [Audience, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              {audience === "city" && (
                <Input label="Area slug" value={areaSlug} onChange={e => setAreaSlug(e.target.value)} placeholder="e.g. los-angeles" />
              )}
              <Input label="Subject line" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-white">Body</label>
                <textarea rows={8} value={body} onChange={e => setBody(e.target.value)} placeholder="Write your message… keep it clean. 🧹"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white resize-none" />
              </div>
            </Card>
            <Button onClick={() => void handleSend()} disabled={sending} className="w-full">
              <Send className="mr-2 h-4 w-4" />
              {sending ? "Sending…" : "Send broadcast"}
            </Button>
          </div>
        </div>
      )}

      {tab === "history" && (
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          {loadingHistory && <p className="p-6 text-center text-sm text-slate-500">Loading…</p>}
          {!loadingHistory && history.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No broadcasts sent yet.</p>}
          {history.map(b => (
            <div key={b.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-charcoal dark:text-white">{b.subject}</p>
                <p className="text-xs text-slate-500 mt-0.5">{b.broadcast_type} · {AUDIENCE_LABELS[b.audience as Audience] ?? b.audience} · {b.sent_count} sent</p>
              </div>
              <p className="text-xs text-slate-400">{new Date(b.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ─── Newsletter tab ────────────────────────────────────────────────────────────

interface Subscriber { id: string; email: string; created_at: string; status: string; }

function NewsletterTab() {
  const { getToken } = useAuth();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [count, setCount] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/newsletter`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json() as { subscribers: Subscriber[]; count: number };
        setSubscribers(data.subscribers ?? []);
        setCount(data.count ?? data.subscribers?.length ?? 0);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  const filtered = search ? subscribers.filter(s => s.email.toLowerCase().includes(search.toLowerCase())) : subscribers;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-charcoal dark:text-white">Newsletter subscribers</h3>
          {count !== null && <p className="text-xs text-slate-500 mt-0.5">{count.toLocaleString()} total</p>}
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Load subscribers"}</Button>
      </div>
      {subscribers.length > 0 && (
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by email…" />
      )}
      {filtered.length > 0 && (
        <Card className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[500px] overflow-y-auto">
          {filtered.map(s => (
            <div key={s.id} className="flex items-center justify-between px-5 py-3">
              <p className="text-sm text-charcoal dark:text-white">{s.email}</p>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.status === "active" ? "bg-seafoam-100 text-seafoam-700" : "bg-slate-100 text-slate-500"}`}>{s.status}</span>
                <p className="text-xs text-slate-400">{new Date(s.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ─── Inbox tab (placeholder) ───────────────────────────────────────────────────

function InboxTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Inbox className="mx-auto mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" />
      <h3 className="text-base font-semibold text-charcoal dark:text-white">Inbox coming soon</h3>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        The proprietary inbox will display inbound emails routed through your MailerSend addresses.
        It will show emails per sender address based on your permission scope.
      </p>
      <p className="mt-3 text-xs text-slate-400">
        Configure inbound routes in MailerSend → connect your addresses to see messages here.
      </p>
    </div>
  );
}

// ─── Page root ─────────────────────────────────────────────────────────────────

export function EmailPage() {
  const [activeTab, setActiveTab] = useEmailTab();

  return (
    <DashboardShell title="Email" description="Compose, broadcast, newsletter, and inbox">
      <SubTabs active={activeTab} onChange={setActiveTab} />
      {activeTab === "compose"    && <ComposeTab />}
      {activeTab === "broadcasts" && <BroadcastsTab />}
      {activeTab === "newsletter" && <NewsletterTab />}
      {activeTab === "inbox"      && <InboxTab />}
    </DashboardShell>
  );
}
