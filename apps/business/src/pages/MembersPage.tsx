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
import { Users, Mail, X } from "lucide-react";
import { Card, Button, LoadingState, EmptyState, ErrorState, toast } from "@sweepr/ui";
import { apiFetch, asList } from "../lib/api";

interface Member {
  id?: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
}

interface Invitation {
  id?: string;
  email?: string | null;
  role?: string | null;
  status?: string | null;
}

const ROLES = ["member", "manager", "admin"] as const;

function memberName(m: Member): string {
  return m.name ?? [m.firstName, m.lastName].filter(Boolean).join(" ") ?? "";
}

export function MembersPage() {
  const { getToken } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("member");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    const [membersRes, invitesRes] = await Promise.all([
      apiFetch<unknown>(getToken, "/business/members"),
      apiFetch<unknown>(getToken, "/business/invitations"),
    ]);
    if (membersRes.ok || invitesRes.ok) {
      setMembers(asList<Member>(membersRes.data, "members"));
      setInvitations(asList<Invitation>(invitesRes.data, "invitations"));
      setStatus("ready");
    } else {
      setStatus("error");
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    const res = await apiFetch<unknown>(getToken, "/business/invitations", {
      method: "POST",
      json: { email: inviteEmail.trim(), role: inviteRole },
    });
    setInviting(false);
    if (res.ok) {
      toast.success(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
      void load();
    } else {
      toast.error(res.error ?? "Couldn't send the invitation. Please try again.");
    }
  }

  async function handleRevoke(inv: Invitation) {
    if (!inv.id) return;
    const res = await apiFetch<unknown>(getToken, `/business/invitations/${inv.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Invitation revoked");
      void load();
    } else {
      toast.error(res.error ?? "Couldn't revoke the invitation.");
    }
  }

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-charcoal outline-none transition focus:border-seafoam-400 focus:ring-2 focus:ring-seafoam-400/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-charcoal dark:text-white">Members</h1>
        <p className="mt-1 text-sm text-slate-500">
          People with access to this workspace.
        </p>
      </div>

      <Card>
        <h2 className="text-base font-semibold text-charcoal dark:text-white">Invite someone</h2>
        <form onSubmit={(e) => void handleInvite(e)} className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="teammate@example.com"
            className={inputCls}
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className={`${inputCls} sm:w-40`}
            aria-label="Role"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
          <Button type="submit" loading={inviting} className="sm:shrink-0">
            Send invite
          </Button>
        </form>
      </Card>

      {status === "loading" && <LoadingState rows={4} />}

      {status === "error" && (
        <ErrorState
          title="Couldn't load members"
          description="The workspace service isn't reachable right now. Please try again shortly."
        />
      )}

      {status === "ready" && (
        <>
          {members.length === 0 ? (
            <EmptyState
              icon={<Users className="h-10 w-10" />}
              title="No members yet"
              description="Invite teammates and they'll appear here once they join."
            />
          ) : (
            <div className="space-y-3">
              {members.map((m, i) => (
                <Card key={m.id ?? i} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-charcoal dark:text-white">
                      {memberName(m) || m.email || "Member"}
                    </p>
                    {m.email && <p className="truncate text-sm text-slate-500">{m.email}</p>}
                  </div>
                  {m.role && (
                    <span className="shrink-0 rounded-full bg-seafoam-50 px-3 py-1 text-xs font-medium capitalize text-seafoam-700 dark:bg-slate-800 dark:text-seafoam-400">
                      {m.role}
                    </span>
                  )}
                </Card>
              ))}
            </div>
          )}

          {invitations.length > 0 && (
            <div>
              <h2 className="mb-3 text-base font-semibold text-charcoal dark:text-white">
                Pending invitations
              </h2>
              <div className="space-y-3">
                {invitations.map((inv, i) => (
                  <Card key={inv.id ?? i} className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-charcoal dark:text-white">
                          {inv.email ?? "Invitation"}
                        </p>
                        {inv.role && (
                          <p className="text-xs capitalize text-slate-500">{inv.role}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleRevoke(inv)}
                      disabled={!inv.id}
                      className="shrink-0 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      <X className="h-4 w-4" />
                      Revoke
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
