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
 * Typed Worker bindings for the MCP pricing-sandbox worker. Access env ONLY
 * via `c.env.X` (Workers — never process.env). Secret catalog = comments in
 * apps/mcp/wrangler.toml.
 */
export interface Env {
  ENVIRONMENT?: string;
  /** Kill switch: unless exactly "true", every endpoint returns 503. */
  MCP_ENABLED?: string;
  DATABASE_URL: string;
  /** sk_live_… of the SEPARATE admin Clerk app (clerk.admin.getsweepr.com). */
  CLERK_ADMIN_SECRET_KEY: string;
  /** HMAC key for all OAuth state (clients, codes, tokens, share links). */
  MCP_TOKEN_SECRET: string;
  /** Optional comma-separated overrides matching apps/api owner bootstrap. */
  SUPER_ADMIN_EMAILS?: string;
  SUPER_ADMIN_CLERK_IDS?: string;
}

/** Hono generics for this app. */
export type AppBindings = {
  Bindings: Env;
  Variables: {
    /** Verified admin email of the OAuth session on /mcp requests. */
    adminEmail: string;
  };
};
