import { useEffect, useRef, useState } from "react";
import { Bell, Check } from "lucide-react";
import { cn } from "@sweepr/utils";

export interface NotificationItem {
  id: string;
  title: string;
  body?: string;
  /** ISO timestamp */
  createdAt: string;
  read: boolean;
  /** Optional in-app link the notification points to. */
  href?: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export interface NotificationBellProps {
  notifications: NotificationItem[];
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  onNavigate?: (href: string) => void;
}

export function NotificationBell({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onNavigate,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={
          unread > 0
            ? `Notifications, ${unread} unread`
            : "Notifications"
        }
        aria-haspopup="true"
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-seafoam-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-sm font-semibold text-charcoal dark:text-white">
              Notifications
            </p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => onMarkAllRead?.()}
                className="inline-flex items-center gap-1 text-xs font-medium text-seafoam-600 hover:text-seafoam-700"
              >
                <Check className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">
                You're all caught up.
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (!n.read) onMarkRead?.(n.id);
                    if (n.href) onNavigate?.(n.href);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60",
                    !n.read && "bg-seafoam-50/60 dark:bg-seafoam-900/10"
                  )}
                >
                  {!n.read && (
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-seafoam-500"
                      aria-hidden
                    />
                  )}
                  <span className={cn("min-w-0 flex-1", n.read && "pl-5")}>
                    <span className="block truncate text-sm font-medium text-charcoal dark:text-white">
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {n.body}
                      </span>
                    )}
                    <span className="mt-1 block text-[11px] text-slate-400">
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
