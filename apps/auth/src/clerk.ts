/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/** Clerk publishable key for the standard Sweepr instance
 * (clerk.getsweepr.com). May be absent until the central auth rollout is
 * wired; the page renders a graceful "almost ready" state without it. */
export const CLERK_PUBLISHABLE_KEY =
  (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)?.trim() || undefined;

export const CLERK_ENABLED = Boolean(CLERK_PUBLISHABLE_KEY);
