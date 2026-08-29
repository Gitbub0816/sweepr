/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useTranslation } from "react-i18next";
import { Card, Badge } from "@sweepr/ui";
import { Crown, User, MapPin, CircleDashed, CheckCircle2, XCircle } from "lucide-react";
import type { CrewSeat } from "../lib/crew";

/**
 * "Your team" roster for a crew booking. Shows the lead plus each member with
 * role, seat status, and on-site (arrival) state. It never renders another
 * cleaner's private data: only the lead's first name (already shared with the
 * customer) and generic seat labels, with "You" marking the caller's own seat.
 */
export function CrewRoster({
  seats,
  leadName,
  mySeatId,
}: {
  seats: CrewSeat[];
  leadName?: string | null;
  mySeatId?: string | null;
}) {
  const { t } = useTranslation();
  const ordered = [...seats].sort((a, b) => a.seatIndex - b.seatIndex);

  return (
    <Card className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
        {t("cleaner.team.yourTeam")}
      </p>
      <ul className="space-y-2" aria-label={t("cleaner.team.yourTeam")}>
        {ordered.map((seat) => {
          const isMe = !!mySeatId && seat.id === mySeatId;
          const isLead = seat.role === "LEAD";
          const name = isMe
            ? t("cleaner.team.youLabel")
            : isLead && leadName
            ? leadName
            : `${t("cleaner.team.roleMember")} ${seat.seatIndex + 1}`;
          return (
            <li
              key={seat.id}
              className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800"
            >
              <span
                aria-hidden
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  isLead
                    ? "bg-seafoam-50 text-seafoam-700 dark:bg-slate-800"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {isLead ? <Crown className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-charcoal dark:text-white">
                  {name}
                  {isMe && (
                    <span className="ml-1.5 text-xs font-normal text-slate-500">
                      ({isLead ? t("cleaner.team.roleLead") : t("cleaner.team.roleMember")})
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {isLead ? t("cleaner.team.roleLead") : t("cleaner.team.roleMember")}
                  {" · "}
                  {t(`cleaner.team.seatStatus.${seat.status}`, { defaultValue: seat.status })}
                </p>
              </div>
              <ArrivalIndicator seat={seat} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Per-member arrival state — icon + text (never color-only), with an aria label. */
function ArrivalIndicator({ seat }: { seat: CrewSeat }) {
  const { t } = useTranslation();
  if (seat.status === "NO_SHOW") {
    return (
      <span role="status" aria-label={t("cleaner.team.seatStatus.NO_SHOW")}>
        <Badge variant="error" className="gap-1">
          <XCircle className="h-3 w-3" aria-hidden /> {t("cleaner.team.seatStatus.NO_SHOW")}
        </Badge>
      </span>
    );
  }
  if (seat.checkInAt) {
    return (
      <span role="status" aria-label={t("cleaner.team.onSite")}>
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="h-3 w-3" aria-hidden /> {t("cleaner.team.onSite")}
        </Badge>
      </span>
    );
  }
  const waiting = seat.status === "ACCEPTED";
  return (
    <span role="status" aria-label={waiting ? t("cleaner.team.notOnSite") : t(`cleaner.team.seatStatus.${seat.status}`, { defaultValue: seat.status })}>
      <Badge variant={waiting ? "warning" : "default"} className="gap-1">
        {waiting ? <MapPin className="h-3 w-3" aria-hidden /> : <CircleDashed className="h-3 w-3" aria-hidden />}
        {waiting ? t("cleaner.team.notOnSite") : t(`cleaner.team.seatStatus.${seat.status}`, { defaultValue: seat.status })}
      </Badge>
    </span>
  );
}
