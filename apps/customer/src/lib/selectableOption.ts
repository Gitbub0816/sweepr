/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Canonical color + interaction treatment for single-select "option" buttons
 * across the booking flow (arrival windows, cadence, add-ons, room condition,
 * saved addresses, address type). Each caller keeps its own layout, padding,
 * and rounding — this just keeps the selected/unselected/disabled language
 * (and the press feedback) consistent instead of six ad-hoc variants.
 */
export const SELECTABLE_OPTION_BASE =
  "border transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

export const SELECTABLE_OPTION_SELECTED =
  "border-seafoam-400 bg-seafoam-50 ring-1 ring-seafoam-400 text-seafoam-700 dark:bg-seafoam-900/20 dark:text-seafoam-300";

export const SELECTABLE_OPTION_UNSELECTED =
  "border-slate-200 bg-white text-charcoal hover:border-seafoam-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

export const SELECTABLE_OPTION_DISABLED =
  "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600";
