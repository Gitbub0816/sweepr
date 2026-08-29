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
import { useNavigate } from "react-router-dom";
import { Check, Plus, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ADD_ONS, isAddOnIncludedInPackage, cn } from "@sweepr/utils";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";
import {
  SELECTABLE_OPTION_BASE,
  SELECTABLE_OPTION_SELECTED,
  SELECTABLE_OPTION_UNSELECTED,
  SELECTABLE_OPTION_DISABLED,
} from "../../lib/selectableOption";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

/** The only presentation the wizard shows for an add-on is its key + name. */
type OfferedAddOn = { key: string; name: string };

/** Static fallback used until the live catalogue loads (or if it fails). */
const STATIC_ADDONS: OfferedAddOn[] = ADD_ONS.map((a) => ({ key: a.key, name: a.name }));

export function AddOnsStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const serviceType = useBookingStore((s) => s.serviceType);
  const addOnKeys = useBookingStore((s) => s.addOnKeys);
  const toggleAddOn = useBookingStore((s) => s.toggleAddOn);
  const extraCleanerRequested = useBookingStore((s) => s.extraCleanerRequested);
  const setExtraCleanerRequested = useBookingStore((s) => s.setExtraCleanerRequested);

  // Add-ons offered come from the Active pricing version when one is published
  // (so a new add-on introduced in a version shows up here without a code
  // change); otherwise the static catalogue. Falls back to static on any error
  // so the step always renders.
  const [offered, setOffered] = useState<OfferedAddOn[]>(STATIC_ADDONS);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/pricing/addons`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { addOns?: OfferedAddOn[] }) => {
        if (!cancelled && Array.isArray(data.addOns) && data.addOns.length > 0) {
          setOffered(data.addOns);
        }
      })
      .catch(() => {
        /* keep the static fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Guard: a package must be chosen before this step is meaningful.
  useEffect(() => {
    if (!serviceType) navigate("/book/rooms");
  }, [serviceType, navigate]);
  if (!serviceType) return null;

  return (
    <StepShell
      title={t("booking.addons.title")}
      subtitle={t("booking.addons.subtitle")}
      onBack={() => navigate("/book/rooms")}
      onNext={() => navigate("/book/schedule")}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {offered.map((addOn) => {
          const included = isAddOnIncludedInPackage(addOn.key, serviceType);
          const isSelected = addOnKeys.includes(addOn.key);
          return (
            <button
              key={addOn.key}
              type="button"
              disabled={included}
              onClick={() => !included && toggleAddOn(addOn.key)}
              aria-pressed={isSelected}
              className={cn(
                SELECTABLE_OPTION_BASE,
                "flex items-start gap-3 rounded-xl p-4 text-left",
                included
                  ? cn(SELECTABLE_OPTION_DISABLED, "opacity-80")
                  : isSelected
                    ? SELECTABLE_OPTION_SELECTED
                    : SELECTABLE_OPTION_UNSELECTED
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  isSelected || included
                    ? "bg-seafoam-700 text-white"
                    : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                )}
              >
                {isSelected || included ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium text-charcoal dark:text-white">
                  {addOn.name}
                </span>
                {/* No per-add-on pricing shown, the final owed total appears
                    only at the review step. */}
                {included && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-seafoam-100 px-2 py-0.5 text-xs font-medium text-seafoam-700 dark:bg-seafoam-900/40 dark:text-seafoam-300">
                    <Check className="h-3 w-3" />
                    {t("booking.addons.includedInPackage")}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setExtraCleanerRequested(!extraCleanerRequested)}
        aria-pressed={extraCleanerRequested}
        className={cn(
          SELECTABLE_OPTION_BASE,
          "mt-6 flex w-full items-start gap-3 rounded-xl p-4 text-left",
          extraCleanerRequested ? SELECTABLE_OPTION_SELECTED : SELECTABLE_OPTION_UNSELECTED
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
            extraCleanerRequested
              ? "bg-seafoam-700 text-white"
              : "bg-slate-100 text-slate-400 dark:bg-slate-800"
          )}
        >
          {extraCleanerRequested ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </span>
        <span className="flex-1">
          <span className="block text-sm font-medium text-charcoal dark:text-white">
            Add an extra cleaner (finish faster)
          </span>
          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
            Send a second cleaner so your home is done in less time. A small flat
            fee applies and appears in your total at review.
          </span>
        </span>
      </button>

      <div className="mt-6 flex items-start gap-3 rounded-2xl bg-seafoam-50 px-4 py-3 dark:bg-seafoam-900/20">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-seafoam-600" />
        <p className="text-sm text-seafoam-800 dark:text-seafoam-200">
          {t("booking.addons.forgotSomething")}
        </p>
      </div>
    </StepShell>
  );
}
