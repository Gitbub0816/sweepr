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
 * Auth application registry — the four Clerk applications of the multi-app
 * architecture, config-driven so boundaries activate only once their Clerk
 * secret key is provisioned:
 *
 *   customer  clerk.getsweepr.com            (primary — live today)
 *   business  clerk.business.getsweepr.com   (dark until CLERK_BUSINESS_SECRET_KEY)
 *   cleaner   clerk.clean.getsweepr.com      (dark until CLERK_CLEANER_SECRET_KEY;
 *                                             cleaners currently share the primary
 *                                             instance, so cleaner-issued tokens
 *                                             resolve to app "customer" until the
 *                                             split ships)
 *   admin     clerk.admin.getsweepr.com      (live today, separate staff app)
 *
 * Issuer matching only selects WHICH secret key to verify against; the token
 * is always cryptographically verified. A forged `iss` merely picks a key it
 * can never validate against.
 */

import type { Env } from "../types";

export type AuthApplication = "customer" | "business" | "cleaner" | "admin";

export const AUTH_APPLICATIONS: readonly AuthApplication[] = [
  "customer",
  "business",
  "cleaner",
  "admin",
] as const;

export function isAuthApplication(v: string): v is AuthApplication {
  return (AUTH_APPLICATIONS as readonly string[]).includes(v);
}

interface AppConfig {
  app: AuthApplication;
  /** Substring of the token's iss that routes to this app. Order matters —
   * more specific hosts are checked before the primary catch-all. */
  issuerMatch: string;
  secretKey: (env: Env) => string | undefined;
}

/**
 * Ordered issuer routing table. `admin.getsweepr.com` and
 * `business.getsweepr.com` are checked before the primary because every
 * instance's issuer host ends in getsweepr.com.
 */
function registry(env: Env): AppConfig[] {
  return [
    {
      app: "admin",
      issuerMatch: "admin.getsweepr.com",
      secretKey: (e) => e.CLERK_ADMIN_SECRET_KEY,
    },
    {
      app: "business",
      issuerMatch: "business.getsweepr.com",
      secretKey: (e) => e.CLERK_BUSINESS_SECRET_KEY,
    },
    // Dedicated cleaner instance (future split). Only routes here once the
    // key exists; until then clean.getsweepr.com tokens are issued by the
    // primary instance and fall through to "customer" below.
    ...(env.CLERK_CLEANER_SECRET_KEY
      ? [
          {
            app: "cleaner" as const,
            issuerMatch: "clean.getsweepr.com",
            secretKey: (e: Env) => e.CLERK_CLEANER_SECRET_KEY,
          },
        ]
      : []),
    {
      app: "customer",
      issuerMatch: "getsweepr.com",
      secretKey: (e) => e.CLERK_SECRET_KEY,
    },
  ];
}

export interface ResolvedAuthApp {
  app: AuthApplication;
  secretKey: string;
}

/**
 * Route an (unverified) issuer string to the auth application whose secret
 * should verify the token. Returns undefined when no configured app matches —
 * including issuers for apps whose key isn't provisioned yet (dark boundary).
 * Unknown issuers default to the primary/customer app, preserving today's
 * behavior for non-production Clerk dev instances (e.g. *.clerk.accounts.dev).
 */
export function resolveAuthApp(iss: string, env: Env): ResolvedAuthApp | undefined {
  for (const entry of registry(env)) {
    if (!iss.includes(entry.issuerMatch)) continue;
    const secretKey = entry.secretKey(env);
    return secretKey ? { app: entry.app, secretKey } : undefined;
  }
  // Dev/preview issuers (Clerk dev instances) verify against the primary key.
  const primary = env.CLERK_SECRET_KEY;
  return primary ? { app: "customer", secretKey: primary } : undefined;
}
