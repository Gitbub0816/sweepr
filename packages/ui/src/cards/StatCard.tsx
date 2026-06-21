import type { LucideIcon } from "lucide-react";
import { cn } from "@sweepr/utils";
import { Card } from "../primitives/Card";

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  deltaPositive,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  delta?: string;
  deltaPositive?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        {Icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold text-charcoal dark:text-white">
        {value}
      </p>
      {delta && (
        <p
          className={cn(
            "mt-1 text-xs font-medium",
            deltaPositive ? "text-emerald-500" : "text-red-500"
          )}
        >
          {delta}
        </p>
      )}
    </Card>
  );
}
