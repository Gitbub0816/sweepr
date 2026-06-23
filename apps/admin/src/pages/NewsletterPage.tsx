import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, Card, Button, Input, toast } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Subscriber {
  id: string;
  email: string;
  created_at: string;
}

const STARTER_HTML = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111">
  <img src="https://getsweepr.com/logo.png" alt="Sweepr" style="height:36px;margin-bottom:28px" />

  <h1 style="font-size:24px;font-weight:700;margin:0 0 16px">Subject line goes here</h1>

  <p style="font-size:15px;line-height:1.7;color:#444;margin:0 0 16px">
    Hello Sweepr community,
  </p>

  <p style="font-size:15px;line-height:1.7;color:#444;margin:0 0 24px">
    Your message here…
  </p>

  <a href="https://getsweepr.com"
     style="display:inline-block;background:#14b8a6;color:#fff;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px">
    Visit Sweepr
  </a>

  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb" />

  <p style="font-size:12px;color:#9ca3af;margin:0">
    You're receiving this because you subscribed at getsweepr.com.
  </p>
</div>`;

export function NewsletterPage() {
  const { getToken } = useAuth();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(true);

  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState(STARTER_HTML);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [previewTo, setPreviewTo] = useState("");
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const res = await fetch(`${API}/admin/newsletter/subscribers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as { subscribers: Subscriber[] };
        setSubscribers(data.subscribers);
      }
      setLoadingSubs(false);
    })();
  }, [getToken]);

  async function handleSend(preview = false) {
    if (!subject.trim()) { toast.error("Subject is required"); return; }
    if (!html.trim()) { toast.error("Body is required"); return; }
    if (preview && !previewTo.trim()) { toast.error("Preview email address is required"); return; }

    preview ? setPreviewing(true) : setSending(true);
    try {
      const token = await getToken();
      const body: Record<string, string> = { subject, html };
      if (preview) body.previewTo = previewTo;

      const res = await fetch(`${API}/admin/newsletter/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok?: boolean; sent?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Send failed");

      if (preview) {
        toast.success(`Test email sent to ${previewTo}`);
      } else {
        toast.success(`Newsletter sent to ${data.sent} subscriber${data.sent === 1 ? "" : "s"}`);
      }
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Failed to send");
    } finally {
      preview ? setPreviewing(false) : setSending(false);
    }
  }

  return (
    <DashboardShell
      title="Newsletter"
      description="Compose and send emails to all newsletter subscribers."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Subscriber sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-charcoal dark:text-white mb-1">Subscribers</h3>
            {loadingSubs ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : (
              <p className="text-3xl font-bold text-seafoam-600">{subscribers.length}</p>
            )}
            {subscribers.length > 0 && (
              <div className="mt-4 max-h-64 overflow-y-auto space-y-1">
                {subscribers.map((s) => (
                  <p key={s.id} className="text-xs text-slate-500 truncate">{s.email}</p>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-charcoal dark:text-white">Send test</h3>
            <p className="text-xs text-slate-500">Preview before sending to everyone.</p>
            <Input
              label="Test address"
              type="email"
              placeholder="you@example.com"
              value={previewTo}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPreviewTo(e.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() => handleSend(true)}
              disabled={previewing || !subject || !html || !previewTo}
              className="w-full"
            >
              {previewing ? "Sending…" : "Send test"}
            </Button>
          </Card>
        </div>

        {/* Composer */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5 space-y-4">
            <Input
              label="Subject"
              placeholder="Your subject line"
              value={subject}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)}
            />

            {/* Write / Preview tabs */}
            <div>
              <div className="flex border-b border-slate-200 mb-3">
                {(["write", "preview"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                      tab === t
                        ? "border-b-2 border-seafoam-500 text-seafoam-600"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {tab === "write" ? (
                <textarea
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  rows={24}
                  spellCheck={false}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-seafoam-400 resize-y dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700"
                  placeholder="Write your email HTML here…"
                />
              ) : (
                <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                  <div className="bg-slate-100 px-3 py-1.5 text-xs text-slate-500 border-b border-slate-200">
                    Preview — {subject || "(no subject)"}
                  </div>
                  <div className="p-4 min-h-64">
                    <iframe
                      srcDoc={html}
                      title="Email preview"
                      className="w-full border-none"
                      style={{ minHeight: "480px" }}
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => handleSend(false)}
                disabled={sending || !subject || !html || subscribers.length === 0}
              >
                {sending
                  ? "Sending…"
                  : `Send to ${subscribers.length} subscriber${subscribers.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
