/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Reply, ReplyAll, Forward, Archive, ArchiveRestore, MailOpen, Inbox } from "lucide-react";
import { Button } from "@sweepr/ui";
import type { Message } from "./types";
import { fullDate } from "./utils";

interface Props {
  message: Message | null;
  parent: Message | null;
  onReply: (m: Message) => void;
  onReplyAll: (m: Message) => void;
  onForward: (m: Message) => void;
  onArchiveToggle: (m: Message) => void;
  onMarkUnread: (m: Message) => void;
}

export function ReadingPane({ message, parent, onReply, onReplyAll, onForward, onArchiveToggle, onMarkUnread }: Props) {
  if (!message) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
        <Inbox className="h-8 w-8" aria-hidden="true" />
        <p className="text-sm">Select a message to read it.</p>
      </div>
    );
  }

  const archived = !!message.archived_at;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-charcoal dark:text-white">{message.subject || "(no subject)"}</h2>
          <dl className="mt-1 space-y-0.5 text-sm text-slate-500 dark:text-slate-400">
            <div className="flex gap-1">
              <dt className="font-medium text-slate-600 dark:text-slate-300">From:</dt>
              <dd className="truncate">
                {message.direction === "inbound"
                  ? message.sender_name ? `${message.sender_name} <${message.sender_email}>` : message.sender_email
                  : `${message.sender_email}${message.sent_by_email ? ` (${message.sent_by_email})` : ""}`}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="font-medium text-slate-600 dark:text-slate-300">To:</dt>
              <dd className="truncate">{message.to_email ?? "—"}</dd>
            </div>
            {message.cc_email && (
              <div className="flex gap-1">
                <dt className="font-medium text-slate-600 dark:text-slate-300">Cc:</dt>
                <dd className="truncate">{message.cc_email}</dd>
              </div>
            )}
            <div className="flex gap-1">
              <dt className="font-medium text-slate-600 dark:text-slate-300">Date:</dt>
              <dd>{fullDate(message.created_at)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
        <Button variant="secondary" onClick={() => onReply(message)}>
          <Reply className="mr-1 h-4 w-4" aria-hidden="true" /> Reply
        </Button>
        <Button variant="secondary" onClick={() => onReplyAll(message)}>
          <ReplyAll className="mr-1 h-4 w-4" aria-hidden="true" /> Reply All
        </Button>
        <Button variant="secondary" onClick={() => onForward(message)}>
          <Forward className="mr-1 h-4 w-4" aria-hidden="true" /> Forward
        </Button>
        <Button variant="secondary" onClick={() => onArchiveToggle(message)} aria-label={archived ? "Unarchive" : "Archive"}>
          {archived ? <ArchiveRestore className="mr-1 h-4 w-4" aria-hidden="true" /> : <Archive className="mr-1 h-4 w-4" aria-hidden="true" />}
          {archived ? "Unarchive" : "Archive"}
        </Button>
        {message.direction === "inbound" && (
          <Button variant="secondary" onClick={() => onMarkUnread(message)}>
            <MailOpen className="mr-1 h-4 w-4" aria-hidden="true" /> Mark unread
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {parent && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800">
            <p className="mb-1 font-medium text-slate-600 dark:text-slate-300">In reply to {parent.subject || "(no subject)"}</p>
            <p className="line-clamp-3 whitespace-pre-wrap">{parent.body_text}</p>
          </div>
        )}
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-charcoal dark:text-slate-100">
          {message.body_text || "(empty body)"}
        </div>
      </div>
    </div>
  );
}
