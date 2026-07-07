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
 * Admin alert client — unread badge counts (polled every 60s) and the
 * notification feed behind the bell. Mirrors apps/api/src/lib/adminAlerts.ts.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { useCallback } from "react";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

export const ALERT_CATEGORIES = [
  "errors",
  "security",
  "it",
  "mail",
  "approvals",
  "disputes",
  "applications",
] as const;
export type AlertCategory = (typeof ALERT_CATEGORIES)[number];

export const ALERT_CHANNELS = ["inapp", "email", "sms"] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

export const CATEGORY_LABELS: Record<AlertCategory, string> = {
  errors: "Errors",
  security: "Security",
  it: "IT tickets",
  mail: "Inbound mail",
  approvals: "Approvals",
  disputes: "Disputes",
  applications: "Applications",
};

export const ALERT_BADGES_KEY = ["admin-alert-badges"];
export const ALERT_FEED_KEY = ["admin-alert-notifications"];

export interface AdminNotification {
  id: string;
  category: string;
  title: string;
  body: string | null;
  link_path: string | null;
  created_at: string;
  read_at: string | null;
}

interface BadgesResponse {
  counts: Record<string, number>;
  total: number;
  navPaths: Record<string, string>;
}

export function useAuthedFetch() {
  const { getToken } = useAuth();
  return useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await getToken();
      return fetch(`${API}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers ?? {}),
        },
      });
    },
    [getToken],
  );
}

/** Unread alert counts, polled every 60s. `pathCounts` keys by nav route. */
export function useAlertBadges(): {
  counts: Record<string, number>;
  total: number;
  pathCounts: Record<string, number>;
} {
  const authed = useAuthedFetch();
  const { data } = useQuery({
    queryKey: ALERT_BADGES_KEY,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<BadgesResponse | null> => {
      const res = await authed("/admin/alerts/badges");
      if (!res.ok) return null;
      return (await res.json()) as BadgesResponse;
    },
  });

  const counts = data?.counts ?? {};
  const pathCounts: Record<string, number> = {};
  if (data) {
    for (const [category, path] of Object.entries(data.navPaths)) {
      const n = counts[category] ?? 0;
      if (n > 0) pathCounts[path] = (pathCounts[path] ?? 0) + n;
    }
  }
  return { counts, total: data?.total ?? 0, pathCounts };
}

/** The caller's notification feed (used by the bell dropdown). */
export function useAlertFeed(enabled: boolean) {
  const authed = useAuthedFetch();
  return useQuery({
    queryKey: ALERT_FEED_KEY,
    enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<AdminNotification[]> => {
      const res = await authed("/admin/alerts/notifications?limit=25");
      if (!res.ok) return [];
      const json = (await res.json()) as { notifications: AdminNotification[] };
      return json.notifications ?? [];
    },
  });
}

/** Mark-read helpers that also refresh badges + feed. */
export function useMarkAlertsRead() {
  const authed = useAuthedFetch();
  const queryClient = useQueryClient();

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ALERT_BADGES_KEY });
    queryClient.invalidateQueries({ queryKey: ALERT_FEED_KEY });
  }, [queryClient]);

  const markRead = useCallback(
    async (id: string) => {
      await authed(`/admin/alerts/notifications/${id}/read`, { method: "POST" }).catch(() => null);
      refresh();
    },
    [authed, refresh],
  );

  const markAllRead = useCallback(async () => {
    await authed("/admin/alerts/notifications/read-all", { method: "POST" }).catch(() => null);
    refresh();
  }, [authed, refresh]);

  return { markRead, markAllRead };
}

/** "3m ago" / "2h ago" / "5d ago" for feed timestamps. */
export function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
