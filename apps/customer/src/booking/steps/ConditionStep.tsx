import { useNavigate } from "react-router-dom";
import { Check, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CLEANING_LEVELS, calculateQuote, formatCurrency, cn } from "@sweepr/utils";
import type { CleaningLevel } from "@sweepr/types";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";

export function ConditionStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const serviceType = useBookingStore((s) => s.serviceType);
  const home = useBookingStore((s) => s.home);
  const addOnKeys = useBookingStore((s) => s.addOnKeys);
  const isEmergency = useBookingStore((s) => s.isEmergency);
  const cleaningLevel = useBookingStore((s) => s.cleaningLevel);
  const setCleaningLevel = useBookingStore((s) => s.setCleaningLevel);

  // Live per-level surcharge preview (matches the server's percentage math).
  function surchargeFor(level: CleaningLevel): number {
    if (!serviceType || level === "refresh") return 0;
    const quote = calculateQuote({ serviceType, home, addOnKeys, isEmergency, cleaningLevel: level });
    const line = quote.lineItems.find((li) => li.label === "Cleaning level surcharge");
    return line?.amount ?? 0;
  }

  return (
    <StepShell
      title={t("booking.condition.title")}
      subtitle={t("booking.condition.subtitle")}
      onBack={() => navigate("/book/package")}
      onNext={() => navigate("/book/addons")}
      nextDisabled={!cleaningLevel}
    >
      <div role="radiogroup" aria-label={t("booking.condition.title")} className="space-y-3">
        {CLEANING_LEVELS.map((level) => {
          const selected = cleaningLevel === level.key;
          const surcharge = surchargeFor(level.key);
          const isSignificant = level.key === "significant_attention";
          return (
            <button
              key={level.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setCleaningLevel(level.key)}
              className={cn(
                "relative w-full rounded-2xl border p-5 text-left transition-all",
                selected
                  ? "border-seafoam-400 bg-seafoam-50 ring-2 ring-seafoam-400 dark:bg-seafoam-900/20"
                  : "border-slate-200 bg-white hover:border-seafoam-300 dark:border-slate-700 dark:bg-slate-900"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-charcoal dark:text-white">{level.title}</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {level.description}
                  </p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium">{t("booking.condition.recommendedFor")}</span>{" "}
                    {level.recommendedFor}
                  </p>
                  <p className="mt-2 text-xs font-medium text-charcoal dark:text-slate-200">
                    {surcharge > 0
                      ? t("booking.condition.surchargeAmount", { amount: formatCurrency(surcharge) })
                      : level.surchargeNote}
                  </p>
                </div>
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                    selected
                      ? "border-seafoam-600 bg-seafoam-600 text-white"
                      : "border-slate-300 text-transparent dark:border-slate-600"
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
              </div>
              {isSignificant && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{t("booking.condition.significantWarning")}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}
