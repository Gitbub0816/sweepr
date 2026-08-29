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
import { MapPin, Users, Clock, Crown, User, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, Button, Badge, track, Events } from "@sweepr/ui";
import { formatCurrency, cn } from "@sweepr/utils";
import type { AvailableJob } from "./JobCard";
import type { CrewRole } from "../lib/crew";

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Team-clean variant of the offer card. Makes it unmistakable this is a crew
 * job: a TEAM CLEAN badge, the crew size, the caller's role (Lead vs Crew
 * member), an estimated on-site time, and the caller's estimated earnings for
 * their seat. Falls back gracefully when a value can't be estimated.
 */
export function TeamOfferCard({
  job,
  role,
  crewSize,
  estElapsedMinutes,
  estEarningsDollars,
  accepted,
  onAccept,
  onPass,
  onExpire,
  expiresInSec = 300,
}: {
  job: AvailableJob;
  role: CrewRole;
  crewSize: number;
  estElapsedMinutes: number | null;
  estEarningsDollars: number | null;
  accepted?: boolean;
  onAccept: () => void;
  onPass: () => void;
  onExpire?: () => void;
  expiresInSec?: number;
}) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(expiresInSec);
  const expired = remaining <= 0;
  const isLead = role === "LEAD";

  useEffect(() => {
    if (accepted) return;
    const timer = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timer);
          onExpire?.();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accepted]);

  const handleAccept = () => {
    track(Events.CLEANER_JOB_ACCEPTED, { jobId: job.id, serviceType: job.serviceType, crew: true, role });
    onAccept();
  };
  const handlePass = () => {
    track(Events.CLEANER_JOB_DECLINED, { jobId: job.id, serviceType: job.serviceType, crew: true });
    onPass();
  };

  if (accepted) {
    return (
      <Card className="flex h-full flex-col items-center justify-center gap-2 border-seafoam-400 bg-seafoam-50 text-center dark:bg-seafoam-900/20">
        <CheckCircle2 className="h-10 w-10 text-seafoam-500" />
        <p className="text-base font-semibold text-seafoam-700 dark:text-seafoam-300">
          {t("cleaner.jobs.accept")}
        </p>
        <p className="text-xs text-slate-500">{t("common.loading")}</p>
      </Card>
    );
  }

  return (
    <Card className={cn("space-y-4", expired && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info" className="gap-1">
              <Users className="h-3 w-3" aria-hidden /> {t("cleaner.team.badge")}
            </Badge>
            <p className="text-xs font-semibold uppercase tracking-wide text-seafoam-700">
              {t(`serviceTypes.${job.serviceType}`)}
            </p>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
            <MapPin className="h-4 w-4" /> {job.area}
          </p>
        </div>
        {estEarningsDollars != null && (
          <div className="text-right">
            <p className="text-2xl font-bold text-charcoal dark:text-white">
              {formatCurrency(estEarningsDollars)}
            </p>
            <p className="text-xs text-slate-600">{t("cleaner.team.estEarnings")}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl bg-offwhite p-3 text-center text-xs dark:bg-slate-800">
        <div>
          <Users className="mx-auto mb-1 h-4 w-4 text-slate-600" aria-hidden />
          <span className="font-medium text-charcoal dark:text-white">
            {t("cleaner.team.crewOf", { count: crewSize })}
          </span>
        </div>
        <div>
          {isLead ? (
            <Crown className="mx-auto mb-1 h-4 w-4 text-slate-600" aria-hidden />
          ) : (
            <User className="mx-auto mb-1 h-4 w-4 text-slate-600" aria-hidden />
          )}
          <span className="font-medium text-charcoal dark:text-white">
            {isLead ? t("cleaner.team.roleLead") : t("cleaner.team.roleMember")}
          </span>
        </div>
        <div>
          <Clock className="mx-auto mb-1 h-4 w-4 text-slate-600" aria-hidden />
          <span className="font-medium text-charcoal dark:text-white">
            {estElapsedMinutes != null ? t("cleaner.team.minutesShort", { minutes: estElapsedMinutes }) : `${job.date}`}
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        {isLead ? t("cleaner.team.offerLeadDesc") : t("cleaner.team.offerMemberDesc")}
        {" "}
        {job.date} · {job.timeSlot}
      </p>

      {expired ? (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-red-500">{t("cleaner.jobs.decline")}</span>
          <Button variant="ghost" size="sm" onClick={onPass}>
            {t("common.close")}
          </Button>
        </div>
      ) : (
        <>
          <p
            className={cn(
              "text-center text-xs font-medium",
              remaining <= 30 ? "text-red-500" : "text-slate-600",
            )}
            aria-live="polite"
          >
            {t("cleaner.team.offerExpires", { time: fmt(remaining) })}
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={handlePass}>
              {t("cleaner.jobs.decline")}
            </Button>
            <Button fullWidth onClick={handleAccept}>
              {t("cleaner.jobs.accept")}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
