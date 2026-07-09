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
 * Admin Schedule — a month calendar of notes + scheduled automations.
 * Automations (broadcasts, status announcements, service-area launches,
 * prelaunch gate toggles, admin alerts) execute at their scheduled time via
 * the API cron; notes are plain calendar entries. Supports ICS import
 * (from a feed URL, SSRF-safe server-side) and ICS export.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Button, Input, toast } from "@sweepr/ui";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Download, Upload, Play, Ban, Trash2, Zap, StickyNote } from "lucide-react";
import { useAuthedFetch } from "../lib/alerts";

interface ScheduledEvent {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  kind: "note" | "automation";
  action_type: string | null;
  action_payload: Record<string, unknown>;
  status: "scheduled" | "executed" | "failed" | "canceled";
  executed_at: string | null;
  result_note: string | null;
}

interface ActionField {
  key: string;
  label: string;
  kind: "text" | "textarea" | "select";
  options?: readonly string[];
  required: boolean;
}
interface ActionDef {
  type: string;
  label: string;
  description: string;
  fields: readonly ActionField[];
}

const STATUS_STYLES: Record<ScheduledEvent["status"], string> = {
  scheduled: "bg-seafoam-100 text-seafoam-800 dark:bg-seafoam-900/40 dark:text-seafoam-300",
  executed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  canceled: "bg-slate-100 text-slate-500 line-through dark:bg-slate-800 dark:text-slate-500",
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function SchedulePage() {
  const authed = useAuthedFetch();
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [events, setEvents] = useState<ScheduledEvent[]>([]);
  const [actions, setActions] = useState<ActionDef[]>([]);
  const [editing, setEditing] = useState<ScheduledEvent | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null); // YYYY-MM-DD
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    const from = new Date(month.getFullYear(), month.getMonth() - 1, 1).toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 2, 1).toISOString();
    try {
      const res = await authed(`/admin/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (!res.ok) throw new Error();
      setEvents(((await res.json()) as { events: ScheduledEvent[] }).events);
    } catch { toast.error("Couldn't load the schedule."); }
  }, [authed, month]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    (async () => {
      try {
        const res = await authed("/admin/schedule/actions");
        if (res.ok) setActions(((await res.json()) as { actions: ActionDef[] }).actions);
      } catch { /* non-fatal */ }
    })();
  }, [authed]);

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduledEvent[]>();
    for (const ev of events) {
      const key = ymd(new Date(ev.starts_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [events]);

  // Build the 6x7 month grid.
  const days = useMemo(() => {
    const first = new Date(month);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [month]);

  async function exportIcs() {
    try {
      const res = await authed("/admin/schedule/export.ics");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "sweepr-schedule.ics"; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Export failed."); }
  }

  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayKey = ymd(new Date());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-6 w-6 text-seafoam-700 dark:text-seafoam-400" aria-hidden="true" />
          <h1 className="text-xl font-bold text-charcoal dark:text-white">Schedule</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setImportOpen(true)}><Upload className="mr-1 h-4 w-4" aria-hidden="true" />Import ICS</Button>
          <Button variant="secondary" onClick={() => void exportIcs()}><Download className="mr-1 h-4 w-4" aria-hidden="true" />Export ICS</Button>
          <Button onClick={() => setCreatingFor(todayKey)}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />New event</Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></button>
          <h2 className="text-sm font-semibold text-charcoal dark:text-white">{monthLabel}</h2>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Next month"><ChevronRight className="h-5 w-5" /></button>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="bg-slate-50 px-2 py-1.5 text-center text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">{d}</div>
          ))}
          {days.map((d) => {
            const key = ymd(d);
            const inMonth = d.getMonth() === month.getMonth();
            const dayEvents = byDay.get(key) ?? [];
            return (
              <div
                key={key}
                onClick={() => setCreatingFor(key)}
                className={`min-h-[92px] cursor-pointer bg-white p-1.5 transition hover:bg-seafoam-50/60 dark:bg-slate-900 dark:hover:bg-slate-800 ${inMonth ? "" : "opacity-45"}`}
              >
                <div className={`mb-1 text-right text-xs ${key === todayKey ? "font-bold text-seafoam-700 dark:text-seafoam-400" : "text-slate-400"}`}>{d.getDate()}</div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <button
                      key={ev.id}
                      onClick={(e) => { e.stopPropagation(); setEditing(ev); }}
                      className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium ${STATUS_STYLES[ev.status]}`}
                      title={ev.title}
                    >
                      {ev.kind === "automation" ? <Zap className="h-3 w-3 shrink-0" aria-hidden="true" /> : <StickyNote className="h-3 w-3 shrink-0" aria-hidden="true" />}
                      <span className="truncate">{ev.title}</span>
                    </button>
                  ))}
                  {dayEvents.length > 3 && <p className="px-1 text-[10px] text-slate-400">+{dayEvents.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          <Zap className="mr-1 inline h-3 w-3" aria-hidden="true" />automation · <StickyNote className="mx-1 inline h-3 w-3" aria-hidden="true" />note — click a day to add, click an event to open. Automations run within ~15 minutes of their time.
        </p>
      </Card>

      {creatingFor && (
        <EventModal
          actions={actions}
          initialDate={creatingFor}
          onClose={() => setCreatingFor(null)}
          onSaved={() => { setCreatingFor(null); void load(); }}
        />
      )}
      {editing && (
        <DetailModal
          event={editing}
          onClose={() => setEditing(null)}
          onChanged={() => { setEditing(null); void load(); }}
        />
      )}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); void load(); }} />}
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function EventModal({ actions, initialDate, onClose, onSaved }: {
  actions: ActionDef[]; initialDate: string; onClose: () => void; onSaved: () => void;
}) {
  const authed = useAuthedFetch();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("09:00");
  const [kind, setKind] = useState<"note" | "automation">("note");
  const [actionType, setActionType] = useState<string>("");
  const [payload, setPayload] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const def = actions.find((a) => a.type === actionType);

  async function save() {
    if (!title.trim()) { toast.error("Title is required."); return; }
    if (kind === "automation") {
      if (!def) { toast.error("Pick an action."); return; }
      for (const f of def.fields) {
        if (f.required && !(payload[f.key] ?? "").trim()) { toast.error(`"${f.label}" is required.`); return; }
      }
    }
    setSaving(true);
    try {
      const startsAt = new Date(`${date}T${time}:00`).toISOString();
      const res = await authed("/admin/schedule", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          startsAt,
          kind,
          actionType: kind === "automation" ? actionType : undefined,
          actionPayload: kind === "automation" ? payload : undefined,
        }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Save failed");
      toast.success(kind === "automation" ? "Automation scheduled." : "Event added.");
      onSaved();
    } catch (err) { toast.error((err as Error).message); } finally { setSaving(false); }
  }

  const inputCls = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

  return (
    <Overlay onClose={onClose}>
      <h3 className="mb-4 text-base font-semibold text-charcoal dark:text-white">New scheduled event</h3>
      <div className="space-y-3">
        <Input label="Title" value={title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)} placeholder="e.g. Launch Asheville" />
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200">Time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} /></div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200">Type</label>
          <div className="flex gap-2">
            {(["note", "automation"] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${kind === k ? "border-seafoam-500 bg-seafoam-50 text-seafoam-800 dark:bg-seafoam-900/30 dark:text-seafoam-300" : "border-slate-200 text-slate-500 dark:border-slate-700"}`}>
                {k === "note" ? "Note (just a calendar entry)" : "Automation (runs at time)"}
              </button>
            ))}
          </div>
        </div>
        {kind === "automation" && (
          <>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200">Action</label>
              <select value={actionType} onChange={(e) => { setActionType(e.target.value); setPayload({}); }} className={inputCls}>
                <option value="">Select an action…</option>
                {actions.map((a) => <option key={a.type} value={a.type}>{a.label}</option>)}
              </select>
              {def && <p className="mt-1 text-xs text-slate-500">{def.description}</p>}
            </div>
            {def?.fields.map((f) => (
              <div key={f.key}>
                <label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200">{f.label}{f.required ? " *" : ""}</label>
                {f.kind === "textarea" ? (
                  <textarea rows={4} value={payload[f.key] ?? ""} onChange={(e) => setPayload((p) => ({ ...p, [f.key]: e.target.value }))} className={`${inputCls} h-auto py-2`} />
                ) : f.kind === "select" ? (
                  <select value={payload[f.key] ?? ""} onChange={(e) => setPayload((p) => ({ ...p, [f.key]: e.target.value }))} className={inputCls}>
                    <option value="">Select…</option>
                    {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input value={payload[f.key] ?? ""} onChange={(e) => setPayload((p) => ({ ...p, [f.key]: e.target.value }))} className={inputCls} />
                )}
              </div>
            ))}
          </>
        )}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200">Notes (optional)</label>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputCls} h-auto py-2`} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Schedule"}</Button>
        </div>
      </div>
    </Overlay>
  );
}

function DetailModal({ event, onClose, onChanged }: { event: ScheduledEvent; onClose: () => void; onChanged: () => void }) {
  const authed = useAuthedFetch();
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<Response>, ok: string) {
    setBusy(true);
    try {
      const res = await fn();
      const data = (await res.json().catch(() => ({}))) as { error?: string; result?: string };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      toast.success(data.result ?? ok);
      onChanged();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }

  const canMutate = event.status === "scheduled";
  return (
    <Overlay onClose={onClose}>
      <div className="mb-1 flex items-center gap-2">
        {event.kind === "automation" ? <Zap className="h-4 w-4 text-seafoam-600" aria-hidden="true" /> : <StickyNote className="h-4 w-4 text-slate-400" aria-hidden="true" />}
        <h3 className="text-base font-semibold text-charcoal dark:text-white">{event.title}</h3>
      </div>
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[event.status]}`}>{event.status}</span>
      <dl className="mt-3 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
        <div><dt className="inline font-medium">When:</dt> <dd className="inline">{new Date(event.starts_at).toLocaleString()}</dd></div>
        {event.kind === "automation" && <div><dt className="inline font-medium">Action:</dt> <dd className="inline">{event.action_type}</dd></div>}
        {event.kind === "automation" && Object.keys(event.action_payload ?? {}).length > 0 && (
          <div><dt className="font-medium">Payload:</dt>
            <dd><pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800">{JSON.stringify(event.action_payload, null, 2)}</pre></dd></div>
        )}
        {event.description && <div><dt className="inline font-medium">Notes:</dt> <dd className="inline whitespace-pre-wrap">{event.description}</dd></div>}
        {event.result_note && <div><dt className="inline font-medium">Result:</dt> <dd className="inline">{event.result_note}</dd></div>}
        {event.executed_at && <div><dt className="inline font-medium">Executed:</dt> <dd className="inline">{new Date(event.executed_at).toLocaleString()}</dd></div>}
      </dl>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {event.kind === "automation" && canMutate && (
          <Button onClick={() => void act(() => authed(`/admin/schedule/${event.id}/run-now`, { method: "POST" }), "Executed.")} disabled={busy}>
            <Play className="mr-1 h-4 w-4" aria-hidden="true" />Run now
          </Button>
        )}
        {canMutate && (
          <Button variant="secondary" disabled={busy}
            onClick={() => void act(() => authed(`/admin/schedule/${event.id}`, { method: "PATCH", body: JSON.stringify({ status: "canceled" }) }), "Canceled.")}>
            <Ban className="mr-1 h-4 w-4" aria-hidden="true" />Cancel event
          </Button>
        )}
        <Button variant="ghost" disabled={busy}
          onClick={() => { if (confirm("Delete this event?")) void act(() => authed(`/admin/schedule/${event.id}`, { method: "DELETE" }), "Deleted."); }}>
          <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />Delete
        </Button>
      </div>
    </Overlay>
  );
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const authed = useAuthedFetch();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await authed("/admin/schedule/import-ics", { method: "POST", body: JSON.stringify({ url: url.trim() }) });
      const data = (await res.json()) as { error?: string; imported?: number; found?: number };
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      toast.success(`Imported ${data.imported} of ${data.found} events.`);
      onDone();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <Overlay onClose={onClose}>
      <h3 className="mb-3 text-base font-semibold text-charcoal dark:text-white">Import ICS feed</h3>
      <p className="mb-3 text-sm text-slate-500">Paste a public .ics URL (Google Calendar, Outlook, Airbnb, etc). Events import as notes.</p>
      <Input label="ICS URL" value={url} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => void run()} disabled={busy || !url.trim()}>{busy ? "Importing…" : "Import"}</Button>
      </div>
    </Overlay>
  );
}
