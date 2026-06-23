import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, Card, Button, Input, toast } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

type Audience = "newsletter" | "waitlist_customer" | "waitlist_cleaner" | "city" | "all";

interface Counts {
  newsletter: number;
  waitlist_customer: number;
  waitlist_cleaner: number;
  city: number;
  areas: Array<{ slug: string; name: string }>;
}

interface BroadcastSend {
  id: string;
  audience: string;
  area_slug: string | null;
  subject: string;
  sent_count: number;
  sent_by: string;
  created_at: string;
}

const AUDIENCE_LABELS: Record<Audience, string> = {
  newsletter: "Newsletter subscribers",
  waitlist_customer: "Waitlist — customers",
  waitlist_cleaner: "Waitlist — cleaners",
  city: "City update subscribers",
  all: "All lists (deduplicated)",
};

const STARTER_HTML = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111">
  <img src="https://getsweepr.com/logo.png" alt="Sweepr" style="height:36px;margin-bottom:28px" />
  <h1 style="font-size:22px;font-weight:700;margin:0 0 16px">Update from Sweepr</h1>
  <p style="font-size:15px;line-height:1.7;color:#444;margin:0 0 24px">
    Your message here…
  </p>
  <a href="https://getsweepr.com" style="display:inline-block;background:#14b8a6;color:#fff;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px">
    Learn more
  </a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb" />
  <p style="font-size:12px;color:#9ca3af;margin:0">You're receiving this from Sweepr.</p>
</div>`;

export function BroadcastsPage() {
  const { getToken } = useAuth();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [history, setHistory] = useState<BroadcastSend[]>([]);
  const [tab, setTab] = useState<"compose" | "history">("compose");

  const [audience, setAudience] = useState<Audience>("newsletter");
  const [areaSlug, setAreaSlug] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState(STARTER_HTML);
  const [editorTab, setEditorTab] = useState<"write" | "preview">("write");
  const [previewTo, setPreviewTo] = useState("");
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const h = { Authorization: `Bearer ${token}` };
      const [countsRes, historyRes] = await Promise.all([
        fetch(`${API}/admin/broadcasts/counts`, { headers: h }),
        fetch(`${API}/admin/broadcasts`, { headers: h }),
      ]);
      if (countsRes.ok) setCounts(await countsRes.json() as Counts);
      if (historyRes.ok) setHistory((await historyRes.json() as { sends: BroadcastSend[] }).sends);
    })();
  }, [getToken]);

  function recipientCount(): number {
    if (!counts) return 0;
    if (audience === "newsletter") return counts.newsletter;
    if (audience === "waitlist_customer") return counts.waitlist_customer;
    if (audience === "waitlist_cleaner") return counts.waitlist_cleaner;
    if (audience === "city") return counts.city;
    if (audience === "all") return counts.newsletter + counts.waitlist_customer + counts.waitlist_cleaner + counts.city;
    return 0;
  }

  async function send(preview = false) {
    if (!subject.trim()) { toast.error("Subject is required"); return; }
    if (!html.trim()) { toast.error("Body is required"); return; }
    if (preview && !previewTo.trim()) { toast.error("Enter a test address"); return; }

    preview ? setPreviewing(true) : setSending(true);
    try {
      const token = await getToken();
      const body: Record<string, string> = { audience, subject, html };
      if (audience === "city" && areaSlug) body.areaSlug = areaSlug;
      if (preview) body.previewTo = previewTo;

      const res = await fetch(`${API}/admin/broadcasts/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok?: boolean; sent?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");

      if (preview) {
        toast.success(`Test sent to ${previewTo}`);
      } else {
        toast.success(`Sent to ${data.sent} recipient${data.sent === 1 ? "" : "s"}`);
        // Refresh history
        const histRes = await fetch(`${API}/admin/broadcasts`, { headers: { Authorization: `Bearer ${token}` } });
        if (histRes.ok) setHistory((await histRes.json() as { sends: BroadcastSend[] }).sends);
      }
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Failed to send");
    } finally {
      preview ? setPreviewing(false) : setSending(false);
    }
  }

  return (
    <DashboardShell title="Broadcasts" description="Send targeted updates to any subscriber list.">
      <div className="flex border-b border-slate-200 mb-6">
        {(["compose", "history"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors ${
              tab === t ? "border-b-2 border-seafoam-500 text-seafoam-600" : "text-slate-500 hover:text-slate-700"
            }`}>
            {t === "history" ? `History (${history.length})` : "Compose"}
          </button>
        ))}
      </div>

      {tab === "compose" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Sidebar */}
          <div className="space-y-4">
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-semibold">Audience</h3>

              <div className="space-y-2">
                {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
                  <label key={a} className="flex items-center gap-2.5 cursor-pointer">
                    <input type="radio" name="audience" value={a} checked={audience === a}
                      onChange={() => setAudience(a)}
                      className="text-seafoam-500 focus:ring-seafoam-400" />
                    <span className="text-sm text-slate-700">{AUDIENCE_LABELS[a]}</span>
                    {counts && (
                      <span className="ml-auto text-xs text-slate-400 font-mono">
                        {a === "newsletter" ? counts.newsletter
                          : a === "waitlist_customer" ? counts.waitlist_customer
                          : a === "waitlist_cleaner" ? counts.waitlist_cleaner
                          : a === "city" ? counts.city
                          : counts.newsletter + counts.waitlist_customer + counts.waitlist_cleaner + counts.city}
                      </span>
                    )}
                  </label>
                ))}
              </div>

              {audience === "city" && counts && counts.areas.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Filter by city (optional)</label>
                  <select value={areaSlug} onChange={(e) => setAreaSlug(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400">
                    <option value="">All city subscribers</option>
                    {counts.areas.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
                  </select>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  <span className="font-semibold text-charcoal">{recipientCount()}</span> recipients
                  {audience === "all" && <span className="text-slate-400"> (may overlap — deduped on send)</span>}
                </p>
              </div>
            </Card>

            <Card className="p-5 space-y-3">
              <h3 className="text-sm font-semibold">Send test</h3>
              <Input label="Test address" type="email" placeholder="you@example.com"
                value={previewTo} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPreviewTo(e.target.value)} />
              <Button variant="secondary" disabled={previewing || !subject || !html || !previewTo}
                onClick={() => send(true)} className="w-full">
                {previewing ? "Sending…" : "Send test"}
              </Button>
            </Card>
          </div>

          {/* Composer */}
          <div className="lg:col-span-2">
            <Card className="p-5 space-y-4">
              <Input label="Subject" placeholder="Your subject line" value={subject}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)} />

              <div>
                <div className="flex border-b border-slate-200 mb-3">
                  {(["write", "preview"] as const).map((t) => (
                    <button key={t} onClick={() => setEditorTab(t)}
                      className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                        editorTab === t ? "border-b-2 border-seafoam-500 text-seafoam-600" : "text-slate-500 hover:text-slate-700"
                      }`}>{t}</button>
                  ))}
                </div>

                {editorTab === "write" ? (
                  <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={22} spellCheck={false}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-seafoam-400 resize-y" />
                ) : (
                  <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                    <div className="bg-slate-100 px-3 py-1.5 text-xs text-slate-500 border-b border-slate-200">
                      Preview — {subject || "(no subject)"}
                    </div>
                    <iframe srcDoc={html} title="preview" className="w-full border-none" style={{ minHeight: 440 }} sandbox="allow-same-origin" />
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-1">
                <Button disabled={sending || !subject || !html || recipientCount() === 0} onClick={() => send(false)}>
                  {sending ? "Sending…" : `Send to ${recipientCount()} recipient${recipientCount() === 1 ? "" : "s"}`}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-2">
          {history.length === 0 && <p className="text-sm text-slate-400">No broadcasts sent yet.</p>}
          {history.map((s) => (
            <Card key={s.id} className="p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-charcoal truncate">{s.subject}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {s.audience}{s.area_slug ? ` › ${s.area_slug}` : ""} · {s.sent_count} sent · {new Date(s.created_at).toLocaleString()}
                </p>
              </div>
              <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5 whitespace-nowrap">
                {s.sent_count} sent
              </span>
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
