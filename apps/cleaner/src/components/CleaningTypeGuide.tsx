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
 * Cleaning-type guide + accepted-job-types picker.
 *
 * The guide explains Sweepr's four cleaning types in plain language (Standard,
 * Deep Clean, Move-In/Out, Airbnb/Turnover). The picker edits the cleaner's
 * canonical job-type preferences (cleaners.accepted_job_types): three toggles,
 * because Deep Clean is auto-classified inside Standard jobs and cannot be
 * opted out of separately. Used on the onboarding Services step and in
 * dashboard Settings; matching enforces the choice server-side.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Sparkles, Layers, Truck, BedDouble } from "lucide-react";

export const ACCEPTED_JOB_TYPES = ["standard", "move_in_out", "vacation_rental"] as const;
export type AcceptedJobType = (typeof ACCEPTED_JOB_TYPES)[number];

const GUIDE_SECTIONS = [
  { key: "standard", Icon: Sparkles },
  { key: "deep", Icon: Layers },
  { key: "moveInOut", Icon: Truck },
  { key: "airbnb", Icon: BedDouble },
] as const;

/** Expandable plain-language explainer for the four cleaning types. */
export function CleaningTypeGuide({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className={`space-y-2 ${className}`}>
      {GUIDE_SECTIONS.map(({ key, Icon }) => {
        const expanded = open === key;
        return (
          <div
            key={key}
            className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
          >
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : key)}
              aria-expanded={expanded}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-charcoal hover:bg-slate-50 dark:text-white dark:hover:bg-slate-800"
            >
              <Icon size={16} className="shrink-0 text-seafoam-700" />
              <span className="flex-1">{t(`cleaningTypes.${key}.title`)}</span>
              <ChevronDown
                size={16}
                className={`shrink-0 text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </button>
            {expanded && (
              <div className="border-t border-slate-100 px-3 py-2.5 text-sm leading-relaxed text-slate-600 dark:border-slate-700 dark:text-slate-300">
                {t(`cleaningTypes.${key}.body`)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Toggle group for the three canonical accepted job types. At least one must
 * stay selected; a toggle that would leave zero selected is ignored and the
 * hint below turns into a warning.
 */
export function AcceptedJobTypesPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: AcceptedJobType[]) => void;
}) {
  const { t } = useTranslation();
  const [warnedEmpty, setWarnedEmpty] = useState(false);

  const labels: Record<AcceptedJobType, string> = {
    standard: t("cleaningTypes.acceptStandardLabel"),
    move_in_out: t("cleaningTypes.acceptMoveLabel"),
    vacation_rental: t("cleaningTypes.acceptAirbnbLabel"),
  };

  function toggle(type: AcceptedJobType) {
    const has = value.includes(type);
    if (has && value.length <= 1) {
      setWarnedEmpty(true);
      return;
    }
    setWarnedEmpty(false);
    const next = has
      ? (value.filter((x) => x !== type) as AcceptedJobType[])
      : ([...value, type] as AcceptedJobType[]);
    onChange(ACCEPTED_JOB_TYPES.filter((x) => next.includes(x)) as AcceptedJobType[]);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {ACCEPTED_JOB_TYPES.map((type) => {
          const active = value.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggle(type)}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-seafoam-500 bg-seafoam-50 text-seafoam-700 dark:bg-seafoam-900/20"
                  : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700"
              }`}
            >
              {labels[type]}
            </button>
          );
        })}
      </div>
      <p className={`text-xs ${warnedEmpty ? "font-medium text-amber-600" : "text-slate-500"}`}>
        {warnedEmpty ? t("cleaningTypes.atLeastOne") : t("cleaningTypes.deepNote")}
      </p>
    </div>
  );
}
