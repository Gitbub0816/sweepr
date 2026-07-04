import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "@sweepr/ui";
import {
  BASE_PRICES,
  SERVICE_LABELS,
  PACKAGE_SCOPES,
  UNIVERSAL_EXCLUSIONS,
  getPackageScope,
  formatCurrency,
  cn,
} from "@sweepr/utils";
import type { ServiceType } from "@sweepr/types";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";

const LEGAL_URL = import.meta.env.VITE_LEGAL_URL || "https://legal.sweepr.com";

// Packages the booking API accepts (createSchema serviceType enum).
const PACKAGE_ORDER: ServiceType[] = ["standard", "deep", "move_in_out", "recurring"];

const PACKAGE_TAGLINES: Record<string, string> = {
  standard: "booking.package.standardTagline",
  deep: "booking.package.deepTagline",
  move_in_out: "booking.package.moveInOutTagline",
  recurring: "booking.package.recurringTagline",
};

function InclusionsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("booking.package.fullScopeTitle")}
      className="max-h-[85vh] max-w-2xl overflow-y-auto"
    >
      <div className="space-y-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("booking.package.fullScopeIntro")}
        </p>
        {PACKAGE_ORDER.map((type) => {
          const scope = getPackageScope(type);
          if (!scope) return null;
          return (
            <div key={type} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-charcoal dark:text-white">
                {SERVICE_LABELS[type]}
              </h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-seafoam-700 dark:text-seafoam-300">
                    {t("booking.package.included")}
                  </p>
                  <ul className="space-y-1">
                    {scope.included.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-seafoam-600" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("booking.package.notIncluded")}
                  </p>
                  <ul className="space-y-1">
                    {scope.excluded.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-slate-400">
                        <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}
        <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/40">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("booking.package.universalExclusions")}
          </p>
          <ul className="space-y-1">
            {UNIVERSAL_EXCLUSIONS.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-slate-500 dark:text-slate-400">
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {t("booking.package.legalNote")}{" "}
            <a
              href={`${LEGAL_URL}/service-scope`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-seafoam-700 underline dark:text-seafoam-300"
            >
              {t("booking.package.serviceScopePolicy")}
            </a>
            .
          </p>
        </div>
      </div>
    </Modal>
  );
}

function Pillar({
  type,
  selected,
  onSelect,
  onViewScope,
}: {
  type: ServiceType;
  selected: boolean;
  onSelect: () => void;
  onViewScope: () => void;
}) {
  const { t } = useTranslation();
  const scope = getPackageScope(type)!;
  const banner = scope.banner;
  const inheritsFrom = scope.inheritsFrom;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "relative flex w-full min-w-[15rem] flex-col rounded-2xl border p-5 text-left transition-all duration-300 motion-reduce:transition-none",
        selected
          ? "z-10 scale-105 border-seafoam-400 bg-seafoam-50 ring-2 ring-seafoam-400 shadow-lg dark:bg-seafoam-900/20 sm:scale-110"
          : "border-slate-200 bg-white hover:border-seafoam-300 dark:border-slate-700 dark:bg-slate-900"
      )}
    >
      {banner && (
        <span className="mb-3 inline-flex w-fit items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          {banner}
        </span>
      )}
      <h3 className="text-lg font-bold text-charcoal dark:text-white">
        {SERVICE_LABELS[type]}
      </h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {t(PACKAGE_TAGLINES[type] ?? "", { defaultValue: "" })}
      </p>
      <p className="mt-3 text-2xl font-bold text-charcoal dark:text-white">
        {t("booking.package.from")} {formatCurrency(BASE_PRICES[type] ?? 0)}
      </p>

      {inheritsFrom && (
        <p className="mt-3 rounded-lg bg-seafoam-50 px-3 py-2 text-xs font-medium text-seafoam-700 dark:bg-seafoam-900/30 dark:text-seafoam-300">
          {t("booking.package.includesEverythingFrom", {
            tier: SERVICE_LABELS[inheritsFrom],
          })}
        </p>
      )}

      <ul className="mt-4 space-y-1.5">
        {scope.included.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-charcoal dark:text-slate-200">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-seafoam-600" />
            {item}
          </li>
        ))}
      </ul>

      {scope.excluded.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {scope.excluded.slice(0, 4).map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-slate-400">
              <X className="mt-0.5 h-4 w-4 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      )}

      <span
        role="link"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onViewScope();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onViewScope();
          }
        }}
        className="mt-4 cursor-pointer text-xs font-medium text-seafoam-700 underline underline-offset-2 hover:text-seafoam-800 dark:text-seafoam-300"
      >
        {t("booking.package.viewFullScope")}
      </span>
    </button>
  );
}

export function PackageStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const serviceType = useBookingStore((s) => s.serviceType);
  const setService = useBookingStore((s) => s.setService);
  const [scopeOpen, setScopeOpen] = useState(false);

  const packages = PACKAGE_ORDER.filter((type) => PACKAGE_SCOPES[type]);

  return (
    <StepShell
      title={t("booking.package.title")}
      subtitle={t("booking.package.subtitle")}
      onBack={() => navigate("/book/home")}
      onNext={() => navigate("/book/condition")}
      nextDisabled={!serviceType}
    >
      <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-4 pt-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
        {packages.map((type) => (
          <Pillar
            key={type}
            type={type}
            selected={serviceType === type}
            onSelect={() => setService(type)}
            onViewScope={() => setScopeOpen(true)}
          />
        ))}
      </div>

      <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
        {t("booking.package.helper")}{" "}
        <button
          type="button"
          onClick={() => setScopeOpen(true)}
          className="font-medium text-seafoam-700 underline dark:text-seafoam-300"
        >
          {t("booking.package.viewCompleteInclusions")}
        </button>
      </p>

      <InclusionsModal open={scopeOpen} onOpenChange={setScopeOpen} />
    </StepShell>
  );
}
