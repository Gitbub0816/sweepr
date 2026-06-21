import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { cn, formatCurrency } from "@sweepr/utils";

export function ServiceCard({
  icon: Icon,
  name,
  description,
  price,
  priceSuffix,
  selected,
  onSelect,
}: {
  icon: LucideIcon;
  name: string;
  description: string;
  price: number;
  priceSuffix?: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative w-full rounded-2xl border p-5 text-left transition-all",
        selected
          ? "border-seafoam-400 bg-seafoam-50 ring-2 ring-seafoam-400 dark:bg-seafoam-900/20"
          : "border-slate-200 bg-white hover:border-seafoam-300 dark:border-slate-700 dark:bg-slate-900"
      )}
    >
      {selected && (
        <span className="absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full bg-seafoam-500 text-white">
          <Check className="h-3 w-3" />
        </span>
      )}
      <div
        className={cn(
          "mb-3 flex h-10 w-10 items-center justify-center rounded-xl",
          selected
            ? "bg-seafoam-500 text-white"
            : "bg-seafoam-50 text-seafoam-600 dark:bg-slate-800"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-semibold text-charcoal dark:text-white">{name}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <p className="mt-3 text-lg font-bold text-charcoal dark:text-white">
        from {formatCurrency(price)}
        {priceSuffix && (
          <span className="text-sm font-normal text-slate-400">
            {" "}
            {priceSuffix}
          </span>
        )}
      </p>
    </button>
  );
}
