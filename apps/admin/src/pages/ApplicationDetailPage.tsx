import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { SERVICE_LABELS } from "@sweepr/utils";
import { AdminMap } from "../components/AdminMap";
import { adminApplicationDetails } from "../data/mock";

const API_URL = import.meta.env.VITE_API_URL ?? "";

const checkrVariant: Record<string, "success" | "warning" | "info" | "error"> = {
  clear: "success",
  consider: "error",
  submitted: "info",
  pending: "warning",
};
const diditVariant: Record<string, "success" | "info" | "warning"> = {
  verified: "success",
  submitted: "info",
  pending: "warning",
};
const kybVariant: Record<string, "success" | "warning" | "error"> = {
  verified: "success",
  pending: "warning",
  not_started: "warning",
  failed: "error",
};

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const app = id ? adminApplicationDetails[id] : undefined;
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);

  if (!app) {
    return (
      <DashboardShell title="Application not found">
        <Button variant="ghost" onClick={() => navigate("/applications")}>
          <ArrowLeft className="h-4 w-4" /> Back to applications
        </Button>
      </DashboardShell>
    );
  }

  async function act(kind: "approve" | "reject") {
    setWorking(true);
    try {
      if (API_URL) {
        await fetch(`${API_URL}/admin/applications/${app!.id}/${kind}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(kind === "reject" ? { reason } : {}),
        });
      }
      await new Promise((r) => setTimeout(r, 500));
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

  return (
    <DashboardShell
      title={app.name}
      description={`Application submitted ${app.submittedAt}`}
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
              {app.avatarUrl ? (
                <img
                  src={app.avatarUrl}
                  alt={app.name}
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
                    {app.name}
                  </p>
                  {app.accountType === "business" && (
                    <Badge variant="info">Business Account</Badge>
                  )}
                </div>
                <p className="text-sm text-slate-500">{app.email}</p>
                <p className="text-sm text-slate-500">{app.phone}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              {app.bio}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              <span className="font-medium">Experience:</span> {app.experience}
            </p>
          </Card>

          <Card>
            <h3 className="mb-3 font-semibold text-charcoal dark:text-white">
              Service area — {app.basedIn} ({app.radiusMi} mi)
            </h3>
            <AdminMap center={app.center} label="Service area" />
          </Card>

          <Card>
            <h3 className="mb-3 font-semibold text-charcoal dark:text-white">
              Services
            </h3>
            <div className="flex flex-wrap gap-2">
              {app.services.map((s) => (
                <Badge key={s} variant="info">
                  {SERVICE_LABELS[s]}
                </Badge>
              ))}
            </div>
            <h3 className="mb-3 mt-5 font-semibold text-charcoal dark:text-white">
              Availability
            </h3>
            <div className="grid grid-cols-7 gap-2 text-center text-xs">
              {Object.entries(app.availability).map(([day, band]) => (
                <div key={day}>
                  <p className="font-medium text-slate-500">{day}</p>
                  <p className="mt-1 rounded bg-slate-100 py-1 text-charcoal dark:bg-slate-800 dark:text-white">
                    {band.replace(/_/g, " ")}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {app.accountType === "business" && (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-charcoal dark:text-white">
                  Business
                </h3>
                {app.kybStatus && (
                  <Badge variant={kybVariant[app.kybStatus] ?? "warning"}>
                    KYB: {app.kybStatus}
                  </Badge>
                )}
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-400">Name</dt>
                  <dd className="text-right font-medium text-charcoal dark:text-white">
                    {app.businessName ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-400">Type</dt>
                  <dd className="text-right font-medium text-charcoal dark:text-white">
                    {app.businessType ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-400">State of incorporation</dt>
                  <dd className="text-right font-medium text-charcoal dark:text-white">
                    {app.stateOfIncorporation ?? "—"}
                  </dd>
                </div>
                {app.authorizedRep && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Authorized rep</dt>
                    <dd className="text-right font-medium text-charcoal dark:text-white">
                      {app.authorizedRep.name} ({app.authorizedRep.title})
                    </dd>
                  </div>
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
                <Badge variant={checkrVariant[app.checkrStatus]}>
                  {app.checkrStatus}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-500">
                  <IdCard className="h-4 w-4" /> Didit
                </span>
                <Badge variant={diditVariant[app.diditStatus]}>
                  {app.diditStatus}
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
            <Button
              fullWidth
              variant="secondary"
              onClick={() => toast("Requested more info from applicant.")}
            >
              Request more info
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
