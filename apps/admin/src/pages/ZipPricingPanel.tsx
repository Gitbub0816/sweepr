/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { MapPin, Plus, Trash2, RefreshCw } from "lucide-react";
import { Card, Button, Input, toast } from "@sweepr/ui";
import { DataTable, type Column } from "../components/DataTable";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface ZipMultiplier {
  zip: string;
  multiplierPct: number;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** DataTable requires a stable `id` per row; the ZIP itself is unique. */
type ZipMultiplierRow = ZipMultiplier & { id: string };

/**
 * Admin panel for ZIP-code-specific pricing multipliers. A positive
 * percentage raises a booking's whole total (customer pays more AND the
 * cleaner earns proportionally more); a negative percentage lowers it the
 * same way — this is NOT a fee-only adjustment. See
 * apps/api/src/lib/zipPricing.ts for the exact mechanism.
 */
export function ZipPricingPanel() {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<ZipMultiplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ zip: "", multiplierPct: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
  }, [getToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authed("/admin/zip-pricing");
      if (res.ok) setRows(((await res.json()) as { multipliers: ZipMultiplier[] }).multipliers ?? []);
    } finally {
      setLoading(false);
    }
  }, [authed]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    const zip = form.zip.trim();
    const pct = Number(form.multiplierPct);
    if (!/^\d{5}$/.test(zip)) { toast.error("Enter a 5-digit ZIP code."); return; }
    if (!Number.isFinite(pct) || pct < -90 || pct > 500) { toast.error("Enter a percentage between -90 and 500."); return; }

    setSaving(true);
    try {
      const res = await authed("/admin/zip-pricing", {
        method: "PUT",
        body: JSON.stringify({ zip, multiplierPct: pct, active: true, notes: form.notes.trim() || null }),
      });
      if (res.ok) {
        toast.success(`Saved pricing adjustment for ${zip}.`);
        setForm({ zip: "", multiplierPct: "", notes: "" });
        void load();
      } else {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        toast.error(body?.message ?? "Could not save. Check the ZIP and percentage.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: ZipMultiplier) {
    const res = await authed("/admin/zip-pricing", {
      method: "PUT",
      body: JSON.stringify({ zip: row.zip, multiplierPct: row.multiplierPct, active: !row.active, notes: row.notes }),
    });
    if (res.ok) void load();
    else toast.error("Could not update.");
  }

  async function remove(zip: string) {
    const res = await authed(`/admin/zip-pricing/${zip}`, { method: "DELETE" });
    if (res.ok) { toast.success(`Removed adjustment for ${zip}.`); void load(); }
    else toast.error("Could not remove.");
  }

  const cols: Column<ZipMultiplierRow>[] = [
    { header: "ZIP", cell: (r) => <span className="font-mono font-medium text-charcoal dark:text-white">{r.zip}</span> },
    {
      header: "Adjustment",
      cell: (r) => (
        <span className={r.multiplierPct > 0 ? "text-amber-700 dark:text-amber-400" : r.multiplierPct < 0 ? "text-seafoam-700 dark:text-seafoam-400" : ""}>
          {r.multiplierPct > 0 ? "+" : ""}{r.multiplierPct}%
        </span>
      ),
    },
    { header: "Notes", cell: (r) => <span className="text-slate-500">{r.notes ?? "—"}</span> },
    {
      header: "Status",
      cell: (r) => (
        <button
          onClick={() => void toggleActive(r)}
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.active ? "bg-seafoam-100 text-seafoam-700 dark:bg-seafoam-900/30 dark:text-seafoam-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}
        >
          {r.active ? "Active" : "Inactive"}
        </button>
      ),
    },
    {
      header: "",
      align: "right",
      cell: (r) => (
        <Button size="sm" variant="ghost" onClick={() => void remove(r.zip)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          A positive percentage raises a booking's whole total for that ZIP (the cleaner earns proportionally
          more too); a negative percentage lowers it the same way. This adjusts the base price, not just the
          Marketplace Services Fee.
        </p>
        <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-charcoal dark:text-white">
          <MapPin className="h-4 w-4" /> Add or update a ZIP adjustment
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="ZIP code" placeholder="94541" value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))} />
          <Input label="Adjustment (%)" type="number" placeholder="10 or -10" value={form.multiplierPct} onChange={(e) => setForm((f) => ({ ...f, multiplierPct: e.target.value }))} />
          <Input label="Notes (optional)" placeholder="e.g. high cost-of-service area" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
        <Button size="sm" onClick={() => void save()} loading={saving}>
          <Plus className="h-4 w-4" /> Save adjustment
        </Button>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-charcoal dark:text-white">Configured ZIP codes</h2>
        {rows.length === 0 ? (
          <Card><p className="text-sm text-slate-600 dark:text-slate-400">No ZIP-specific adjustments configured yet.</p></Card>
        ) : (
          <DataTable columns={cols} rows={rows.map((r) => ({ ...r, id: r.zip }))} />
        )}
      </section>
    </div>
  );
}
