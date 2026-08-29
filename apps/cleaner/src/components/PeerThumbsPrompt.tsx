/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Button, toast } from "@sweepr/ui";
import { ThumbsUp, ThumbsDown, Users } from "lucide-react";
import type { CrewRoster } from "../lib/crew";

type Fetcher = (path: string, opts?: RequestInit) => Promise<Response>;

interface Ratee {
  cleanerId: string;
  label: string;
}

/**
 * After a completed team clean, ask the caller for a quick thumbs on each
 * teammate — but only for pairs the backend says to prompt (first-ever pairing,
 * not already rated). We never show a teammate's private data: seats are labeled
 * by role only. Renders nothing when there is no one to rate.
 */
export function PeerThumbsPrompt({
  bookingId,
  authFetch,
  roster,
  myCleanerId,
}: {
  bookingId: string;
  authFetch: Fetcher;
  roster: CrewRoster;
  myCleanerId: string | null;
}) {
  const { t } = useTranslation();
  const [ratees, setRatees] = useState<Ratee[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const candidates = roster.seats.filter(
        (s) =>
          s.cleanerId &&
          s.cleanerId !== myCleanerId &&
          (s.status === "ACCEPTED" || s.status === "COMPLETED"),
      );
      const results: Ratee[] = [];
      for (const seat of candidates) {
        try {
          const res = await authFetch(
            `/reviews/peer/prompt?bookingId=${encodeURIComponent(bookingId)}&rateeCleanerId=${encodeURIComponent(seat.cleanerId!)}`,
          );
          if (!res.ok) continue;
          const data = (await res.json()) as { prompt?: boolean };
          if (data.prompt) {
            results.push({
              cleanerId: seat.cleanerId!,
              label:
                seat.role === "LEAD"
                  ? t("cleaner.team.roleLead")
                  : `${t("cleaner.team.roleMember")} ${seat.seatIndex + 1}`,
            });
          }
        } catch {
          /* best-effort: a failed prompt check just omits that teammate */
        }
      }
      if (!cancelled) setRatees(results);
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [authFetch, bookingId, roster, myCleanerId, t]);

  async function rate(cleanerId: string, thumbs: "up" | "down") {
    setSubmitting(cleanerId);
    try {
      const res = await authFetch(`/reviews/peer`, {
        method: "POST",
        body: JSON.stringify({ bookingId, rateeCleanerId: cleanerId, thumbs }),
      });
      if (!res.ok) {
        toast.error(t("cleaner.team.peerError"));
        return;
      }
      toast.success(t("cleaner.team.peerThanks"));
      setRatees((prev) => prev.filter((r) => r.cleanerId !== cleanerId));
    } catch {
      toast.error(t("cleaner.team.peerError"));
    } finally {
      setSubmitting(null);
    }
  }

  if (ratees.length === 0) return null;

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-seafoam-50 text-seafoam-700 dark:bg-slate-800">
          <Users className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-charcoal dark:text-white">
            {t("cleaner.team.peerTitle")}
          </p>
          <p className="text-sm text-slate-500">{t("cleaner.team.peerDesc")}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {ratees.map((r) => (
          <li
            key={r.cleanerId}
            className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-charcoal dark:text-white">
              {r.label}
            </span>
            <Button
              variant="secondary"
              onClick={() => rate(r.cleanerId, "up")}
              loading={submitting === r.cleanerId}
              aria-label={t("cleaner.team.peerUp")}
            >
              <ThumbsUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={() => rate(r.cleanerId, "down")}
              disabled={submitting === r.cleanerId}
              aria-label={t("cleaner.team.peerDown")}
            >
              <ThumbsDown className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
