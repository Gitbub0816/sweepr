import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@sweepr/ui";

export function StepShell({
  title,
  subtitle,
  children,
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-charcoal dark:text-white">
        {title}
      </h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      <div className="mt-6">{children}</div>
      <div className="mt-8 flex items-center justify-between">
        {onBack ? (
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        ) : (
          <span />
        )}
        {onNext && (
          <Button onClick={onNext} disabled={nextDisabled}>
            {nextLabel} <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
