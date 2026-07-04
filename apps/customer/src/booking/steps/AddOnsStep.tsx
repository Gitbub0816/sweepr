import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Plus, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ADD_ONS, isAddOnIncludedInPackage, formatCurrency, cn } from "@sweepr/utils";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";

export function AddOnsStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const serviceType = useBookingStore((s) => s.serviceType);
  const addOnKeys = useBookingStore((s) => s.addOnKeys);
  const toggleAddOn = useBookingStore((s) => s.toggleAddOn);

  // Guard: a package must be chosen before this step is meaningful.
  useEffect(() => {
    if (!serviceType) navigate("/book/package");
  }, [serviceType, navigate]);
  if (!serviceType) return null;

  return (
    <StepShell
      title={t("booking.addons.title")}
      subtitle={t("booking.addons.subtitle")}
      onBack={() => navigate("/book/condition")}
      onNext={() => navigate("/book/schedule")}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {ADD_ONS.map((addOn) => {
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
                "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
                included
                  ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-80 dark:border-slate-700 dark:bg-slate-800/40"
                  : isSelected
                    ? "border-seafoam-400 bg-seafoam-50 ring-1 ring-seafoam-400 dark:bg-seafoam-900/20"
                    : "border-slate-200 bg-white hover:border-seafoam-300 dark:border-slate-700 dark:bg-slate-900"
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
                {included ? (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-seafoam-100 px-2 py-0.5 text-xs font-medium text-seafoam-700 dark:bg-seafoam-900/40 dark:text-seafoam-300">
                    <Check className="h-3 w-3" />
                    {t("booking.addons.includedInPackage")}
                  </span>
                ) : (
                  <span className="mt-0.5 block text-xs text-slate-500">
                    +{formatCurrency(addOn.price)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl bg-seafoam-50 px-4 py-3 dark:bg-seafoam-900/20">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-seafoam-600" />
        <p className="text-sm text-seafoam-800 dark:text-seafoam-200">
          {t("booking.addons.forgotSomething")}
        </p>
      </div>
    </StepShell>
  );
}
