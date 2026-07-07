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
 * Notification center bell for the admin top bar: unread count badge, a
 * dropdown listing the caller's admin_notifications, per-item mark-read +
 * navigate, and "Mark all read". Self-contained so its inclusion in the App
 * shell stays a one-line change.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import {
  useAlertBadges,
  useAlertFeed,
  useMarkAlertsRead,
  relativeTime,
  type AdminNotification,
} from "../lib/alerts";

export function AdminNotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { total } = useAlertBadges();
  const { data: items, isLoading } = useAlertFeed(open);
  const { markRead, markAllRead } = useMarkAlertsRead();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function onItemClick(item: AdminNotification) {
    setOpen(false);
    if (!item.read_at) await markRead(item.id);
    if (item.link_path) navigate(item.link_path);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={total > 0 ? `Notifications (${total} unread)` : "Notifications"}
        className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white"
      >
        <Bell className="h-[18px] w-[18px]" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold leading-none text-white">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Notifications
            </p>
            {total > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="text-xs font-medium text-seafoam-700 hover:underline dark:text-seafoam-300"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : !items || items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-slate-50 dark:divide-slate-800">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => void onItemClick(item)}
                      className={`w-full px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                        item.read_at ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {!item.read_at && (
                          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-seafoam-500" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-charcoal dark:text-white">
                            {item.title}
                          </p>
                          {item.body && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.body}</p>
                          )}
                          <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                            {item.category} · {relativeTime(item.created_at)}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
