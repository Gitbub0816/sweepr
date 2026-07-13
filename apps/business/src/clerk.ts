/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/** Clerk publishable key for the Sweepr Business application. May be absent
 * until the business Clerk application is provisioned. */
export const CLERK_PUBLISHABLE_KEY =
  (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)?.trim() || undefined;

export const CLERK_ENABLED = Boolean(CLERK_PUBLISHABLE_KEY);
