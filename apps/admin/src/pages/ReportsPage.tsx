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
 * User Reports — Trust & Safety investigation queue over the formal
 * customer↔cleaner reporting system (booking-scoped). Rows open the
 * investigation detail view (/reports/:id).
 */

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router";
import { Flag, RefreshCw } from "lucide-react";
import { DashboardShell, Badge, Select, TableSkeleton, EmptyState } from "@sweepr/ui";
import { DataTable, type Column } from "../components/DataTable";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface ReportRow {
  id: string;
  reference: string;
  bookingId: string;
  reporterRole: "customer" | "cleaner";
  category: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  resolutionAction: string | null;
  bookingStatus: string;
  scheduledAt: string | null;
  photoCount: number;
  reporterName: string | null;
  reportedName: string | null;
}

const STATUS_OPTIONS = [
  { value: "submitted", label: "Submitted (new)" },
  { value: "under_review", label: "Under review" },
  { value: "", label: "All statuses" },
  { value: "action_taken", label: "Action taken" },
  { value: "dismissed", label: "Dismissed" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  { value: "safety_concern", label: "Safety concern" },
  { value: "property_damage", label: "Property damage" },
  { value: "theft", label: "Theft" },
  { value: "harassment", label: "Harassment" },
  { value: "no_show", label: "No-show" },
  { value: "unprofessional_conduct", label: "Unprofessional conduct" },
  { value: "payment_dispute", label: "Payment dispute" },
  { value: "other", label: "Other" },
];

const ROLE_OPTIONS = [
  { value: "", label: "All reporters" },
  { value: "customer", label: "Filed by customer" },
  { value: "cleaner", label: "Filed by cleaner" },
];

export const REPORT_STATUS_VARIANT: Record<string, "info" | "warning" | "success" | "error" | "default"> = {
  submitted: "info",
  under_review: "warning",
  action_taken: "success",
  dismissed: "default",
};

/** Human labels so no raw enum ("action_taken") renders. */
export const REPORT_STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  action_taken: "Action taken",
  dismissed: "Dismissed",
};

export const REPORT_CATEGORY_LABEL: Record<string, string> = {
  safety_concern: "Safety concern",
  property_damage: "Property damage",
  theft: "Theft",
  harassment: "Harassment",
  no_show: "No-show",
  unprofessional_conduct: "Unprofessional conduct",
  payment_dispute: "Payment dispute",
  other: "Other",
};

const SEVERE_CATEGORIES = new Set(["safety_concern", "theft", "harassment"]);

export function ReportsPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("submitted");
  const [category, setCategory] = useState("");
  const [role, setRole] = useState("");

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
      if (category) params.set("category", category);
      if (role) params.set("role", role);
      const qs = params.toString();
      const res = await authed(`/admin/reports${qs ? `?${qs}` : ""}`);
      if (res.ok) setRows(((await res.json()) as { reports: ReportRow[] }).reports ?? []);
    } finally {
      setLoading(false);
    }
  }, [authed, status, category, role]);

  useEffect(() => { void load(); }, [load]);

  const columns: Column<ReportRow>[] = [
    { header: "Filed", cell: (r) => new Date(r.createdAt).toLocaleString() },
    { header: "Case", cell: (r) => <span className="font-mono text-xs">{r.reference}</span> },
    {
      header: "Category",
      cell: (r) => (
        <Badge variant={SEVERE_CATEGORIES.has(r.category) ? "error" : "default"}>
          {REPORT_CATEGORY_LABEL[r.category] ?? r.category.replace(/_/g, " ")}
        </Badge>
      ),
    },
    {
      header: "Reporter",
      cell: (r) => (
        <span>
          {r.reporterName ?? "Unknown"}{" "}
          <span className="text-xs text-slate-400">({r.reporterRole})</span>
        </span>
      ),
    },
    { header: "Reported", cell: (r) => r.reportedName ?? "Unknown" },
    { header: "Booking", cell: (r) => <span className="font-mono text-xs">{r.bookingId.slice(0, 8)}</span> },
    { header: "Photos", cell: (r) => (r.photoCount > 0 ? r.photoCount : "None") },
    {
      header: "Status",
      cell: (r) => (
        <Badge variant={REPORT_STATUS_VARIANT[r.status] ?? "default"}>
          {REPORT_STATUS_LABEL[r.status] ?? r.status.replace(/_/g, " ")}
        </Badge>
      ),
    },
  ];

  return (
    <DashboardShell
      title="User Reports"
      description="Formal reports customers and cleaners file against the other party on a booking. Review, investigate, and resolve."
      actions={
        <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      }
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="w-52">
          <Select options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
        </div>
        <div className="w-52">
          <Select options={CATEGORY_OPTIONS} value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <div className="w-52">
          <Select options={ROLE_OPTIONS} value={role} onChange={(e) => setRole(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <TableSkeleton cols={columns.length} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Flag className="h-10 w-10 text-seafoam-500" />}
          title="No reports"
          description="Nothing matches the current filters."
        />
      ) : (
        <div
          onClick={(e) => {
            const tr = (e.target as HTMLElement).closest("tr");
            if (!tr) return;
            const idx = Array.from(tr.parentElement?.children ?? []).indexOf(tr);
            const row = rows[idx];
            if (row) navigate(`/reports/${row.id}`);
          }}
          className="cursor-pointer"
        >
          <DataTable columns={columns} rows={rows} />
        </div>
      )}
    </DashboardShell>
  );
}
