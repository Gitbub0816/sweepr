/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useAppToken } from "@/lib/appToken";
import { CalendarClock, Plus, RefreshCw, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { DashboardShell, Card, Button, Input, EmptyState, toast } from "@sweepr/ui";
import type { CalendarProvider } from "@sweepr/types";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface Property {
  id: string;
  nickname: string;
  address: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  monthlyFee: number;
  active: boolean;
  enrolledAt: string | null;
  sourceCount: number;
}
interface Source {
  id: string;
  propertyId: string;
  provider: CalendarProvider;
  autoBook: boolean;
  status: "active" | "paused" | "error";
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  lastSyncEventCount: number | null;
}
interface Reservation {
  id: string;
  propertyId: string;
  propertyNickname: string;
  checkinDate: string | null;
  checkoutDate: string;
  cleaningStatus: "pending" | "scheduled" | "skipped" | "cancelled";
}

const PROVIDERS: { value: CalendarProvider; label: string; help: string }[] = [
  { value: "airbnb", label: "Airbnb", help: "Airbnb: Listing → Availability → Connect calendars → Export calendar. Copy the .ics link." },
  { value: "vrbo", label: "Vrbo", help: "Vrbo: Calendar → Import & export → Export calendar. Copy the URL." },
  { value: "booking_com", label: "Booking.com", help: "Booking.com: Rates & Availability → Sync calendars → Export. Copy the iCal URL." },
  { value: "google_calendar", label: "Google Calendar", help: "Google Calendar: Settings → your calendar → Secret address in iCal format." },
  { value: "pms", label: "Property manager (PMS)", help: "Your PMS should offer an iCal / .ics export URL for the listing." },
  { value: "other", label: "Other", help: "Paste any public iCal (.ics) feed URL that lists your reservations." },
];

export function RentalsPage() {
  const { getToken } = useAppToken();
  const [pricing, setPricing] = useState<{ monthlyFee: number; perTurnaround: number } | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  const authed = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await getToken();
      const headers: Record<string, string> = { "Content-Type": "application/json", ...(init?.headers as Record<string, string>) };
      if (token) headers.Authorization = `Bearer ${token}`;
      return fetch(`${API_URL}${path}`, { ...init, headers });
    },
    [getToken],
  );

  const refresh = useCallback(async () => {
    const [pr, pp, ss, rr] = await Promise.all([
      authed("/rentals/pricing"),
      authed("/rentals/properties"),
      authed("/rentals/calendars"),
      authed("/rentals/reservations"),
    ]);
    if (pr.ok) setPricing(await pr.json());
    if (pp.ok) setProperties((await pp.json()).properties);
    if (ss.ok) setSources((await ss.json()).sources);
    if (rr.ok) setReservations((await rr.json()).reservations);
    setLoading(false);
  }, [authed]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <DashboardShell
      title="Short-term rentals"
      description="Sync your booking calendar and we'll turn over your rental after each guest checks out."
    >
      {pricing && (
        <Card className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-2">
          <div>
            <p className="text-xs text-slate-500">Per connected property</p>
            <p className="text-lg font-bold text-charcoal dark:text-white">${pricing.monthlyFee.toFixed(0)}/mo</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Per turnaround clean</p>
            <p className="text-lg font-bold text-charcoal dark:text-white">${pricing.perTurnaround.toFixed(0)}</p>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : (
        <div className="space-y-6">
          <AddProperty authed={authed} onAdded={refresh} />

          {properties.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="h-10 w-10" />}
              title="No properties yet"
              description="Add your first rental above to start syncing turnovers."
            />
          ) : (
            properties.map((p) => (
              <PropertyCard
                key={p.id}
                property={p}
                sources={sources.filter((s) => s.propertyId === p.id)}
                reservations={reservations.filter((r) => r.propertyId === p.id)}
                pricing={pricing}
                authed={authed}
                onChange={refresh}
              />
            ))
          )}
        </div>
      )}
    </DashboardShell>
  );
}

type Authed = (path: string, init?: RequestInit) => Promise<Response>;

/**
 * Explicit enrollment gate: the monthly subscription and automatic turnaround
 * booking only start after the host reads the disclosures and taps Enroll.
 */
function EnrollPanel({
  property,
  pricing,
  authed,
  onChange,
}: {
  property: Property;
  pricing: { monthlyFee: number; perTurnaround: number } | null;
  authed: Authed;
  onChange: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [enrolling, setEnrolling] = useState(false);

  async function enroll() {
    setEnrolling(true);
    try {
      const res = await authed(`/rentals/properties/${property.id}/enroll`, {
        method: "POST",
        body: JSON.stringify({ acceptDisclosures: true, disclaimerVersion: "v1" }),
      });
      if (!res.ok) throw new Error("Enrollment failed, please try again.");
      toast.success(`${property.nickname} is enrolled`);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnrolling(false);
    }
  }

  const monthly = pricing ? `$${pricing.monthlyFee.toFixed(0)}/month` : "the monthly fee";
  const per = pricing ? `$${pricing.perTurnaround.toFixed(0)}` : "the current turnaround rate";

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        Enroll this property in turnaround service
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800 dark:text-amber-300">
        <li>
          A subscription of <strong>{monthly}</strong> applies per enrolled property, billed
          until you unenroll. You can unenroll at any time, no long-term commitment.
        </li>
        <li>
          Each turnaround clean is billed at <strong>{per}</strong> (current rate; shown before
          anything books). Rates can change with notice.
        </li>
        <li>
          With auto-book on, cleanings are scheduled automatically from your calendar's
          checkout dates. With review-first (default), nothing books until you approve it.
        </li>
        <li>Calendar syncing pauses while a property is unenrolled.</li>
      </ul>
      <label className="mt-3 flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5"
          aria-describedby={`enroll-terms-${property.id}`}
        />
        <span id={`enroll-terms-${property.id}`} className="text-xs text-amber-900 dark:text-amber-200">
          I understand and agree to the subscription and per-turnaround charges above.
        </span>
      </label>
      <Button className="mt-3" onClick={enroll} disabled={!accepted || enrolling}>
        {enrolling ? "Enrolling…" : "Enroll"}
      </Button>
    </div>
  );
}

function AddProperty({ authed, onAdded }: { authed: Authed; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nickname: "", street: "", city: "", state: "", zip: "" });
  const [saving, setSaving] = useState(false);
  // The address is what cleaners navigate to — require it up front.
  const valid =
    f.nickname.trim().length > 0 &&
    f.street.trim().length >= 3 &&
    f.city.trim().length > 0 &&
    f.state.trim().length === 2 &&
    /^\d{5}/.test(f.zip.trim());

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await authed("/rentals/properties", {
        method: "POST",
        body: JSON.stringify({
          nickname: f.nickname.trim(),
          streetAddress: f.street.trim(),
          city: f.city.trim(),
          state: f.state.trim().toUpperCase(),
          zip: f.zip.trim(),
        }),
      });
      if (!res.ok) throw new Error("Failed to add property");
      setF({ nickname: "", street: "", city: "", state: "", zip: "" });
      setOpen(false);
      onAdded();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add a rental
      </Button>
    );
  }
  return (
    <Card className="space-y-3">
      <Input label="Property nickname" placeholder="Beach condo" value={f.nickname} onChange={(e) => setF({ ...f, nickname: e.target.value })} />
      <Input label="Street address" placeholder="123 Shoreline Dr" value={f.street} onChange={(e) => setF({ ...f, street: e.target.value })} />
      <div className="grid grid-cols-3 gap-2">
        <Input label="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        <Input label="State" placeholder="CA" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} />
        <Input label="ZIP" value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving || !valid}>Save</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </Card>
  );
}

function PropertyCard({
  property,
  sources,
  reservations,
  pricing,
  authed,
  onChange,
}: {
  property: Property;
  sources: Source[];
  reservations: Reservation[];
  pricing: { monthlyFee: number; perTurnaround: number } | null;
  authed: Authed;
  onChange: () => void;
}) {
  const [connecting, setConnecting] = useState(false);
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-charcoal dark:text-white">{property.nickname}</h3>
          {property.address && <p className="text-xs text-slate-500">{property.address}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={
              property.active
                ? "rounded-full bg-seafoam-100 px-3 py-1 text-xs font-semibold text-seafoam-700 dark:bg-seafoam-900/30 dark:text-seafoam-300"
                : "rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            }
          >
            {property.active ? "Enrolled" : "Not enrolled"}
          </span>
          {!property.active && (
            <button
              type="button"
              aria-label="Remove property"
              className="text-slate-400 hover:text-red-500"
              onClick={async () => {
                if (!confirm(`Remove ${property.nickname}?`)) return;
                await authed(`/rentals/properties/${property.id}`, { method: "DELETE" });
                toast.success("Property removed");
                onChange();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {!property.active && (
        <EnrollPanel property={property} pricing={pricing} authed={authed} onChange={onChange} />
      )}
      {property.active && (
        <button
          type="button"
          className="text-xs text-slate-500 underline-offset-2 hover:text-red-600 hover:underline"
          onClick={async () => {
            await authed(`/rentals/properties/${property.id}/unenroll`, { method: "POST" });
            toast.success(`${property.nickname} unenrolled, billing and syncing stopped`);
            onChange();
          }}
        >
          Unenroll (stops the monthly subscription and calendar syncing)
        </button>
      )}

      {sources.map((s) => (
        <SourceRow key={s.id} source={s} authed={authed} onChange={onChange} />
      ))}

      {connecting ? (
        <ConnectCalendar
          propertyId={property.id}
          authed={authed}
          onDone={() => {
            setConnecting(false);
            onChange();
          }}
          onCancel={() => setConnecting(false)}
        />
      ) : (
        <Button variant="secondary" onClick={() => setConnecting(true)}>
          <Plus className="h-4 w-4" /> Connect a calendar
        </Button>
      )}

      {reservations.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Upcoming turnovers</p>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {reservations.slice(0, 8).map((r) => (
              <TurnoverRow key={r.id} reservation={r} propertyActive={property.active} authed={authed} onChange={onChange} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/** One pending/booked turnover with review-first Book / Skip actions. */
function TurnoverRow({
  reservation: r,
  propertyActive,
  authed,
  onChange,
}: {
  reservation: Reservation;
  propertyActive: boolean;
  authed: Authed;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function act(action: "book" | "skip") {
    setBusy(true);
    try {
      const res = await authed(`/rentals/reservations/${r.id}/${action}`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.message ?? "Something went wrong.");
      toast.success(action === "book" ? "Turnover cleaning booked" : "Turnover skipped");
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="text-slate-600 dark:text-slate-300">Checkout {r.checkoutDate}</span>
      {r.cleaningStatus === "scheduled" ? (
        <span className="text-xs font-semibold text-seafoam-700 dark:text-seafoam-300">Cleaning booked</span>
      ) : r.cleaningStatus === "skipped" ? (
        <span className="text-xs text-slate-400">Skipped</span>
      ) : (
        <span className="flex items-center gap-1.5">
          <Button size="sm" onClick={() => act("book")} disabled={busy || !propertyActive}
            title={!propertyActive ? "Enroll this property to book turnovers" : undefined}>
            Book clean
          </Button>
          <Button size="sm" variant="ghost" onClick={() => act("skip")} disabled={busy}>
            Skip
          </Button>
        </span>
      )}
    </div>
  );
}

function SourceRow({ source, authed, onChange }: { source: Source; authed: Authed; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const label = PROVIDERS.find((p) => p.value === source.provider)?.label ?? source.provider;

  async function syncNow() {
    setBusy(true);
    try {
      const res = await authed(`/rentals/calendars/${source.id}/sync`, { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; imported?: number; error?: string };
      if (data.ok) toast.success(`Synced, ${data.imported ?? 0} turnover(s)`);
      else toast.error(data.error ?? "Sync failed");
      onChange();
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await authed(`/rentals/calendars/${source.id}`, { method: "DELETE" });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
      <div className="flex items-center gap-2">
        {source.status === "error" ? (
          <AlertCircle className="h-4 w-4 text-red-500" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-seafoam-600" />
        )}
        <div>
          <p className="text-sm font-medium text-charcoal dark:text-white">
            {label} {source.autoBook ? "· auto-books" : "· review first"}
          </p>
          <p className="text-xs text-slate-500">
            {source.status === "error"
              ? source.lastSyncError ?? "Last sync failed"
              : source.lastSyncedAt
                ? `Synced ${new Date(source.lastSyncedAt).toLocaleString()}`
                : "Not synced yet"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={syncNow} disabled={busy} aria-label="Sync now">
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        </Button>
        <Button variant="ghost" size="sm" onClick={remove} disabled={busy} aria-label="Remove calendar">
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>
    </div>
  );
}

function ConnectCalendar({
  propertyId,
  authed,
  onDone,
  onCancel,
}: {
  propertyId: string;
  authed: Authed;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [provider, setProvider] = useState<CalendarProvider>("airbnb");
  const [icsUrl, setIcsUrl] = useState("");
  const [autoBook, setAutoBook] = useState(false);
  const [saving, setSaving] = useState(false);
  const help = PROVIDERS.find((p) => p.value === provider)?.help;

  async function connect() {
    if (!icsUrl.trim()) return;
    setSaving(true);
    try {
      const res = await authed("/rentals/calendars", {
        method: "POST",
        body: JSON.stringify({ propertyId, provider, icsUrl: icsUrl.trim(), autoBook }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Couldn't connect that calendar.");
      }
      toast.success("Calendar connected");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-3 bg-slate-50 dark:bg-slate-800/40">
      <div>
        <label className="mb-1 block text-sm font-medium text-charcoal dark:text-white">Where is your calendar from?</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as CalendarProvider)}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        {help && <p className="mt-1 text-xs text-slate-500">{help}</p>}
      </div>
      <Input
        label="Calendar (.ics) URL"
        placeholder="https://www.airbnb.com/calendar/ical/…"
        value={icsUrl}
        onChange={(e) => setIcsUrl(e.target.value)}
      />
      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={autoBook} onChange={(e) => setAutoBook(e.target.checked)} />
        Automatically book turnovers (otherwise we hold them for your review)
      </label>
      <div className="flex gap-2">
        <Button onClick={connect} disabled={saving || !icsUrl.trim()}>
          {saving ? "Validating…" : "Connect"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  );
}
