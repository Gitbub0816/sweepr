import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, Card, Button, Input, toast } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

type Audience = "newsletter" | "waitlist_customer" | "waitlist_cleaner" | "city" | "all";
type BroadcastType = "announcement" | "launch" | "feature" | "area" | "offer" | "operational";

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
  broadcast_type: string;
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

const BROADCAST_TYPES: Array<{ value: BroadcastType; label: string; description: string }> = [
  { value: "announcement", label: "Announcement",       description: "General news or update" },
  { value: "launch",       label: "Launch update",      description: "We're live / area opening" },
  { value: "feature",      label: "Feature update",     description: "New product or app feature" },
  { value: "area",         label: "New service area",   description: "New city or coverage expansion" },
  { value: "offer",        label: "Promotional offer",  description: "Deal, discount, or referral" },
  { value: "operational",  label: "Operational notice", description: "Maintenance or service notice" },
];

const TYPE_BADGE: Record<BroadcastType, string> = {
  announcement: "bg-blue-100 text-blue-700",
  launch:       "bg-seafoam-100 text-seafoam-700",
  feature:      "bg-violet-100 text-violet-700",
  area:         "bg-emerald-100 text-emerald-700",
  offer:        "bg-amber-100 text-amber-700",
  operational:  "bg-slate-100 text-slate-600",
};

export function BroadcastsPage() {
  const { getToken } = useAuth();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [history, setHistory] = useState<BroadcastSend[]>([]);
  const [tab, setTab] = useState<"compose" | "history">("compose");

  const [audience, setAudience] = useState<Audience>("newsletter");
  const [broadcastType, setBroadcastType] = useState<BroadcastType>("announcement");
  const [areaSlug, setAreaSlug] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
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
    if (!body.trim()) { toast.error("Body is required"); return; }
    if (preview && !previewTo.trim()) { toast.error("Enter a test address"); return; }

    preview ? setPreviewing(true) : setSending(true);
    try {
      const token = await getToken();
      const payload: Record<string, string> = { audience, broadcastType, subject, body };
      if (audience === "city" && areaSlug) payload.areaSlug = areaSlug;
      if (preview) payload.previewTo = previewTo;

      const res = await fetch(`${API}/admin/broadcasts/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { ok?: boolean; sent?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");

      if (preview) {
        toast.success(`Test sent to ${previewTo}`);
      } else {
        toast.success(`Sent to ${data.sent} recipient${data.sent === 1 ? "" : "s"}`);
        setSubject("");
        setBody("");
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
            {/* Audience */}
            <Card className="p-5 space-y-3">
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
                  {audience === "all" && <span className="text-slate-400"> (deduped on send)</span>}
                </p>
              </div>
            </Card>

            {/* Broadcast type */}
            <Card className="p-5 space-y-3">
              <h3 className="text-sm font-semibold">Broadcast type</h3>
              <div className="space-y-2">
                {BROADCAST_TYPES.map((t) => (
                  <label key={t.value} className="flex items-start gap-2.5 cursor-pointer">
                    <input type="radio" name="broadcastType" value={t.value}
                      checked={broadcastType === t.value}
                      onChange={() => setBroadcastType(t.value)}
                      className="mt-0.5 text-seafoam-500 focus:ring-seafoam-400" />
                    <div>
                      <span className="text-sm text-slate-700 font-medium">{t.label}</span>
                      <p className="text-xs text-slate-400">{t.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </Card>

            {/* Optional test */}
            <Card className="p-5 space-y-3">
              <h3 className="text-sm font-semibold">Send test <span className="font-normal text-slate-400">(optional)</span></h3>
              <Input label="Test address" type="email" placeholder="you@example.com"
                value={previewTo} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPreviewTo(e.target.value)} />
              <Button variant="secondary" disabled={previewing || !subject || !body || !previewTo}
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
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Message body</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={18}
                  spellCheck
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-seafoam-400 resize-y dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700"
                  placeholder={"Your message here…\n\nDouble line breaks become paragraphs."}
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  Plain text — your branded email template is applied automatically.
                </p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-slate-400">
                  {recipientCount()} recipient{recipientCount() === 1 ? "" : "s"}
                </p>
                <Button disabled={sending || !subject || !body || recipientCount() === 0} onClick={() => send(false)}>
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
          {history.map((s) => {
            const typeInfo = BROADCAST_TYPES.find((t) => t.value === s.broadcast_type);
            const badgeCls = TYPE_BADGE[(s.broadcast_type as BroadcastType)] ?? TYPE_BADGE.announcement;
            return (
              <Card key={s.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-medium text-sm text-charcoal truncate">{s.subject}</p>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium whitespace-nowrap ${badgeCls}`}>
                      {typeInfo?.label ?? s.broadcast_type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {AUDIENCE_LABELS[s.audience as Audience] ?? s.audience}
                    {s.area_slug ? ` › ${s.area_slug}` : ""}
                    {" · "}{s.sent_count} sent{" · "}{new Date(s.created_at).toLocaleString()}
                  </p>
                </div>
                <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5 whitespace-nowrap">
                  {s.sent_count} sent
                </span>
              </Card>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}
