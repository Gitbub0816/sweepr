/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { HTMLAttributes } from "react";
import { cn } from "@sweepr/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Opt-in hover affordance for cards that are themselves clickable (a whole
   * card that navigates or selects). Adds a subtle warm lift + shadow on
   * hover-capable pointers only. Leave off for static content cards.
   */
  interactive?: boolean;
}

export function Card({ className, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900",
        interactive &&
          "transition-[transform,box-shadow] duration-base ease-out-quart [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-lg [@media(hover:hover)]:hover:shadow-charcoal/[0.06]",
        className
      )}
      {...props}
    />
  );
}
