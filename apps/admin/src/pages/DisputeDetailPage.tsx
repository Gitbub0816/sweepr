import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Paperclip } from "lucide-react";
import {
  DashboardShell,
  Card,
  Badge,
  Button,
  Textarea,
  Input,
  toast,
} from "@sweepr/ui";
import { SERVICE_LABELS, formatCurrency } from "@sweepr/utils";
import { adminDisputeDetails } from "../data/mock";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export function DisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispute = id ? adminDisputeDetails[id] : undefined;

  const [cleanerResponse, setCleanerResponse] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [splitCustomer, setSplitCustomer] = useState(0);
  const [working, setWorking] = useState(false);

  if (!dispute) {
    return (
      <DashboardShell title="Dispute not found">
        <Button variant="ghost" onClick={() => navigate("/disputes")}>
          <ArrowLeft className="h-4 w-4" /> Back to disputes
        </Button>
      </DashboardShell>
    );
  }

  async function resolve(kind: "refund" | "release" | "split") {
    setWorking(true);
    try {
      if (API_URL) {
        await fetch(`${API_URL}/admin/disputes/${dispute!.id}/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resolution: kind,
            splitCustomer: kind === "split" ? splitCustomer : undefined,
            notes: resolutionNotes,
            cleanerResponse,
          }),
        });
      }
      await new Promise((r) => setTimeout(r, 500));
      const msg =
        kind === "refund"
          ? "Refunded customer."
          : kind === "release"
          ? "Released funds to cleaner."
          : "Split applied.";
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
      title={`Dispute ${dispute.id}`}
      description={`${dispute.reason} · Booking ${dispute.bookingId}`}
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
              <Detail label="Service" value={SERVICE_LABELS[dispute.serviceType]} />
              <Detail label="Scheduled" value={dispute.scheduledFor} />
              <Detail label="Customer" value={dispute.customer} />
              <Detail label="Cleaner" value={dispute.cleaner} />
              <Detail label="Price paid" value={formatCurrency(dispute.pricePaid)} />
              <Detail label="At stake" value={formatCurrency(dispute.amount)} />
            </dl>
          </Card>

          <Card>
            <h3 className="mb-2 font-semibold text-charcoal dark:text-white">
              Customer's description
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {dispute.customerDescription}
            </p>
          </Card>

          <Card>
            <h3 className="mb-2 font-semibold text-charcoal dark:text-white">
              Evidence
            </h3>
            {dispute.evidence.length === 0 ? (
              <p className="text-sm text-slate-400">No attachments.</p>
            ) : (
              <ul className="space-y-2">
                {dispute.evidence.map((url, i) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-sm text-seafoam-600 hover:underline"
                    >
                      <Paperclip className="h-4 w-4" /> Attachment {i + 1}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <Textarea
              label="Cleaner's response (recorded after contact)"
              value={cleanerResponse}
              onChange={(e) => setCleanerResponse(e.target.value)}
              placeholder="Summarize the cleaner's side after reaching out."
            />
          </Card>

          <Card>
            <h3 className="mb-3 font-semibold text-charcoal dark:text-white">
              Audit log
            </h3>
            <ul className="space-y-2 text-sm">
              {dispute.audit.map((entry, i) => (
                <li key={i} className="flex gap-3 text-slate-500">
                  <span className="shrink-0 font-mono text-xs">{entry.at}</span>
                  <span>
                    <span className="font-medium text-charcoal dark:text-white">
                      {entry.actor}
                    </span>{" "}
                    — {entry.action}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h3 className="mb-2 font-semibold text-charcoal dark:text-white">
              Status
            </h3>
            <Badge variant={dispute.status === "open" ? "error" : "warning"}>
              {dispute.status}
            </Badge>
          </Card>

          <Card className="space-y-3">
            <h3 className="font-semibold text-charcoal dark:text-white">Resolve</h3>
            <Button fullWidth onClick={() => resolve("refund")} loading={working}>
              Refund customer ({formatCurrency(dispute.amount)})
            </Button>
            <Button
              fullWidth
              variant="secondary"
              onClick={() => resolve("release")}
              loading={working}
            >
              Release to cleaner
            </Button>
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <Input
                label="Split: customer amount"
                type="number"
                min={0}
                max={dispute.amount}
                value={splitCustomer}
                onChange={(e) => setSplitCustomer(Number(e.target.value))}
                hint={`Cleaner gets ${formatCurrency(
                  Math.max(dispute.amount - splitCustomer, 0)
                )}`}
              />
              <Button
                className="mt-3"
                fullWidth
                variant="ghost"
                onClick={() => resolve("split")}
                loading={working}
              >
                Apply split
              </Button>
            </div>
          </Card>

          <Card>
            <Textarea
              label="Resolution notes"
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Internal notes about how this was resolved."
            />
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
