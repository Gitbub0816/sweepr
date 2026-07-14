/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useRef, useState } from "react";
import { Search, Archive, ArchiveRestore, Mail as MailIcon, MailOpen, Send, Loader2 } from "lucide-react";
import { Input } from "@sweepr/ui";
import type { Folder, Message } from "./types";
import { relativeTime } from "./utils";

interface Props {
  messages: Message[];
  folder: Folder;
  selectedId: string | null;
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onSelect: (m: Message) => void;
  onLoadMore: () => void;
  onArchiveToggle: (m: Message) => void;
  onReadToggle: (m: Message) => void;
}

export function MessageList({
  messages,
  folder,
  selectedId,
  loading,
  hasMore,
  loadingMore,
  query,
  onQueryChange,
  onSelect,
  onLoadMore,
  onArchiveToggle,
  onReadToggle,
}: Props) {
  const [localQuery, setLocalQuery] = useState(query);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setLocalQuery(query), [query]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (localQuery !== query) onQueryChange(localQuery);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localQuery]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) onLoadMore();
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, onLoadMore]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 p-2 dark:border-slate-700">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input
            aria-label="Search messages"
            placeholder="Search mail…"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            {query ? "No messages match your search." : `No messages in ${folder}.`}
          </p>
        ) : (
          <ul>
            {messages.map((m) => {
              const unread = m.direction === "inbound" && !m.read_at;
              const isSelected = selectedId === m.id;
              const archived = !!m.archived_at;
              return (
                <li key={m.id} className="group relative border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <button
                    onClick={() => onSelect(m)}
                    className={`block w-full px-3 py-2.5 text-left transition-colors ${
                      isSelected ? "bg-seafoam-50 dark:bg-seafoam-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-seafoam-500" aria-label="Unread" />}
                      {m.direction === "outbound" ? (
                        <Send className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                      ) : m.read_at ? (
                        <MailOpen className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden="true" />
                      ) : null}
                      <span className={`min-w-0 flex-1 truncate text-sm ${unread ? "font-semibold text-charcoal dark:text-white" : "text-slate-700 dark:text-slate-200"}`}>
                        {m.direction === "outbound" ? `To: ${m.to_email ?? ", "}` : m.sender_name || m.sender_email}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{relativeTime(m.created_at)}</span>
                    </div>
                    <p className={`mt-0.5 truncate pl-4 text-sm ${unread ? "font-semibold text-charcoal dark:text-white" : "text-slate-600 dark:text-slate-300"}`}>
                      {m.subject || "(no subject)"}
                    </p>
                    <p className="mt-0.5 truncate pl-4 text-xs text-slate-400">{(m.body_text || "").replace(/\s+/g, " ").trim()}</p>
                  </button>

                  <div className="pointer-events-none absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                    {m.direction === "inbound" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onReadToggle(m); }}
                        aria-label={unread ? "Mark as read" : "Mark as unread"}
                        title={unread ? "Mark as read" : "Mark as unread"}
                        className="rounded-md bg-white p-1.5 text-slate-500 shadow-sm hover:text-seafoam-600 dark:bg-slate-900 dark:text-slate-300"
                      >
                        {unread ? <MailOpen className="h-3.5 w-3.5" /> : <MailIcon className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onArchiveToggle(m); }}
                      aria-label={archived ? "Unarchive" : "Archive"}
                      title={archived ? "Unarchive" : "Archive"}
                      className="rounded-md bg-white p-1.5 text-slate-500 shadow-sm hover:text-seafoam-600 dark:bg-slate-900 dark:text-slate-300"
                    >
                      {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-4">
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />}
          </div>
        )}
      </div>
    </div>
  );
}
