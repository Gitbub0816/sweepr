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
import { Card, Button, Input, Modal, toast } from "@sweepr/ui";
import { MapPin, Home, KeyRound, Trash2, Plus, Star } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface SavedAddress {
  id: string;
  label: string | null;
  line1: string;
  city: string;
  state: string;
  zip: string;
  isDefault: boolean;
  propertyType: "home" | "short_term_rental" | string;
}

/**
 * Address book in customer settings. Each address is tagged home or short-term
 * rental and can carry an optional name; the booking flow uses these to ask
 * which one when more than one exists.
 */
export function AddressBook() {
  const { getToken } = useAppToken();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<SavedAddress | null>(null);
  const [deleting, setDeleting] = useState(false);

  const authed = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await getToken();
      return fetch(`${API_URL}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers as Record<string, string>) },
      });
    },
    [getToken],
  );

  const refresh = useCallback(async () => {
    const res = await authed("/customer-profile/addresses");
    if (res.ok) setAddresses((await res.json()).addresses);
    setLoading(false);
  }, [authed]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function patch(id: string, body: Record<string, unknown>) {
    await authed(`/customer-profile/addresses/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    refresh();
  }
  async function remove(id: string) {
    await authed(`/customer-profile/addresses/${id}`, { method: "DELETE" });
    refresh();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await remove(deleteTarget.id);
      toast.success("Address deleted");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-charcoal dark:text-white">Your addresses</p>
        {!adding && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        )}
      </div>

      {loading ? (
        <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : addresses.length === 0 && !adding ? (
        <p className="text-sm text-slate-500">No saved addresses yet.</p>
      ) : (
        addresses.map((a) => (
          <div key={a.id} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-seafoam-500" />
              <div className="flex-1">
                {a.label && <p className="text-sm font-semibold text-charcoal dark:text-white">{a.label}</p>}
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {[a.line1, a.city, a.state, a.zip].filter(Boolean).join(", ")}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <TypeToggle
                    value={a.propertyType === "short_term_rental" ? "short_term_rental" : "home"}
                    onChange={(pt) => patch(a.id, { propertyType: pt })}
                  />
                  {a.isDefault ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-seafoam-700 dark:text-seafoam-300">
                      <Star className="h-3 w-3 fill-current" /> Default
                    </span>
                  ) : (
                    <button className="text-xs text-slate-500 hover:text-seafoam-700" onClick={() => patch(a.id, { makeDefault: true })}>
                      Set default
                    </button>
                  )}
                  <button
                    className="ml-auto text-slate-400 transition-transform hover:text-red-500 active:scale-95"
                    onClick={() => setDeleteTarget(a)}
                    aria-label="Delete address"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))
      )}

      {adding && <AddAddressForm authed={authed} onDone={() => { setAdding(false); refresh(); }} onCancel={() => setAdding(false)} />}

      <Modal
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete this address?"
        description={
          deleteTarget
            ? `${[deleteTarget.label, deleteTarget.line1].filter(Boolean).join(" · ")} will be removed from your saved addresses. This can't be undone.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting}>Delete</Button>
          </>
        }
      />
    </Card>
  );
}

function TypeToggle({ value, onChange }: { value: "home" | "short_term_rental"; onChange: (v: "home" | "short_term_rental") => void }) {
  const optionCls = (active: boolean) =>
    `flex items-center gap-1 px-2 py-1 transition-colors duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${
      active
        ? "bg-seafoam-50 text-seafoam-700 dark:bg-seafoam-900/20 dark:text-seafoam-300"
        : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
    }`;
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs dark:border-slate-700">
      <button
        type="button"
        aria-pressed={value === "home"}
        onClick={() => onChange("home")}
        className={optionCls(value === "home")}
      >
        <Home className="h-3 w-3" /> Home
      </button>
      <button
        type="button"
        aria-pressed={value === "short_term_rental"}
        onClick={() => onChange("short_term_rental")}
        className={optionCls(value === "short_term_rental")}
      >
        <KeyRound className="h-3 w-3" /> Rental
      </button>
    </div>
  );
}

type Authed = (path: string, init?: RequestInit) => Promise<Response>;

function AddAddressForm({ authed, onDone, onCancel }: { authed: Authed; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ label: "", street: "", city: "", state: "", zip: "", propertyType: "home" as "home" | "short_term_rental" });
  const [saving, setSaving] = useState(false);
  const valid = f.street.length >= 3 && f.city && f.state.length === 2 && /^\d{5}/.test(f.zip);

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await authed("/customer-profile/addresses", {
        method: "POST",
        body: JSON.stringify({
          street: f.street, city: f.city, state: f.state.toUpperCase(), zip: f.zip,
          label: f.label || undefined, propertyType: f.propertyType,
        }),
      });
      if (!res.ok) throw new Error("Couldn't save address");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
      <TypeToggle value={f.propertyType} onChange={(pt) => setF({ ...f, propertyType: pt })} />
      <Input label="Name (optional)" placeholder="Beach condo" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
      <Input label="Street" value={f.street} onChange={(e) => setF({ ...f, street: e.target.value })} />
      <div className="grid grid-cols-3 gap-2">
        <Input label="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        <Input label="State" placeholder="CA" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} />
        <Input label="ZIP" value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving || !valid}>{saving ? "Saving…" : "Save address"}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
