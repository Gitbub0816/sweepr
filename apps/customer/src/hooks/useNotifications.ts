import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NotificationItem } from "@sweepr/ui";

const API_URL = import.meta.env.VITE_API_URL ?? "";

// Mock notifications used when the API is unavailable (dev / preview builds).
const MOCK: NotificationItem[] = [
  {
    id: "n_1",
    title: "Your cleaner is on the way",
    body: "Alex will arrive around 9:00 AM.",
    createdAt: new Date(Date.now() - 8 * 60_000).toISOString(),
    read: false,
    href: "/bookings",
  },
  {
    id: "n_2",
    title: "Booking confirmed",
    body: "Your deep clean for Saturday is booked.",
    createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    read: false,
    href: "/bookings",
  },
  {
    id: "n_3",
    title: "Receipt available",
    body: "View the receipt for your last clean.",
    createdAt: new Date(Date.now() - 26 * 3_600_000).toISOString(),
    read: true,
    href: "/bookings",
  },
];

async function fetchNotifications(): Promise<NotificationItem[]> {
  if (!API_URL) return MOCK;
  try {
    const res = await fetch(`${API_URL}/notifications`);
    if (!res.ok) return MOCK;
    const data = (await res.json()) as { notifications: NotificationItem[] };
    return data.notifications ?? MOCK;
  } catch {
    return MOCK;
  }
}

export function useNotifications() {
  const qc = useQueryClient();
  const key = ["notifications"];

  const { data = [] } = useQuery({
    queryKey: key,
    queryFn: fetchNotifications,
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      if (API_URL) {
        await fetch(`${API_URL}/notifications/${id}/read`, { method: "PATCH" });
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
        await fetch(`${API_URL}/notifications/read-all`, { method: "PATCH" });
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
