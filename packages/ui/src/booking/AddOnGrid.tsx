import type { AddOn } from "@sweepr/types";
import { Check, Plus } from "lucide-react";
import { cn, formatCurrency } from "@sweepr/utils";

export function AddOnGrid({
  addOns,
  selected,
  onToggle,
}: {
  addOns: AddOn[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {addOns.map((addOn) => {
        const isSelected = selected.includes(addOn.key);
        return (
          <button
            key={addOn.key}
            type="button"
            onClick={() => onToggle(addOn.key)}
            className={cn(
              "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all",
              isSelected
                ? "border-seafoam-400 bg-seafoam-50 ring-1 ring-seafoam-400 dark:bg-seafoam-900/20"
                : "border-slate-200 bg-white hover:border-seafoam-300 dark:border-slate-700 dark:bg-slate-900"
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full",
                isSelected
                  ? "bg-seafoam-500 text-white"
                  : "bg-slate-100 text-slate-400 dark:bg-slate-800"
              )}
            >
              {isSelected ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="text-sm font-medium text-charcoal dark:text-white">
              {addOn.name}
            </span>
            <span className="text-xs text-slate-500">
              +{formatCurrency(addOn.price)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
