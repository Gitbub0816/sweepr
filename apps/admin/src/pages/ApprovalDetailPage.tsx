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
  toast,
} from "@sweepr/ui";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Proposal {
  id: string;
  title: string;
  reason: string;
  internal_notes: string | null;
  external_notice_summary: string | null;
  status: string;
  proposer_clerk_id: string;
  proposed_effective_at: string;
  response_deadline_at: string;
  cooldown_expires_at: string | null;
  notice_period_ends_at: string | null;
  final_effective_at: string | null;
  decline_reason: string | null;
}
interface Config {
  name: string;
  fee_type: string;
  affected_party: string;
  calculation_method: string;
  flat_amount_cents: number | null;
  percentage_bps: number | null;
}
interface Action {
  id: string;
  actor_clerk_id: string;
  actor_email: string | null;
  action: string;
  comment: string | null;
  created_at: string;
}
interface Collaborator {
  clerk_id: string;
  email: string | null;
  must_approve_final: boolean;
  approved_final_at: string | null;
}

const STATUS_VARIANT: Record<string, "info" | "warning" | "success" | "error"> = {
  pending: "warning", collaboration: "info", cooldown: "info", notice_sent: "info",
  effective: "success", declined: "error", expired_declined: "error", cancelled: "error", revoked: "error",
};

export function ApprovalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [comment, setComment] = useState("");

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
  }, [getToken]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await authed(`/admin/fee-proposals/${id}`);
      if (res.ok) {
        const d = (await res.json()) as { proposal: Proposal; config: Config; actions: Action[]; collaborators: Collaborator[] };
        setProposal(d.proposal);
        setConfig(d.config);
        setActions(d.actions ?? []);
        setCollaborators(d.collaborators ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [id, authed]);

  useEffect(() => { void load(); }, [load]);

  async function act(verb: string) {
    if (!id) return;
    setWorking(true);
    try {
      const body: Record<string, unknown> = {};
      if (verb === "decline") body.reason = comment;
      if (verb === "propose-modification") body.comment = comment;
      if (verb === "approve" && comment) body.comment = comment;
      const res = await authed(`/admin/fee-proposals/${id}/${verb}`, { method: "POST", body: JSON.stringify(body) });
      if (res.ok) {
        toast.success(`Done: ${verb.replace(/-/g, " ")}`);
        setComment("");
        void load();
      } else {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(e.error ?? "Action failed.");
      }
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return <DashboardShell title="Proposal"><div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></DashboardShell>;
  }
  if (!proposal) {
    return (
      <DashboardShell title="Proposal not found">
        <Button variant="ghost" onClick={() => navigate("/approvals")}><ArrowLeft className="h-4 w-4" /> Back</Button>
      </DashboardShell>
    );
  }

  const amount = config?.percentage_bps != null
    ? `${(config.percentage_bps / 100).toFixed(2)}%`
    : config?.flat_amount_cents != null
      ? `$${(config.flat_amount_cents / 100).toFixed(2)}`
      : "—";
  const terminal = ["declined", "expired_declined", "cancelled", "effective", "notice_sent"].includes(proposal.status);

  return (
    <DashboardShell
      title={proposal.title}
      description={`Fee change • ${config?.fee_type?.replace(/_/g, " ") ?? ""}`}
      actions={<Button variant="ghost" onClick={() => navigate("/approvals")}><ArrowLeft className="h-4 w-4" /> Back</Button>}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal dark:text-white">Summary</h3>
              <Badge variant={STATUS_VARIANT[proposal.status] ?? "info"}>{proposal.status.replace(/_/g, " ")}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Configuration" value={config?.name ?? "—"} />
              <Detail label="Amount" value={amount} />
              <Detail label="Affects" value={config?.affected_party?.replace(/_/g, " ") ?? "—"} />
              <Detail label="Method" value={config?.calculation_method?.replace(/_/g, " ") ?? "—"} />
              <Detail label="Proposed effective" value={new Date(proposal.proposed_effective_at).toLocaleString()} />
              <Detail label="Response deadline" value={new Date(proposal.response_deadline_at).toLocaleString()} />
              {proposal.cooldown_expires_at && <Detail label="Cooldown ends" value={new Date(proposal.cooldown_expires_at).toLocaleString()} />}
              {proposal.final_effective_at && <Detail label="Final effective" value={new Date(proposal.final_effective_at).toLocaleString()} />}
            </dl>
          </Card>

          <Card>
            <h3 className="mb-2 font-semibold text-charcoal dark:text-white">Reason</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">{proposal.reason}</p>
            {proposal.internal_notes && <p className="mt-3 text-sm text-slate-500"><strong>Internal:</strong> {proposal.internal_notes}</p>}
            {proposal.external_notice_summary && <p className="mt-3 text-sm text-slate-500"><strong>External notice:</strong> {proposal.external_notice_summary}</p>}
            {proposal.decline_reason && <p className="mt-3 text-sm text-red-600"><strong>Decline reason:</strong> {proposal.decline_reason}</p>}
          </Card>

          <Card>
            <h3 className="mb-3 font-semibold text-charcoal dark:text-white">Audit log</h3>
            <ul className="space-y-2 text-sm">
              {actions.map((a) => (
                <li key={a.id} className="flex gap-3 text-slate-500">
                  <span className="shrink-0 font-mono text-xs">{new Date(a.created_at).toLocaleString()}</span>
                  <span>
                    <span className="font-medium text-charcoal dark:text-white">{a.actor_email ?? a.actor_clerk_id}</span>
                    {" — "}{a.action.replace(/_/g, " ")}{a.comment ? `: ${a.comment}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-3">
            <h3 className="font-semibold text-charcoal dark:text-white">Actions</h3>
            <Textarea label="Comment / reason (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
            <Button fullWidth onClick={() => act("approve")} loading={working} disabled={terminal}>Approve</Button>
            <Button fullWidth variant="secondary" onClick={() => act("join-collaboration")} loading={working} disabled={terminal}>Join Collaboration</Button>
            <Button fullWidth variant="ghost" onClick={() => act("propose-modification")} loading={working} disabled={terminal}>Request Changes</Button>
            <Button fullWidth variant="ghost" onClick={() => act("revoke-approval")} loading={working} disabled={terminal}>Revoke Approval</Button>
            <Button fullWidth variant="danger" onClick={() => act("decline")} loading={working} disabled={terminal}>Decline</Button>
            <Button fullWidth variant="ghost" onClick={() => act("cancel")} loading={working} disabled={terminal}>Cancel Proposal</Button>
          </Card>

          <Card>
            <h3 className="mb-2 font-semibold text-charcoal dark:text-white">Collaborators</h3>
            {collaborators.length === 0 ? (
              <p className="text-sm text-slate-400">None yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {collaborators.map((cb) => (
                  <li key={cb.clerk_id} className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">{cb.email ?? cb.clerk_id}</span>
                    {cb.must_approve_final && (
                      <Badge variant={cb.approved_final_at ? "success" : "warning"}>
                        {cb.approved_final_at ? "approved" : "must approve"}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
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
