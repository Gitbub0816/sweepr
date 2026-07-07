/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { PenSquare, Inbox as InboxIcon, Send, Archive } from "lucide-react";
import { Button } from "@sweepr/ui";
import type { Box, Folder } from "./types";

interface Props {
  boxes: Box[];
  activeBox: string | null;
  activeFolder: Folder;
  onSelectBox: (id: string) => void;
  onSelectFolder: (folder: Folder) => void;
  onCompose: () => void;
}

const FOLDERS: { id: Folder; label: string; icon: typeof InboxIcon }[] = [
  { id: "inbox", label: "Inbox", icon: InboxIcon },
  { id: "sent", label: "Sent", icon: Send },
  { id: "archive", label: "Archive", icon: Archive },
];

export function MailboxList({ boxes, activeBox, activeFolder, onSelectBox, onSelectFolder, onCompose }: Props) {
  const active = boxes.find((b) => b.id === activeBox) ?? null;

  return (
    <div className="flex h-full flex-col gap-3">
      <Button onClick={onCompose} className="w-full justify-center">
        <PenSquare className="mr-1 h-4 w-4" aria-hidden="true" /> Compose
      </Button>

      <nav aria-label="Mailboxes" className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <ul className="p-1">
          {boxes.map((b) => {
            const isActive = activeBox === b.id;
            return (
              <li key={b.id}>
                <button
                  onClick={() => onSelectBox(b.id)}
                  aria-current={isActive ? "true" : undefined}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    isActive
                      ? "bg-seafoam-100 font-semibold text-seafoam-900 dark:bg-seafoam-900/30 dark:text-seafoam-100"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="truncate">
                    <span className="block">{b.name}</span>
                    <span className="block truncate text-xs font-normal text-slate-500 dark:text-slate-400">{b.address}</span>
                  </span>
                  {!!b.unread && b.unread > 0 && (
                    <span className="ml-2 shrink-0 rounded-full bg-seafoam-500 px-2 py-0.5 text-xs font-bold text-white">{b.unread}</span>
                  )}
                </button>

                {isActive && (
                  <ul className="mb-1 ml-2 border-l border-slate-200 pl-2 dark:border-slate-700">
                    {FOLDERS.map((f) => {
                      const Icon = f.icon;
                      const count = f.id === "inbox" ? active?.inboxCount : f.id === "sent" ? active?.sentCount : undefined;
                      const folderActive = activeFolder === f.id;
                      return (
                        <li key={f.id}>
                          <button
                            onClick={() => onSelectFolder(f.id)}
                            aria-current={folderActive ? "true" : undefined}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm ${
                              folderActive
                                ? "bg-slate-100 font-medium text-charcoal dark:bg-slate-800 dark:text-white"
                                : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                              {f.label}
                            </span>
                            {count !== undefined && <span className="text-xs text-slate-400">{count}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
