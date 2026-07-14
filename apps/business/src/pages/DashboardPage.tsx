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
import { useAuth, useUser } from "@clerk/clerk-react";
import { Building2 } from "lucide-react";
import { Card, LoadingState, EmptyState } from "@sweepr/ui";
import { apiFetch } from "../lib/api";

interface WorkspaceMe {
  workspace?: { id?: string; name?: string } | null;
  role?: string | null;
  propertyCount?: number;
  memberCount?: number;
  upcomingBookings?: number;
}

export function DashboardPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [me, setMe] = useState<WorkspaceMe | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  const load = useCallback(async () => {
    const res = await apiFetch<WorkspaceMe>(getToken, "/business/me");
    if (res.ok && res.data) {
      setMe(res.data);
      setStatus("ready");
    } else {
      setStatus("unavailable");
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  const firstName = user?.firstName ?? "there";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-charcoal dark:text-white">
          Welcome, {firstName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {me?.workspace?.name
            ? `${me.workspace.name} workspace overview`
            : "Your Sweepr Business workspace"}
        </p>
      </div>

      {status === "loading" && <LoadingState rows={3} />}

      {status === "unavailable" && (
        <EmptyState
          icon={<Building2 className="h-10 w-10" />}
          title="Workspace not available yet"
          description="We couldn't load your workspace overview. If your workspace was just created, give it a moment and refresh."
        />
      )}

      {status === "ready" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-sm font-medium text-slate-500">Properties</p>
            <p className="mt-1 text-3xl font-bold text-charcoal dark:text-white">
              {me?.propertyCount ?? ", "}
            </p>
          </Card>
          <Card>
            <p className="text-sm font-medium text-slate-500">Members</p>
            <p className="mt-1 text-3xl font-bold text-charcoal dark:text-white">
              {me?.memberCount ?? ", "}
            </p>
          </Card>
          <Card>
            <p className="text-sm font-medium text-slate-500">Upcoming cleanings</p>
            <p className="mt-1 text-3xl font-bold text-charcoal dark:text-white">
              {me?.upcomingBookings ?? ", "}
            </p>
          </Card>
        </div>
      )}

      {status === "ready" && me?.role && (
        <p className="text-sm text-slate-500">
          Your role: <span className="font-medium text-charcoal dark:text-white">{me.role}</span>
        </p>
      )}
    </div>
  );
}
