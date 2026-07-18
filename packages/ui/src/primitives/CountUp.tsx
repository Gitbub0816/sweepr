/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@sweepr/utils";
import { useReducedMotion } from "../hooks/useReducedMotion";

export interface CountUpProps {
  /** Target value to tween to. */
  value: number;
  /** Tween duration in ms. Default ~600ms. */
  duration?: number;
  /**
   * Format the in-flight number for display. Defaults to a locale integer.
   * Use this for currency/earnings, e.g. `(n) => formatCurrency(n)`.
   */
  format?: (n: number) => string;
  className?: string;
}

/**
 * Animates a number from its previous value to `value` with a requestAnimation
 * Frame ease-out tween, rendered in tabular-nums so digits don't jitter width.
 * Used for earnings, StatCard values, and admin KPIs.
 *
 * Under prefers-reduced-motion it snaps straight to the final value — the point
 * of the number is the number, not the motion.
 */
export function CountUp({ value, duration = 600, format, className }: CountUpProps) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  // Track the last rendered numeric value so a mid-flight target change tweens
  // from where we are, not from zero.
  const displayRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }

    const from = displayRef.current;
    if (from === value) return;

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const next = from + (value - from) * eased;
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        displayRef.current = value;
        setDisplay(value);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration, reduced]);

  const text = format ? format(display) : Math.round(display).toLocaleString();
  return <span className={cn("tabular-nums", className)}>{text}</span>;
}
