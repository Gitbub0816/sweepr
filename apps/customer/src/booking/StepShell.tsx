import { useEffect, useRef, type ReactNode } from "react";
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
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the step heading whenever a new step mounts, so keyboard
  // and screen-reader users get taken to the top of the new step instead of
  // silently staying wherever focus was left on the previous page.
  useEffect(() => {
    headingRef.current?.focus();
  }, [title]);

  return (
    <div>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-bold text-charcoal dark:text-white focus:outline-none"
      >
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
