import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@sweepr/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            "h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-charcoal placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:bg-slate-800 dark:text-white",
            error
              ? "border-red-400 focus:ring-red-400"
              : "border-slate-200 dark:border-slate-700",
            className
          )}
          {...props}
        />
        {error ? (
          <p className="mt-1 text-xs text-red-500">{error}</p>
        ) : hint ? (
          <p className="mt-1 text-xs text-slate-400">{hint}</p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = "Input";
