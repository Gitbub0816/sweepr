/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

const SIZES = { sm: "h-8", md: "h-12", lg: "h-16" } as const;

/** Sweepr Business wordmark (metallic platinum). The mark is dark, so
 * dark mode floats it on a soft light chip to keep it legible. */
export function BusinessLogo({ size = "md" }: { size?: keyof typeof SIZES }) {
  return (
    <span className="inline-flex rounded-xl dark:bg-white/90 dark:px-2.5 dark:py-1.5">
      <img
        src="/brand/sweepr-business-logo.png"
        alt="Sweepr Business"
        className={`${SIZES[size]} w-auto select-none`}
        draggable={false}
      />
    </span>
  );
}
