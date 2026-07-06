import { User, Mail, History, Link2 } from "lucide-react";

export interface TicketContext {
  user: Record<string, unknown> | null;
  invites: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
  relatedTickets: Array<Record<string, unknown>>;
  error: Record<string, unknown> | null;
}

/** WHO panel: Sweepr account, admin invites, related errors/audit/tickets for a reporter email. Shared by IT + Security consoles. */
export function ReporterContextPanel({ context, kind }: { context: TicketContext | null; kind: "it" | "security" }) {
  if (!context) return <p className="text-xs text-slate-600">Loading…</p>;
  const { user, invites, audit, relatedTickets, error } = context;
  return (
    <div className="space-y-4 text-xs">
      {/* Account */}
      <section>
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-500"><User className="h-3.5 w-3.5" /> Account</p>
        {user ? (
          <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <p className="font-medium text-charcoal dark:text-white">{String(user.email)}</p>
            <p className="text-slate-600">Role: {String(user.role ?? "—")}{user.admin_role ? ` · ${String(user.admin_role)}` : ""}</p>
            <p className="text-slate-600">Joined {user.created_at ? new Date(String(user.created_at)).toLocaleDateString() : "—"}</p>
          </div>
        ) : <p className="text-slate-600">No Sweepr account matches this email.</p>}
      </section>

      {/* Admin invites — key signal for "who invited this person" */}
      {invites.length > 0 && (
        <section>
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-500"><Mail className="h-3.5 w-3.5" /> Admin invites</p>
          {invites.map((inv, i) => (
            <div key={i} className="rounded-lg border border-amber-200 bg-amber-50/50 p-2 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-slate-600 dark:text-slate-300">
                Invited by <span className="font-semibold text-charcoal dark:text-white">{String(inv.inviter_email ?? inv.created_by ?? "unknown")}</span>
              </p>
              <p className="text-slate-600">
                {inv.created_at ? new Date(String(inv.created_at)).toLocaleString() : ""}
                {inv.used_at ? " · accepted" : " · pending"}
                {inv.expires_at && !inv.used_at ? `, expires ${new Date(String(inv.expires_at)).toLocaleDateString()}` : ""}
              </p>
            </div>
          ))}
        </section>
      )}

      {/* Related error */}
      {error && (
        <section>
          <p className="mb-1 font-semibold text-slate-500">Related error</p>
          <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-2 dark:border-slate-700 dark:bg-slate-800">
            <p className="font-mono text-rose-600">{String(error.status_code ?? "")} {String(error.method ?? "")} {String(error.path ?? "")}</p>
            <p className="text-slate-500">{String(error.message ?? "")}</p>
            <p className="text-slate-600">{error.occurred_at ? new Date(String(error.occurred_at)).toLocaleString() : ""}</p>
          </div>
        </section>
      )}

      {/* Audit trail */}
      {audit.length > 0 && (
        <section>
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-500"><History className="h-3.5 w-3.5" /> Audit trail</p>
          <div className="space-y-1">
            {audit.slice(0, 10).map((a, i) => (
              <div key={i} className="rounded border border-slate-100 p-1.5 dark:border-slate-800">
                <p className="font-medium text-slate-600 dark:text-slate-300">{String(a.action ?? "")}</p>
                <p className="text-slate-600">
                  {a.actor_email ? `${String(a.actor_email)} · ` : ""}
                  {a.created_at ? new Date(String(a.created_at)).toLocaleString() : ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Related tickets */}
      {relatedTickets.length > 0 && (
        <section>
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-500"><Link2 className="h-3.5 w-3.5" /> Other tickets</p>
          {relatedTickets.map((r, i) => (
            <div key={i} className="rounded border border-slate-100 p-1.5 dark:border-slate-800">
              <span className="font-mono font-semibold text-seafoam-700">{String(r.case_code ?? "")}</span>
              <span className="ml-2 text-slate-600">{String((kind === "security" ? r.subject : r.title) ?? "")}</span>
              <span className="ml-1 text-slate-600">· {String(r.status ?? "")}</span>
            </div>
          ))}
        </section>
      )}

      {/* Nothing found */}
      {!user && invites.length === 0 && audit.length === 0 && relatedTickets.length === 0 && !error && (
        <p className="text-slate-600">No related account, invite, audit, or ticket history found for this email.</p>
      )}
    </div>
  );
}
