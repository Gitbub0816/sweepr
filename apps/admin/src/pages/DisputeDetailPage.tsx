import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft } from "lucide-react";
import {
  DashboardShell,
  Card,
  Badge,
  Button,
  Textarea,
} from "@sweepr/ui";
import { SERVICE_LABELS, formatCurrency, formatDateTime } from "@sweepr/utils";
import type { ServiceType } from "@sweepr/types";
import { toast } from "@sweepr/ui";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface Dispute {
  id: string;
  booking_id: string;
  reason: string | null;
  description: string | null;
  status: string;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
  service_type: string | null;
  scheduled_at: string | null;
  total_price: number | null;
  customer_first: string | null;
  customer_last: string | null;
  customer_email: string | null;
  cleaner_first: string | null;
  cleaner_last: string | null;
}

export function DisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/admin/disputes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = (await res.json()) as { dispute: Dispute };
        setDispute(d.dispute);
        setResolutionNotes(d.dispute.resolution ?? "");
      }
    } finally {
      setLoading(false);
    }
  }, [id, getToken]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <DashboardShell title="Dispute">
        <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      </DashboardShell>
    );
  }

  if (!dispute) {
    return (
      <DashboardShell title="Dispute not found">
        <Button variant="ghost" onClick={() => navigate("/disputes")}>
          <ArrowLeft className="h-4 w-4" /> Back to disputes
        </Button>
      </DashboardShell>
    );
  }

  const customer = [dispute.customer_first, dispute.customer_last].filter(Boolean).join(" ") || dispute.customer_email || "—";
  const cleaner = [dispute.cleaner_first, dispute.cleaner_last].filter(Boolean).join(" ") || "Unassigned";
  const atStake = dispute.total_price ? dispute.total_price / 100 : 0;

  async function resolve(status: "refunded" | "resolved" | "denied") {
    setWorking(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/admin/disputes/${dispute!.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, resolution: resolutionNotes || undefined }),
      });
      if (!res.ok) throw new Error("failed");
      const msg =
        status === "refunded"
          ? "Refunded customer."
          : status === "resolved"
          ? "Resolved in cleaner's favor."
          : "Dispute denied.";
      toast.success(msg);
      navigate("/disputes");
    } catch {
      toast.error("Could not resolve dispute.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <DashboardShell
      title={`Dispute`}
      description={`${dispute.reason ?? "Issue"} · Booking ${dispute.booking_id?.slice(0, 8)}…`}
      actions={
        <Button variant="ghost" onClick={() => navigate("/disputes")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h3 className="mb-3 font-semibold text-charcoal dark:text-white">
              Booking summary
            </h3>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Service" value={dispute.service_type ? SERVICE_LABELS[dispute.service_type as ServiceType] ?? dispute.service_type : "—"} />
              <Detail label="Scheduled" value={dispute.scheduled_at ? formatDateTime(dispute.scheduled_at) : "—"} />
              <Detail label="Customer" value={customer} />
              <Detail label="Cleaner" value={cleaner} />
              <Detail label="Price paid" value={formatCurrency(atStake)} />
              <Detail label="Opened" value={formatDateTime(dispute.created_at)} />
            </dl>
          </Card>

          <Card>
            <h3 className="mb-2 font-semibold text-charcoal dark:text-white">
              Customer's description
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {dispute.description || "No description provided."}
            </p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h3 className="mb-2 font-semibold text-charcoal dark:text-white">
              Status
            </h3>
            <Badge variant={dispute.status === "open" ? "error" : dispute.status === "investigating" ? "warning" : "success"}>
              {dispute.status}
            </Badge>
            {dispute.resolved_at && (
              <p className="mt-2 text-xs text-slate-400">
                Resolved {formatDateTime(dispute.resolved_at)}
              </p>
            )}
          </Card>

          <Card className="space-y-3">
            <h3 className="font-semibold text-charcoal dark:text-white">Resolve</h3>
            <Textarea
              label="Resolution notes"
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Internal notes about how this was resolved."
            />
            <Button fullWidth onClick={() => resolve("refunded")} loading={working}>
              Refund customer ({formatCurrency(atStake)})
            </Button>
            <Button
              fullWidth
              variant="secondary"
              onClick={() => resolve("resolved")}
              loading={working}
            >
              Resolve for cleaner
            </Button>
            <Button
              fullWidth
              variant="ghost"
              onClick={() => resolve("denied")}
              loading={working}
            >
              Deny dispute
            </Button>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="font-medium text-charcoal dark:text-white">{value}</dd>
    </div>
  );
}
