/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { cn } from "@sweepr/utils";
import { useReducedMotion } from "../hooks/useReducedMotion";

export interface SuccessCheckProps {
  /** Rendered pixel size of the mark. */
  size?: number;
  /** Accessible label announced to assistive tech. */
  label?: string;
  /** Show the soft seafoam halo pulse behind the ring. Default true. */
  halo?: boolean;
  className?: string;
}

/**
 * The booking-confirmed success moment: a seafoam ring with a checkmark that
 * draws on via stroke-dashoffset, plus an optional one-shot halo. No confetti —
 * this reads as competent and calm, the Sweepr way.
 *
 * The path uses `pathLength={1}` so the draw is length-agnostic. Under
 * prefers-reduced-motion the check renders fully drawn instantly and the halo
 * is suppressed (the moving pulse would be the jarring part).
 */
export function SuccessCheck({
  size = 72,
  label = "Success",
  halo = true,
  className,
}: SuccessCheckProps) {
  const reduced = useReducedMotion();
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "relative inline-flex items-center justify-center",
        className
      )}
      style={{ width: size, height: size }}
    >
      {halo && !reduced && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-seafoam-400/30 animate-ping-soft"
        />
      )}
      <svg
        viewBox="0 0 52 52"
        width={size}
        height={size}
        fill="none"
        aria-hidden
        className="relative"
      >
        <circle
          cx="26"
          cy="26"
          r="24"
          strokeWidth="2"
          className="fill-seafoam-50 stroke-seafoam-500 dark:fill-seafoam-900/30 dark:stroke-seafoam-400"
        />
        <path
          d="M15.5 27.5 L23 34.5 L37 18.5"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={reduced ? 0 : undefined}
          className={cn(
            "stroke-seafoam-600 dark:stroke-seafoam-300",
            !reduced && "animate-check-draw"
          )}
        />
      </svg>
    </span>
  );
}
