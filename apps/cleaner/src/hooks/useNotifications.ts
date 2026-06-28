import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import type { NotificationItem } from "@sweepr/ui";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type GetToken = () => Promise<string | null>;

async function authHeaders(getToken: GetToken): Promise<HeadersInit> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const MOCK: NotificationItem[] = [
  {
    id: "n_1",
    title: "New job available nearby",
    body: "Standard clean in Hillcrest — $71 est. pay.",
    createdAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    read: false,
    href: "/jobs",
  },
  {
    id: "n_2",
    title: "Payout sent",
    body: "$1,240 is on the way to your bank.",
    createdAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
    read: false,
    href: "/earnings",
  },
  {
    id: "n_3",
    title: "You got a 5-star review",
    body: "Jane D. left you a great review.",
    createdAt: new Date(Date.now() - 30 * 3_600_000).toISOString(),
    read: true,
    href: "/profile",
  },
];

async function fetchNotifications(getToken: GetToken): Promise<NotificationItem[]> {
  if (!API_URL) return MOCK;
  try {
    const res = await fetch(`${API_URL}/notifications`, {
      headers: await authHeaders(getToken),
    });
    if (!res.ok) return MOCK;
    const data = (await res.json()) as { notifications: NotificationItem[] };
    return data.notifications ?? MOCK;
  } catch {
    return MOCK;
  }
}

export function useNotifications() {
  const qc = useQueryClient();
  const { getToken, isSignedIn } = useAuth();
  const key = ["notifications"];

  const { data = [] } = useQuery({
    queryKey: key,
    queryFn: () => fetchNotifications(getToken),
    refetchInterval: 30_000,
    enabled: !!isSignedIn,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      if (API_URL) {
        await fetch(`${API_URL}/notifications/${id}/read`, {
          method: "PATCH",
          headers: await authHeaders(getToken),
        });
      }
      return id;
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationItem[]>(key);
      qc.setQueryData<NotificationItem[]>(key, (old) =>
        (old ?? []).map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (API_URL) {
        await fetch(`${API_URL}/notifications/read-all`, {
          method: "PATCH",
          headers: await authHeaders(getToken),
        });
      }
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationItem[]>(key);
      qc.setQueryData<NotificationItem[]>(key, (old) =>
        (old ?? []).map((n) => ({ ...n, read: true }))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
  });

  return {
    notifications: data,
    markRead: (id: string) => markRead.mutate(id),
    markAllRead: () => markAllRead.mutate(),
  };
}
