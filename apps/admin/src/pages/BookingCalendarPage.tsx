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
 * Booking Calendar — per-date operational rules (calendar_date_rules).
 *
 * Admins block dates (individually or in bulk), attach date-specific price
 * adjustments, or run automatic date coupons, platform-wide or scoped to one
 * service area. Blocking a date stops NEW bookings and reschedules only:
 * existing bookings stay untouched and surface here as conflict counts so an
 * admin can act on them manually.
 *
 * Distinct from the Automation → Schedule calendar (comms automations).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Ban,
  BadgePercent,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Ticket,
} from "lucide-react";
import { DashboardShell, Badge, Button, Modal, Select, toast } from "@sweepr/ui";
import { DollarInput } from "../components/DollarInput";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

// ── Types ────────────────────────────────────────────────────────────────────

type RuleKind = "block" | "price_adjustment" | "coupon";

interface CalendarRule {
  id: string;
  rule_date: string; // YYYY-MM-DD
  service_area_id: string | null;
  service_area_name: string | null;
  kind: RuleKind;
  adjustment_type: "percent" | "flat" | null;
  adjustment_value: number | null;
  coupon_kind: "percent_off" | "amount_off" | null;
  coupon_value: number | null;
  label: string;
  reason: string | null;
  active: boolean;
}

interface DayBooking {
  id: string;
  status: string;
  scheduledAt: string;
  arrivalWindowStart: string | null;
  serviceType: string;
  totalPriceCents: number | null;
  customerName: string | null;
  serviceAreaName: string | null;
  conflictsWithBlock: boolean;
}

interface ServiceArea {
  id: string;
  name: string;
  status: string;
}

// ── Plain date helpers (date keys are "YYYY-MM-DD"; math at UTC noon) ────────

const dayMs = 86_400_000;
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const keyMs = (key: string) => new Date(`${key}T12:00:00Z`).getTime();

/** 42-cell grid (6 weeks starting Sunday) for a month ("YYYY-MM"). */
function monthGridKeys(month: string): string[] {
  const first = keyMs(`${month}-01`);
  const start = first - new Date(first).getUTCDay() * dayMs;
  return Array.from({ length: 42 }, (_, i) => toKey(start + i * dayMs));
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

const todayKey = () => new Date().toISOString().slice(0, 10);

const dollars = (cents: number) =>
  `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;

/** Human summary of a rule's effect (admin-facing). */
function ruleValueText(r: CalendarRule): string {
  if (r.kind === "block") return "Blocked";
  if (r.kind === "price_adjustment") {
    if (r.adjustment_type === "percent") {
      const v = r.adjustment_value ?? 0;
      return `${v > 0 ? "+" : ""}${v}%`;
    }
    const v = r.adjustment_value ?? 0;
    return `${v > 0 ? "+" : ""}${dollars(v)}`;
  }
  return r.coupon_kind === "percent_off"
    ? `${r.coupon_value}% off coupon`
    : `${dollars(r.coupon_value ?? 0)} off coupon`;
}

const KIND_LABEL: Record<RuleKind, string> = {
  block: "Block",
  price_adjustment: "Price adjustment",
  coupon: "Coupon",
};

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_VARIANT: Record<string, "info" | "warning" | "success" | "error" | "default"> = {
  booked: "info",
  matching: "info",
  offered_to_cleaner: "info",
  cleaner_accepted: "info",
  confirmed: "success",
  in_progress: "warning",
  completed: "success",
  disputed: "error",
};

// ── Bulk creation / edit form state ──────────────────────────────────────────

interface RuleForm {
  kind: RuleKind;
  serviceAreaId: string; // "" = platform-wide
  label: string;
  reason: string;
  adjustmentType: "percent" | "flat";
  /** Positive magnitude; `direction` supplies the sign. */
  percentValue: number;
  flatCents: number | null;
  direction: "increase" | "decrease";
  couponKind: "percent_off" | "amount_off";
  couponPercent: number;
  couponCents: number | null;
}

const emptyForm = (): RuleForm => ({
  kind: "block",
  serviceAreaId: "",
  label: "",
  reason: "",
  adjustmentType: "percent",
  percentValue: 10,
  flatCents: null,
  direction: "increase",
  couponKind: "percent_off",
  couponPercent: 10,
  couponCents: null,
});

const DEFAULT_LABELS: Record<RuleKind, string> = {
  block: "Unavailable",
  price_adjustment: "Seasonal date adjustment",
  coupon: "Date promotion",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export function BookingCalendarPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [month, setMonth] = useState(() => todayKey().slice(0, 7));
  const [rules, setRules] = useState<CalendarRule[]>([]);
  const [conflicts, setConflicts] = useState<Record<string, number>>({});
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [loading, setLoading] = useState(true);

  // Interaction: browse (click opens day panel) vs select (click toggles).
  const [mode, setMode] = useState<"browse" | "select">("browse");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);

  // Day panel
  const [panelDate, setPanelDate] = useState<string | null>(null);
  const [dayBookings, setDayBookings] = useState<DayBooking[] | null>(null);

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<RuleForm>(emptyForm());
  // Range mode (used when nothing is selected): from/to + weekday filter.
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [editRule, setEditRule] = useState<CalendarRule | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | {
    verb: "deactivate" | "delete";
    ids: string[];
  }>(null);

  const authed = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await getToken();
      return fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(init?.headers ?? {}),
        },
      });
    },
    [getToken],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authed(`/admin/calendar?from=${month}-01&to=${lastDayOfMonth(month)}`);
      if (res.ok) {
        const data = (await res.json()) as {
          rules: CalendarRule[];
          conflicts: Record<string, number>;
        };
        setRules(data.rules ?? []);
        setConflicts(data.conflicts ?? {});
      }
    } finally {
      setLoading(false);
    }
  }, [authed, month]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const res = await authed("/admin/service-areas");
      if (res.ok) {
        const data = (await res.json()) as { areas: ServiceArea[] };
        setAreas(data.areas ?? []);
      }
    })();
  }, [authed]);

  const loadDay = useCallback(
    async (date: string) => {
      setPanelDate(date);
      setDayBookings(null);
      const res = await authed(`/admin/calendar/day/${date}`);
      if (res.ok) {
        const data = (await res.json()) as { bookings: DayBooking[] };
        setDayBookings(data.bookings ?? []);
      } else {
        setDayBookings([]);
      }
    },
    [authed],
  );

  const rulesByDate = useMemo(() => {
    const map = new Map<string, CalendarRule[]>();
    for (const r of rules) {
      if (!r.active) continue;
      map.set(r.rule_date, [...(map.get(r.rule_date) ?? []), r]);
    }
    return map;
  }, [rules]);

  const gridKeys = useMemo(() => monthGridKeys(month), [month]);
  const today = todayKey();

  function onDayClick(date: string, shiftKey: boolean) {
    if (mode === "browse") {
      void loadDay(date);
      setAnchor(date);
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && anchor) {
        const [a, b] = [keyMs(anchor), keyMs(date)].sort((x, y) => x - y);
        for (let t = a; t <= b; t += dayMs) next.add(toKey(t));
      } else if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
    if (!shiftKey) setAnchor(date);
  }

  function openCreate(kind: RuleKind) {
    setForm({ ...emptyForm(), kind, label: DEFAULT_LABELS[kind] });
    if (selected.size === 0) {
      setRangeFrom(today);
      setRangeTo(today);
      setWeekdays(new Set());
    }
    setCreateOpen(true);
  }

  /** The dates the create modal will submit (selection ∩ weekday filter, or
   *  the range — the API expands ranges server-side). */
  const selectionDates = useMemo(() => {
    const all = Array.from(selected).sort();
    if (weekdays.size === 0) return all;
    return all.filter((d) => weekdays.has(new Date(`${d}T12:00:00Z`).getUTCDay()));
  }, [selected, weekdays]);

  async function submitCreate() {
    const usingSelection = selected.size > 0;
    if (usingSelection && selectionDates.length === 0) {
      toast.error("The weekday filter removes every selected date.");
      return;
    }
    if (!usingSelection && (!rangeFrom || !rangeTo)) {
      toast.error("Choose a start and end date.");
      return;
    }
    const body: Record<string, unknown> = {
      kind: form.kind,
      serviceAreaId: form.serviceAreaId || null,
      label: form.label.trim() || DEFAULT_LABELS[form.kind],
      reason: form.reason.trim() || undefined,
    };
    if (usingSelection) body.dates = selectionDates;
    else {
      body.startDate = rangeFrom;
      body.endDate = rangeTo;
      if (weekdays.size > 0) body.weekdays = Array.from(weekdays);
    }
    if (form.kind === "price_adjustment") {
      const sign = form.direction === "decrease" ? -1 : 1;
      body.adjustmentType = form.adjustmentType;
      body.adjustmentValue =
        form.adjustmentType === "percent"
          ? sign * Math.abs(Math.round(form.percentValue))
          : sign * Math.abs(form.flatCents ?? 0);
      if (!body.adjustmentValue) {
        toast.error("Enter a non-zero adjustment amount.");
        return;
      }
    }
    if (form.kind === "coupon") {
      body.couponKind = form.couponKind;
      body.couponValue =
        form.couponKind === "percent_off"
          ? Math.abs(Math.round(form.couponPercent))
          : Math.abs(form.couponCents ?? 0);
      if (!body.couponValue) {
        toast.error("Enter a coupon value.");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await authed("/admin/calendar/rules", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        created?: number;
        skipped?: number;
        message?: string;
      };
      if (!res.ok) {
        toast.error(data.message ?? "Could not create the rules.");
        return;
      }
      toast.success(
        `Applied to ${data.created ?? 0} date${(data.created ?? 0) === 1 ? "" : "s"}` +
          ((data.skipped ?? 0) > 0 ? ` (${data.skipped} already covered)` : ""),
      );
      setCreateOpen(false);
      setSelected(new Set());
      setWeekdays(new Set());
      await load();
      if (panelDate) await loadDay(panelDate);
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit() {
    if (!editRule) return;
    const body: Record<string, unknown> = {
      label: editRule.label.trim(),
      reason: editRule.reason?.trim() || null,
      active: editRule.active,
    };
    if (editRule.kind === "price_adjustment") {
      body.adjustmentType = editRule.adjustment_type;
      body.adjustmentValue = editRule.adjustment_value;
    }
    if (editRule.kind === "coupon") {
      body.couponKind = editRule.coupon_kind;
      body.couponValue = editRule.coupon_value;
    }
    setSaving(true);
    try {
      const res = await authed(`/admin/calendar/rules/${editRule.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        toast.error(data.message ?? "Could not update the rule.");
        return;
      }
      toast.success("Rule updated.");
      setEditRule(null);
      await load();
      if (panelDate) await loadDay(panelDate);
    } finally {
      setSaving(false);
    }
  }

  async function runConfirmAction() {
    if (!confirmAction) return;
    const { verb, ids } = confirmAction;
    setSaving(true);
    try {
      const res = await authed(`/admin/calendar/rules/bulk-${verb === "delete" ? "delete" : "deactivate"}`, {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        toast.error(`Could not ${verb} the rules.`);
        return;
      }
      toast.success(verb === "delete" ? "Rules deleted." : "Rules deactivated.");
      setConfirmAction(null);
      setSelected(new Set());
      await load();
      if (panelDate) await loadDay(panelDate);
    } finally {
      setSaving(false);
    }
  }

  /** Active rule ids across the current selection (for bulk deactivate/delete). */
  const selectedRuleIds = useMemo(() => {
    const ids: string[] = [];
    for (const d of selected) for (const r of rulesByDate.get(d) ?? []) ids.push(r.id);
    return ids;
  }, [selected, rulesByDate]);

  const areaOptions = [
    { value: "", label: "Platform-wide (all areas)" },
    ...areas.map((a) => ({ value: a.id, label: `${a.name}${a.status === "live" ? "" : " (upcoming)"}` })),
  ];

  const panelRules = panelDate ? rules.filter((r) => r.rule_date === panelDate) : [];

  return (
    <DashboardShell
      title="Booking Calendar"
      description="Block dates, apply date-specific pricing, or run date promotions. Blocks stop new bookings only: existing bookings on a blocked date appear below as conflicts to resolve manually."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <Button onClick={() => openCreate("block")}>
            <CalendarRange className="mr-1.5 h-4 w-4" /> New rule
          </Button>
        </div>
      }
    >
      {/* Month nav + mode toggle */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="min-w-[170px] text-center text-lg font-bold text-charcoal dark:text-white">
            {monthLabel(month)}
          </h2>
          <button
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Next month"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <Button variant="ghost" onClick={() => setMonth(todayKey().slice(0, 7))}>
            Today
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
            {(["browse", "select"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  if (m === "browse") setSelected(new Set());
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  mode === m
                    ? "bg-seafoam-700 text-white"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                {m === "browse" ? "Browse" : "Select dates"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-seafoam-300 bg-seafoam-50 px-3 py-2 dark:border-seafoam-900 dark:bg-seafoam-900/20">
          <span className="text-sm font-semibold text-charcoal dark:text-white">
            {selected.size} date{selected.size === 1 ? "" : "s"} selected
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">Shift-click extends a range.</span>
          <span className="mx-1 h-4 w-px bg-seafoam-300 dark:bg-seafoam-800" />
          <Button variant="ghost" onClick={() => openCreate("block")}>
            <Ban className="mr-1 h-3.5 w-3.5" /> Block
          </Button>
          <Button variant="ghost" onClick={() => openCreate("price_adjustment")}>
            <BadgePercent className="mr-1 h-3.5 w-3.5" /> Price adjustment
          </Button>
          <Button variant="ghost" onClick={() => openCreate("coupon")}>
            <Ticket className="mr-1 h-3.5 w-3.5" /> Coupon
          </Button>
          {selectedRuleIds.length > 0 && (
            <>
              <span className="mx-1 h-4 w-px bg-seafoam-300 dark:bg-seafoam-800" />
              <Button
                variant="ghost"
                onClick={() => setConfirmAction({ verb: "deactivate", ids: selectedRuleIds })}
              >
                Deactivate rules ({selectedRuleIds.length})
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirmAction({ verb: "delete", ids: selectedRuleIds })}
              >
                Delete rules
              </Button>
            </>
          )}
          <span className="flex-1" />
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        {/* Month grid */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
            {WEEKDAY_NAMES.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {gridKeys.map((date) => {
              const inMonth = date.slice(0, 7) === month;
              const past = date < today;
              const dayRules = rulesByDate.get(date) ?? [];
              const hasBlock = dayRules.some((r) => r.kind === "block");
              const conflictCount = conflicts[date] ?? 0;
              const isSelected = selected.has(date);
              const isPanel = panelDate === date;
              return (
                <button
                  key={date}
                  onClick={(e) => onDayClick(date, e.shiftKey)}
                  className={`relative flex min-h-[88px] flex-col items-start rounded-lg border p-1.5 text-left transition-colors ${
                    isSelected
                      ? "border-seafoam-500 ring-2 ring-seafoam-400/60"
                      : isPanel
                        ? "border-seafoam-400"
                        : date === today
                          ? "border-seafoam-400 bg-seafoam-50 dark:bg-seafoam-900/20"
                          : "border-slate-100 hover:border-seafoam-300 dark:border-slate-800"
                  } ${hasBlock && !isSelected ? "bg-red-50/60 dark:bg-red-900/10" : ""} ${
                    past ? "opacity-50" : ""
                  } ${!inMonth ? "opacity-30" : ""}`}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="text-xs font-semibold text-charcoal dark:text-white">
                      {Number(date.slice(8, 10))}
                    </span>
                    {hasBlock && conflictCount > 0 && (
                      <span
                        title={`${conflictCount} existing booking${conflictCount === 1 ? "" : "s"} on this blocked date`}
                        className="inline-flex items-center gap-0.5 rounded-full bg-red-600 px-1.5 text-[10px] font-semibold leading-4 text-white"
                      >
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {conflictCount}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 flex w-full flex-col gap-0.5 overflow-hidden">
                    {dayRules.slice(0, 3).map((r) => (
                      <span
                        key={r.id}
                        title={`${KIND_LABEL[r.kind]}: ${r.label}${r.service_area_name ? ` (${r.service_area_name})` : " (platform-wide)"}`}
                        className={`w-full truncate rounded px-1 text-[9px] font-medium ${
                          r.kind === "block"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                            : r.kind === "price_adjustment"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                              : "bg-seafoam-50 text-seafoam-700 dark:bg-seafoam-900/40 dark:text-seafoam-400"
                        }`}
                      >
                        {r.kind === "block" ? "Blocked" : ruleValueText(r)}
                        {r.service_area_name ? ` · ${r.service_area_name}` : ""}
                      </span>
                    ))}
                    {dayRules.length > 3 && (
                      <span className="text-[9px] text-slate-400">+{dayRules.length - 3} more</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Blocked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Price adjustment
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-seafoam-500" /> Coupon
            </span>
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-red-600" /> Existing bookings on a blocked date
            </span>
          </div>
        </div>

        {/* Day panel */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          {!panelDate ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {mode === "browse"
                ? "Click a date to see its rules and bookings."
                : "Switch to Browse to inspect a date, or keep selecting dates for a bulk action."}
            </p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">
                    {new Date(`${panelDate}T12:00:00Z`).toLocaleDateString("en-US", {
                      weekday: "long",
                      timeZone: "UTC",
                    })}
                  </p>
                  <h3 className="text-lg font-bold text-charcoal dark:text-white">
                    {new Date(`${panelDate}T12:00:00Z`).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setPanelDate(null);
                    setDayBookings(null);
                  }}
                  className="text-sm text-slate-400 hover:text-slate-600"
                >
                  Close
                </button>
              </div>

              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Rules
              </p>
              {panelRules.length === 0 ? (
                <p className="mb-4 text-sm text-slate-400">No rules on this date.</p>
              ) : (
                <div className="mb-4 space-y-2">
                  {panelRules.map((r) => (
                    <div
                      key={r.id}
                      className={`rounded-xl border px-3 py-2 ${
                        r.active
                          ? "border-slate-200 dark:border-slate-700"
                          : "border-dashed border-slate-200 opacity-60 dark:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-charcoal dark:text-white">
                            {r.label}
                          </p>
                          <p className="text-xs text-slate-500">
                            {KIND_LABEL[r.kind]} · {ruleValueText(r)} ·{" "}
                            {r.service_area_name ?? "Platform-wide"}
                            {!r.active && " · Inactive"}
                          </p>
                          {r.reason && (
                            <p className="mt-0.5 text-xs italic text-slate-400">{r.reason}</p>
                          )}
                        </div>
                        <button
                          onClick={() => setEditRule({ ...r })}
                          className="shrink-0 text-xs font-medium text-seafoam-700 hover:underline"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Bookings on this date
              </p>
              {dayBookings === null ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                  ))}
                </div>
              ) : dayBookings.length === 0 ? (
                <p className="text-sm text-slate-400">No bookings fall on this date.</p>
              ) : (
                <div className="space-y-2">
                  {dayBookings.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => navigate(`/jobs/${b.id}`)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition-colors hover:border-seafoam-300 ${
                        b.conflictsWithBlock
                          ? "border-red-200 bg-red-50/60 dark:border-red-900/40 dark:bg-red-900/10"
                          : "border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-charcoal dark:text-white">
                          {b.customerName || "Customer"}
                        </span>
                        <Badge variant={STATUS_VARIANT[b.status] ?? "default"}>
                          {b.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {b.arrivalWindowStart ? `Arrives ${b.arrivalWindowStart}` : "Exact time"} ·{" "}
                        {b.serviceType.replace(/_/g, " ")}
                        {b.totalPriceCents != null ? ` · ${dollars(b.totalPriceCents)}` : ""}
                        {b.serviceAreaName ? ` · ${b.serviceAreaName}` : ""}
                      </p>
                      {b.conflictsWithBlock && (
                        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                          <AlertTriangle className="h-3 w-3" /> On a blocked date. Review manually.
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create (bulk) modal */}
      <Modal
        open={createOpen}
        onOpenChange={(o) => !saving && setCreateOpen(o)}
        title={`New ${KIND_LABEL[form.kind].toLowerCase()} rule`}
        description={
          selected.size > 0
            ? `Applies to ${selectionDates.length} selected date${selectionDates.length === 1 ? "" : "s"}.`
            : "Applies to every matching date in the range."
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submitCreate()} disabled={saving}>
              {saving ? "Applying…" : "Apply"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Rule type</label>
            <Select
              options={[
                { value: "block", label: "Block (no new bookings)" },
                { value: "price_adjustment", label: "Price adjustment" },
                { value: "coupon", label: "Automatic coupon" },
              ]}
              value={form.kind}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  kind: e.target.value as RuleKind,
                  label:
                    !f.label || f.label === DEFAULT_LABELS[f.kind]
                      ? DEFAULT_LABELS[e.target.value as RuleKind]
                      : f.label,
                }))
              }
            />
          </div>

          {selected.size === 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
                <input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Limit to weekdays <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <div className="flex gap-1.5">
              {WEEKDAY_NAMES.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  onClick={() =>
                    setWeekdays((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                    weekdays.has(i)
                      ? "bg-seafoam-700 text-white"
                      : "border border-slate-200 text-slate-500 hover:border-seafoam-300 dark:border-slate-700"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Service area</label>
            <Select
              options={areaOptions}
              value={form.serviceAreaId}
              onChange={(e) => setForm((f) => ({ ...f, serviceAreaId: e.target.value }))}
            />
            <p className="mt-1 text-xs text-slate-400">
              Platform-wide applies everywhere. An area rule overrides a platform-wide rule of the
              same type on the same date.
            </p>
          </div>

          {form.kind === "price_adjustment" && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Direction</label>
                <Select
                  options={[
                    { value: "increase", label: "Increase" },
                    { value: "decrease", label: "Decrease" },
                  ]}
                  value={form.direction}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, direction: e.target.value as RuleForm["direction"] }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Type</label>
                <Select
                  options={[
                    { value: "percent", label: "Percent" },
                    { value: "flat", label: "Flat amount" },
                  ]}
                  value={form.adjustmentType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      adjustmentType: e.target.value as RuleForm["adjustmentType"],
                    }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Amount</label>
                {form.adjustmentType === "percent" ? (
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={300}
                      value={form.percentValue}
                      onChange={(e) => setForm((f) => ({ ...f, percentValue: Number(e.target.value) }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-7 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      %
                    </span>
                  </div>
                ) : (
                  <DollarInput
                    cents={form.flatCents}
                    onCents={(cents) => setForm((f) => ({ ...f, flatCents: cents }))}
                    allowEmpty
                    placeholder="25.00"
                  />
                )}
              </div>
              <p className="col-span-3 -mt-1 text-xs text-slate-400">
                Applied to the pre-tax service subtotal and shown to the customer as a labeled line
                on their quote.
              </p>
            </div>
          )}

          {form.kind === "coupon" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Coupon type</label>
                <Select
                  options={[
                    { value: "percent_off", label: "Percent off" },
                    { value: "amount_off", label: "Amount off" },
                  ]}
                  value={form.couponKind}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, couponKind: e.target.value as RuleForm["couponKind"] }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Value</label>
                {form.couponKind === "percent_off" ? (
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={form.couponPercent}
                      onChange={(e) => setForm((f) => ({ ...f, couponPercent: Number(e.target.value) }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-7 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      %
                    </span>
                  </div>
                ) : (
                  <DollarInput
                    cents={form.couponCents}
                    onCents={(cents) => setForm((f) => ({ ...f, couponCents: cents }))}
                    allowEmpty
                    placeholder="20.00"
                  />
                )}
              </div>
              <p className="col-span-2 -mt-1 text-xs text-slate-400">
                Customers booking a matching date receive this as a one-time coupon. If they already
                hold a better coupon, the better one applies instead. One claim per customer per
                rule.
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              {form.kind === "block" ? "Label (internal)" : "Label (shown to customers)"}
            </label>
            <input
              type="text"
              maxLength={120}
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Internal note <span className="font-normal text-slate-400">(never shown to customers)</span>
            </label>
            <textarea
              rows={2}
              maxLength={1000}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal
        open={editRule !== null}
        onOpenChange={(o) => !saving && !o && setEditRule(null)}
        title={editRule ? `Edit ${KIND_LABEL[editRule.kind].toLowerCase()}` : ""}
        description={
          editRule
            ? `${editRule.rule_date} · ${editRule.service_area_name ?? "Platform-wide"}`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditRule(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submitEdit()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        {editRule && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Label</label>
              <input
                type="text"
                maxLength={120}
                value={editRule.label}
                onChange={(e) => setEditRule((r) => (r ? { ...r, label: e.target.value } : r))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>

            {editRule.kind === "price_adjustment" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Type</label>
                  <Select
                    options={[
                      { value: "percent", label: "Percent" },
                      { value: "flat", label: "Flat amount" },
                    ]}
                    value={editRule.adjustment_type ?? "percent"}
                    onChange={(e) =>
                      setEditRule((r) =>
                        r ? { ...r, adjustment_type: e.target.value as "percent" | "flat" } : r,
                      )
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    {editRule.adjustment_type === "flat" ? "Amount (negative = discount)" : "Percent (negative = discount)"}
                  </label>
                  {editRule.adjustment_type === "flat" ? (
                    <DollarInput
                      cents={
                        editRule.adjustment_value != null
                          ? Math.abs(editRule.adjustment_value)
                          : null
                      }
                      onCents={(cents) =>
                        setEditRule((r) =>
                          r
                            ? {
                                ...r,
                                adjustment_value:
                                  cents == null
                                    ? null
                                    : (r.adjustment_value ?? 0) < 0
                                      ? -Math.abs(cents)
                                      : Math.abs(cents),
                              }
                            : r,
                        )
                      }
                    />
                  ) : (
                    <input
                      type="number"
                      min={-90}
                      max={300}
                      value={editRule.adjustment_value ?? 0}
                      onChange={(e) =>
                        setEditRule((r) =>
                          r ? { ...r, adjustment_value: Number(e.target.value) } : r,
                        )
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  )}
                </div>
                {editRule.adjustment_type === "flat" && (
                  <div className="col-span-2">
                    <Select
                      options={[
                        { value: "increase", label: "Increase price" },
                        { value: "decrease", label: "Decrease price" },
                      ]}
                      value={(editRule.adjustment_value ?? 0) < 0 ? "decrease" : "increase"}
                      onChange={(e) =>
                        setEditRule((r) =>
                          r
                            ? {
                                ...r,
                                adjustment_value:
                                  e.target.value === "decrease"
                                    ? -Math.abs(r.adjustment_value ?? 0)
                                    : Math.abs(r.adjustment_value ?? 0),
                              }
                            : r,
                        )
                      }
                    />
                  </div>
                )}
              </div>
            )}

            {editRule.kind === "coupon" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Coupon type</label>
                  <Select
                    options={[
                      { value: "percent_off", label: "Percent off" },
                      { value: "amount_off", label: "Amount off" },
                    ]}
                    value={editRule.coupon_kind ?? "percent_off"}
                    onChange={(e) =>
                      setEditRule((r) =>
                        r
                          ? { ...r, coupon_kind: e.target.value as "percent_off" | "amount_off" }
                          : r,
                      )
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Value</label>
                  {editRule.coupon_kind === "amount_off" ? (
                    <DollarInput
                      cents={editRule.coupon_value}
                      onCents={(cents) =>
                        setEditRule((r) => (r ? { ...r, coupon_value: cents } : r))
                      }
                    />
                  ) : (
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={editRule.coupon_value ?? 10}
                      onChange={(e) =>
                        setEditRule((r) => (r ? { ...r, coupon_value: Number(e.target.value) } : r))
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Internal note</label>
              <textarea
                rows={2}
                maxLength={1000}
                value={editRule.reason ?? ""}
                onChange={(e) => setEditRule((r) => (r ? { ...r, reason: e.target.value } : r))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-charcoal dark:text-white">
              <input
                type="checkbox"
                checked={editRule.active}
                onChange={(e) => setEditRule((r) => (r ? { ...r, active: e.target.checked } : r))}
                className="h-4 w-4 rounded border-slate-300"
              />
              Active
            </label>
          </div>
        )}
      </Modal>

      {/* Bulk deactivate/delete confirmation */}
      <Modal
        open={confirmAction !== null}
        onOpenChange={(o) => !saving && !o && setConfirmAction(null)}
        title={confirmAction?.verb === "delete" ? "Delete rules" : "Deactivate rules"}
        description={
          confirmAction
            ? `${confirmAction.ids.length} rule${confirmAction.ids.length === 1 ? "" : "s"} across the selected dates will be ${
                confirmAction.verb === "delete" ? "permanently deleted" : "deactivated"
              }.`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmAction(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void runConfirmAction()} disabled={saving}>
              {saving ? "Working…" : confirmAction?.verb === "delete" ? "Delete" : "Deactivate"}
            </Button>
          </div>
        }
      />
    </DashboardShell>
  );
}
