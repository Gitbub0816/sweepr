import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, Card, Button, Input, toast } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Subscriber {
  id: string;
  email: string;
  created_at: string;
}

export function NewsletterPage() {
  const { getToken } = useAuth();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(true);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
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
    if (!body.trim()) { toast.error("Body is required"); return; }
    if (preview && !previewTo.trim()) { toast.error("Enter a test address"); return; }

    preview ? setPreviewing(true) : setSending(true);
    try {
      const token = await getToken();
      const payload: Record<string, string> = { subject, body };
      if (preview) payload.previewTo = previewTo;

      const res = await fetch(`${API}/admin/newsletter/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { ok?: boolean; sent?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Send failed");

      if (preview) {
        toast.success(`Test email sent to ${previewTo}`);
      } else {
        toast.success(`Newsletter sent to ${data.sent} subscriber${data.sent === 1 ? "" : "s"}`);
        setSubject("");
        setBody("");
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
        {/* Sidebar */}
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
            <h3 className="text-sm font-semibold text-charcoal dark:text-white">Send test (optional)</h3>
            <p className="text-xs text-slate-500">Preview in your inbox before sending to everyone.</p>
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
              disabled={previewing || !subject || !body || !previewTo}
              className="w-full"
            >
              {previewing ? "Sending…" : "Send test"}
            </Button>
          </Card>
        </div>

        {/* Composer */}
        <div className="lg:col-span-2">
          <Card className="p-5 space-y-4">
            <Input
              label="Subject"
              placeholder="Your subject line"
              value={subject}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)}
            />

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Message body
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={18}
                spellCheck
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-seafoam-400 resize-y dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700"
                placeholder={"Hello Sweepr community,\n\nYour message here…\n\nDouble line breaks become paragraphs."}
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Plain text only — your branded email template is applied automatically.
              </p>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-slate-400">
                {subscribers.length} subscriber{subscribers.length === 1 ? "" : "s"}
              </p>
              <Button
                onClick={() => handleSend(false)}
                disabled={sending || !subject || !body || subscribers.length === 0}
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
