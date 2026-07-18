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
import { ShieldAlert, RefreshCw } from "lucide-react";
import { DashboardShell, Card, Button, Badge, Select, Input, Textarea, Modal, TableSkeleton, EmptyState, toast } from "@sweepr/ui";
import { DataTable, type Column } from "../components/DataTable";
import { AdjudicationTab } from "../components/AdjudicationTab";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface CustomerRow {
  id: string;
  name: string | null;
  email: string | null;
  accountStatus: string;
  accountStatusReason: string | null;
  accountStatusUntil: string | null;
}

interface GreylistRow {
  id: string;
  streetAddress: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string;
  reason: string | null;
  createdAt: string;
  expiresAt: string | null;
}

interface CleanerPrivRow {
  id: string;
  cleanerId: string;
  name: string | null;
  additionalAttentionEnabled: boolean;
  refusalRequestEnabled: boolean;
  disabledReason: string | null;
  disabledUntil: string | null;
}

const STATUS_VARIANT: Record<string, "info" | "warning" | "success" | "error" | "default"> = {
  normal: "success", investigating: "warning", restricted: "warning", suspended: "error", banned: "error",
};

const STATUS_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "investigating", label: "Investigating" },
  { value: "restricted", label: "Restricted" },
  { value: "suspended", label: "Suspended" },
  { value: "banned", label: "Banned" },
];

type Tab = "customers" | "greylist" | "privileges" | "adjudication";

function useAuthed() {
  const { getToken } = useAuth();
  return useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
  }, [getToken]);
}

function CustomersTab() {
  const authed = useAuthed();
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalRow, setModalRow] = useState<CustomerRow | null>(null);
  const [status, setStatus] = useState("investigating");
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authed("/admin-trust/customers");
      if (res.ok) setRows(((await res.json()) as { customers: CustomerRow[] }).customers ?? []);
    } finally {
      setLoading(false);
    }
  }, [authed]);

  useEffect(() => { void load(); }, [load]);

  function openModal(row: CustomerRow) {
    setModalRow(row);
    setStatus(row.accountStatus === "normal" ? "investigating" : row.accountStatus);
    setReason(row.accountStatusReason ?? "");
    setDays("");
  }

  async function save() {
    if (!modalRow) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { status, reason: reason || undefined };
      if (days) body.days = parseInt(days, 10);
      const res = await authed(`/admin-trust/customers/${modalRow.id}/status`, { method: "POST", body: JSON.stringify(body) });
      if (res.ok) {
        toast.success("Customer status updated.");
        setModalRow(null);
        void load();
      } else {
        toast.error("Could not update status.");
      }
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<CustomerRow>[] = [
    { header: "Name", cell: (r) => r.name ?? ", " },
    { header: "Email", cell: (r) => r.email ?? ", " },
    { header: "Status", cell: (r) => <Badge variant={STATUS_VARIANT[r.accountStatus] ?? "default"}>{r.accountStatus}</Badge> },
    { header: "Reason", cell: (r) => r.accountStatusReason ?? ", " },
    { header: "Until", cell: (r) => (r.accountStatusUntil ? new Date(r.accountStatusUntil).toLocaleDateString() : ", ") },
    { header: "", align: "right", cell: (r) => <Button size="sm" variant="secondary" onClick={() => openModal(r)}>Change status</Button> },
  ];

  return (
    <>
      {loading ? (
        <TableSkeleton cols={columns.length} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ShieldAlert className="h-10 w-10 text-seafoam-500" />} title="No flagged customers" description="No customers currently have a non-normal account status." />
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}

      <Modal
        open={!!modalRow}
        onOpenChange={(o) => !o && setModalRow(null)}
        title="Change account status"
        description={modalRow?.name ?? modalRow?.email ?? undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalRow(null)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select label="Status" options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
          <Textarea label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Input label="Duration in days (optional)" type="number" value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}

function GreylistTab() {
  const authed = useAuthed();
  const [rows, setRows] = useState<GreylistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authed("/admin-trust/greylist");
      if (res.ok) setRows(((await res.json()) as { entries: GreylistRow[] }).entries ?? []);
    } finally {
      setLoading(false);
    }
  }, [authed]);

  useEffect(() => { void load(); }, [load]);

  async function remove() {
    if (!confirmId) return;
    setRemoving(true);
    try {
      const res = await authed(`/admin-trust/greylist/${confirmId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Address removed from greylist.");
        setConfirmId(null);
        void load();
      } else {
        toast.error("Could not remove entry.");
      }
    } finally {
      setRemoving(false);
    }
  }

  const columns: Column<GreylistRow>[] = [
    { header: "Address", cell: (r) => [r.streetAddress, r.unit].filter(Boolean).join(", ") },
    { header: "City/State/Zip", cell: (r) => `${r.city}, ${r.state} ${r.zip}` },
    { header: "Reason", cell: (r) => r.reason ?? ", " },
    { header: "Added", cell: (r) => new Date(r.createdAt).toLocaleDateString() },
    { header: "Expires", cell: (r) => (r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : ", ") },
    { header: "", align: "right", cell: (r) => <Button size="sm" variant="danger" onClick={() => setConfirmId(r.id)}>Remove</Button> },
  ];

  return (
    <>
      {loading ? (
        <TableSkeleton cols={columns.length} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ShieldAlert className="h-10 w-10 text-seafoam-500" />} title="No greylisted addresses" />
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}

      <Modal
        open={!!confirmId}
        onOpenChange={(o) => !o && setConfirmId(null)}
        title="Remove greylist entry"
        description="This address will no longer be flagged for repeated service refusals."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmId(null)}>Cancel</Button>
            <Button variant="danger" onClick={remove} loading={removing}>Remove</Button>
          </>
        }
      >
        <p className="text-sm text-slate-500">Are you sure you want to remove this entry?</p>
      </Modal>
    </>
  );
}

function PrivilegesTab() {
  const authed = useAuthed();
  const [rows, setRows] = useState<CleanerPrivRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authed("/admin-trust/cleaner-privileges");
      if (res.ok) {
        const cleaners = ((await res.json()) as { cleaners: Omit<CleanerPrivRow, "id">[] }).cleaners ?? [];
        setRows(cleaners.map((c) => ({ ...c, id: c.cleanerId })));
      }
    } finally {
      setLoading(false);
    }
  }, [authed]);

  useEffect(() => { void load(); }, [load]);

  async function restore() {
    if (!confirmId) return;
    setRestoring(true);
    try {
      const res = await authed(`/admin-trust/cleaner-privileges/${confirmId}/restore`, { method: "POST" });
      if (res.ok) {
        toast.success("Privileges restored.");
        setConfirmId(null);
        void load();
      } else {
        toast.error("Could not restore privileges.");
      }
    } finally {
      setRestoring(false);
    }
  }

  const columns: Column<CleanerPrivRow>[] = [
    { header: "Cleaner", cell: (r) => r.name ?? r.cleanerId.slice(0, 8) },
    { header: "Additional attention", cell: (r) => <Badge variant={r.additionalAttentionEnabled ? "success" : "error"}>{r.additionalAttentionEnabled ? "enabled" : "disabled"}</Badge> },
    { header: "Refusal requests", cell: (r) => <Badge variant={r.refusalRequestEnabled ? "success" : "error"}>{r.refusalRequestEnabled ? "enabled" : "disabled"}</Badge> },
    { header: "Reason", cell: (r) => r.disabledReason ?? ", " },
    { header: "Until", cell: (r) => (r.disabledUntil ? new Date(r.disabledUntil).toLocaleDateString() : ", ") },
    { header: "", align: "right", cell: (r) => <Button size="sm" variant="secondary" onClick={() => setConfirmId(r.cleanerId)}>Restore</Button> },
  ];

  return (
    <>
      {loading ? (
        <TableSkeleton cols={columns.length} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ShieldAlert className="h-10 w-10 text-seafoam-500" />} title="No disabled privileges" description="No cleaners currently have scope-review privileges disabled." />
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}

      <Modal
        open={!!confirmId}
        onOpenChange={(o) => !o && setConfirmId(null)}
        title="Restore privileges"
        description="Both additional attention and refusal request privileges will be re-enabled for this cleaner."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmId(null)}>Cancel</Button>
            <Button onClick={restore} loading={restoring}>Restore</Button>
          </>
        }
      >
        <p className="text-sm text-slate-500">Are you sure you want to restore this cleaner's privileges?</p>
      </Modal>
    </>
  );
}

export function TrustSafetyPage() {
  const [tab, setTab] = useState<Tab>("customers");
  // Bumping this remounts the active tab, re-running its own load() in place
  // (no full-page reload, which dropped auth/scroll state).
  const [refreshNonce, setRefreshNonce] = useState(0);

  return (
    <DashboardShell
      title="Trust & Safety"
      description="Customer account status, address greylist, cleaner privileges, and background-check adjudication."
      actions={
        <button onClick={() => setRefreshNonce((n) => n + 1)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      }
    >
      <div className="mb-4 flex gap-2 border-b border-slate-200 dark:border-slate-800">
        {([
          ["customers", "Customer statuses"],
          ["greylist", "Address greylist"],
          ["privileges", "Cleaner privileges"],
          ["adjudication", "Adjudication"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? "border-seafoam-600 text-seafoam-700 dark:text-seafoam-400"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div key={refreshNonce}>
        {tab === "customers" && <CustomersTab />}
        {tab === "greylist" && <GreylistTab />}
        {tab === "privileges" && <PrivilegesTab />}
        {tab === "adjudication" && <AdjudicationTab />}
      </div>
    </DashboardShell>
  );
}
