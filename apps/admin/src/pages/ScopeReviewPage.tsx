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
import { useNavigate } from "react-router-dom";
import { Telescope, RefreshCw } from "lucide-react";
import { DashboardShell, Badge, Select, TableSkeleton, EmptyState } from "@sweepr/ui";
import { DataTable, type Column } from "../components/DataTable";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface ScopeReviewRow {
  id: string;
  bookingId: string;
  requestType: "additional_attention" | "refusal";
  status: string;
  aiConfidence: number | null;
  aiRecommendation: string | null;
  feeCode: string | null;
  feeAmountCents: number | null;
  createdAt: string;
  expiresAt: string | null;
  customerName: string | null;
  cleanerName: string | null;
  totalPrice: number | null;
}

const STATUS_OPTIONS = [
  { value: "pending_admin", label: "Pending admin" },
  { value: "", label: "All statuses" },
  { value: "pending_ai", label: "Pending AI" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
  { value: "hard_denied", label: "Hard denied" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "additional_attention", label: "Additional Attention" },
  { value: "refusal", label: "Refusal" },
];

const STATUS_VARIANT: Record<string, "info" | "warning" | "success" | "error" | "default"> = {
  pending_ai: "info",
  pending_admin: "warning",
  approved: "success",
  denied: "error",
  hard_denied: "error",
  expired: "default",
  cancelled: "default",
};

/** Human labels so no raw enum ("hard_denied", "pending_ai") renders. */
const STATUS_LABEL: Record<string, string> = {
  pending_ai: "Pending AI",
  pending_admin: "Pending admin",
  approved: "Approved",
  denied: "Denied",
  hard_denied: "Hard denied",
  expired: "Expired",
  cancelled: "Cancelled",
};

const AI_RECOMMENDATION_LABEL: Record<string, string> = {
  strong_approve: "Strong approve",
  approve: "Approve",
  review: "Needs review",
  deny: "Deny",
  hard_deny: "Hard deny",
};

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400">, </span>;
  const pct = value <= 1 ? value * 100 : value;
  let variant: "success" | "warning" | "info" | "error" = "error";
  if (pct >= 95) variant = "success";
  else if (pct >= 75) variant = "warning";
  else if (pct >= 50) variant = "info";
  return <Badge variant={variant}>{pct.toFixed(0)}%</Badge>;
}

export function ScopeReviewPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ScopeReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("pending_admin");
  const [type, setType] = useState("");

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
  }, [getToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (type) params.set("type", type);
      const qs = params.toString();
      const res = await authed(`/scope-review/admin/requests${qs ? `?${qs}` : ""}`);
      if (res.ok) setRows(((await res.json()) as { requests: ScopeReviewRow[] }).requests ?? []);
    } finally {
      setLoading(false);
    }
  }, [authed, status, type]);

  useEffect(() => { void load(); }, [load]);

  const columns: Column<ScopeReviewRow>[] = [
    { header: "Created", cell: (r) => new Date(r.createdAt).toLocaleString() },
    {
      header: "Type",
      cell: (r) => (
        <Badge variant={r.requestType === "refusal" ? "error" : "info"}>
          {r.requestType === "refusal" ? "Refusal" : "Additional Attention"}
        </Badge>
      ),
    },
    { header: "Booking", cell: (r) => <span className="font-mono text-xs">{r.bookingId.slice(0, 8)}</span> },
    { header: "Customer", cell: (r) => r.customerName ?? ", " },
    { header: "Cleaner", cell: (r) => r.cleanerName ?? ", " },
    { header: "AI confidence", cell: (r) => <ConfidenceBadge value={r.aiConfidence} /> },
    { header: "AI recommendation", cell: (r) => r.aiRecommendation
      ? (AI_RECOMMENDATION_LABEL[r.aiRecommendation] ?? r.aiRecommendation.replace(/_/g, " "))
      : ", " },
    { header: "Status", cell: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? "default"}>{STATUS_LABEL[r.status] ?? r.status.replace(/_/g, " ")}</Badge> },
    { header: "Expires", cell: (r) => (r.expiresAt ? new Date(r.expiresAt).toLocaleString() : ", ") },
  ];

  return (
    <DashboardShell
      title="Scope Review"
      description="AI-triaged additional attention fee and service refusal requests raised by cleaners."
      actions={
        <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      }
    >
      <div className="mb-4 flex gap-3">
        <div className="w-56">
          <Select options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
        </div>
        <div className="w-56">
          <Select options={TYPE_OPTIONS} value={type} onChange={(e) => setType(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <TableSkeleton cols={columns.length} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Telescope className="h-10 w-10 text-seafoam-500" />}
          title="No requests"
          description="Nothing matches the current filters."
        />
      ) : (
        <div onClick={(e) => {
          const tr = (e.target as HTMLElement).closest("tr");
          if (!tr) return;
          const idx = Array.from(tr.parentElement?.children ?? []).indexOf(tr);
          const row = rows[idx];
          if (row) navigate(`/scope-review/${row.id}`);
        }} className="cursor-pointer">
          <DataTable columns={columns} rows={rows} />
        </div>
      )}
    </DashboardShell>
  );
}
