import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft, ShieldCheck, IdCard, User as UserIcon } from "lucide-react";
import {
  DashboardShell,
  Card,
  Badge,
  Button,
  Textarea,
  Modal,
  toast,
} from "@sweepr/ui";
import { SERVICE_LABELS, formatDateTime } from "@sweepr/utils";
import type { ServiceType } from "@sweepr/types";

const API_URL = import.meta.env.VITE_API_URL ?? "";

const checkrVariant: Record<string, "success" | "warning" | "info" | "error"> = {
  clear: "success",
  consider: "error",
  submitted: "info",
  pending: "warning",
  not_started: "warning",
};
const diditVariant: Record<string, "success" | "info" | "warning"> = {
  verified: "success",
  submitted: "info",
  pending: "warning",
  not_started: "warning",
};
const kybVariant: Record<string, "success" | "warning" | "error"> = {
  verified: "success",
  pending: "warning",
  not_started: "warning",
  failed: "error",
};

interface Application {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  bio: string | null;
  avatar_url: string | null;
  status: string;
  city: string | null;
  state: string | null;
  max_distance_miles: number | null;
  preferred_service_types: string[] | null;
  checkr_status: string | null;
  didit_status: string | null;
  created_at: string;
  account_type: string | null;
  business_name: string | null;
  business_type: string | null;
  state_of_incorporation: string | null;
  kyb_status: string | null;
  authorized_rep_name: string | null;
  authorized_rep_title: string | null;
}

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [app, setApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/admin/applications/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setApp(((await res.json()) as { application: Application }).application);
    } finally {
      setLoading(false);
    }
  }, [id, getToken]);

  useEffect(() => { void load(); }, [load]);

  async function act(kind: "approve" | "reject") {
    if (!app) return;
    setWorking(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/admin/applications/${app.id}/${kind}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(kind === "reject" ? { reason } : {}),
      });
      if (!res.ok) throw new Error("failed");
      toast.success(
        kind === "approve" ? "Application approved." : "Application rejected."
      );
      navigate("/applications");
    } catch {
      toast.error("Action failed. Try again.");
    } finally {
      setWorking(false);
      setRejectOpen(false);
    }
  }

  if (loading) {
    return (
      <DashboardShell title="Application">
        <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      </DashboardShell>
    );
  }

  if (!app) {
    return (
      <DashboardShell title="Application not found">
        <Button variant="ghost" onClick={() => navigate("/applications")}>
          <ArrowLeft className="h-4 w-4" /> Back to applications
        </Button>
      </DashboardShell>
    );
  }

  const name = [app.first_name, app.last_name].filter(Boolean).join(" ") || app.business_name || "Applicant";
  const basedIn = [app.city, app.state].filter(Boolean).join(", ") || "—";
  const services = (app.preferred_service_types ?? []) as ServiceType[];
  const isBusiness = app.account_type === "business";

  return (
    <DashboardShell
      title={name}
      description={`Application submitted ${formatDateTime(app.created_at)}`}
      actions={
        <Button variant="ghost" onClick={() => navigate("/applications")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="flex items-center gap-4">
              {app.avatar_url ? (
                <img
                  src={app.avatar_url}
                  alt={name}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
                  <UserIcon className="h-7 w-7" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold text-charcoal dark:text-white">
                    {name}
                  </p>
                  {isBusiness && <Badge variant="info">Business Account</Badge>}
                </div>
                <p className="text-sm text-slate-500">{app.email ?? "—"}</p>
                <p className="text-sm text-slate-500">{app.phone ?? "—"}</p>
              </div>
            </div>
            {app.bio && (
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                {app.bio}
              </p>
            )}
          </Card>

          <Card>
            <h3 className="mb-3 font-semibold text-charcoal dark:text-white">
              Service area — {basedIn}
              {app.max_distance_miles ? ` (${app.max_distance_miles} mi)` : ""}
            </h3>
            {services.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {services.map((s) => (
                  <Badge key={s} variant="info">
                    {SERVICE_LABELS[s] ?? s}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No services selected.</p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {isBusiness && (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-charcoal dark:text-white">
                  Business
                </h3>
                {app.kyb_status && (
                  <Badge variant={kybVariant[app.kyb_status] ?? "warning"}>
                    KYB: {app.kyb_status}
                  </Badge>
                )}
              </div>
              <dl className="space-y-2 text-sm">
                <Row label="Name" value={app.business_name} />
                <Row label="Type" value={app.business_type} />
                <Row label="State of incorporation" value={app.state_of_incorporation} />
                {app.authorized_rep_name && (
                  <Row
                    label="Authorized rep"
                    value={`${app.authorized_rep_name}${app.authorized_rep_title ? ` (${app.authorized_rep_title})` : ""}`}
                  />
                )}
              </dl>
            </Card>
          )}
          <Card>
            <h3 className="mb-3 font-semibold text-charcoal dark:text-white">
              Verification
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-500">
                  <ShieldCheck className="h-4 w-4" /> Checkr
                </span>
                <Badge variant={checkrVariant[app.checkr_status ?? "not_started"] ?? "warning"}>
                  {app.checkr_status ?? "not_started"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-500">
                  <IdCard className="h-4 w-4" /> Didit
                </span>
                <Badge variant={diditVariant[app.didit_status ?? "not_started"] ?? "warning"}>
                  {app.didit_status ?? "not_started"}
                </Badge>
              </div>
            </div>
          </Card>

          <Card className="space-y-3">
            <h3 className="font-semibold text-charcoal dark:text-white">Actions</h3>
            <Button fullWidth onClick={() => act("approve")} loading={working}>
              Approve
            </Button>
            <Button
              fullWidth
              variant="danger"
              onClick={() => setRejectOpen(true)}
            >
              Reject
            </Button>
          </Card>
        </div>
      </div>

      <Modal
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject application"
        description="The applicant will be emailed with the reason below."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => act("reject")} loading={working}>
              Confirm rejection
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain why this application is being rejected."
        />
      </Modal>
    </DashboardShell>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-charcoal dark:text-white">
        {value ?? "—"}
      </dd>
    </div>
  );
}
