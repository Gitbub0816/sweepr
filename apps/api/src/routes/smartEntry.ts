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
 * Smart Entry — customer self-service (connect a lock, choose the booking's
 * access method, authorize, revoke). Cleaner reveal/unlock lives in
 * routes/cleanerAccess.ts behind the homeAccess guard.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { getDb } from "../lib/db";
import { loadSmartEntryConfig } from "../lib/smartEntryConfig";
import { setBookingAccessMethod, provisionSmartEntry, revokeSmartEntry } from "../lib/smartEntry";
import { makeSeam } from "../lib/seam";
import { isMember } from "../lib/sweeprPlus";
import { applySmartEntryFee } from "../lib/smartEntryBilling";
import { getStripe } from "../lib/stripe";
import { logger } from "../lib/logger";
import type { AppBindings } from "../types";

export const smartEntryRouter = new Hono<AppBindings>();

smartEntryRouter.use("*", requireAuth);

const CONSENT_VERSION = "smart-entry-v1";

/**
 * Smart-lock brand providers accepted by the Connect Webview (docs/seam-audit.md
 * §3.3). Deliberately does NOT include "airbnb" — that is a separate reservation
 * link with its own endpoints below. Keep in sync with the providers enabled on
 * the Seam workspace.
 */
const SMART_LOCK_PROVIDERS = [
  "august",
  "yale",
  "schlage",
  "kwikset",
  "smartthings",
  "nuki",
  "salto",
  "igloohome",
  "wyze",
  "tedee",
  "seam",
];

/** Where Seam sends the host back after the hosted authorization completes. */
const CONNECT_RETURN_URL = "https://app.getsweepr.com/smart-entry/connect/return";

async function userId(sql: ReturnType<typeof getDb>, clerkId: string): Promise<string | null> {
  const r = (await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`) as Array<{ id: string }>;
  return r[0]?.id ?? null;
}

/** True when `deviceId` belongs to a smart_lock_connection owned by `uid`. */
async function ownsDevice(
  sql: ReturnType<typeof getDb>,
  uid: string,
  deviceId: string,
): Promise<boolean> {
  const r = (await sql`
    SELECT d.id
    FROM smart_lock_devices d
    JOIN smart_lock_connections cn ON cn.id = d.connection_id
    WHERE d.id = ${deviceId} AND cn.customer_id = ${uid}
    LIMIT 1
  `) as Array<{ id: string }>;
  return !!r[0];
}

/**
 * Ensure a smart_lock_connections row exists for (uid, seamAccountId) and return
 * its id. This is the local mirror we hang synced devices off of, scoped to a
 * single Seam connected_account so one customer never sees another's locks.
 */
async function ensureConnection(
  sql: ReturnType<typeof getDb>,
  uid: string,
  seamAccountId: string,
  provider: string,
): Promise<string> {
  const rows = (await sql`
    INSERT INTO smart_lock_connections
      (customer_id, provider, provider_account_reference, status, connected_at, last_health_check_at)
    VALUES (${uid}, ${provider}, ${seamAccountId}, 'connected', NOW(), NOW())
    ON CONFLICT (customer_id, provider_account_reference) DO UPDATE
      SET status = 'connected', last_health_check_at = NOW(), updated_at = NOW()
    RETURNING id
  `) as Array<{ id: string }>;
  return rows[0].id;
}

/**
 * List devices for one connected account (SCOPED — passes connected_account_id
 * to Seam) and upsert them under that account's local connection. Returns the
 * number of devices seen.
 */
async function syncDevicesForAccount(
  sql: ReturnType<typeof getDb>,
  apiKey: string,
  uid: string,
  seamAccountId: string,
  provider: string,
): Promise<number> {
  const connectionId = await ensureConnection(sql, uid, seamAccountId, provider);
  const devices = await makeSeam(apiKey).listDevices(seamAccountId);
  for (const d of devices) {
    const p = d.properties ?? {};
    await sql`
      INSERT INTO smart_lock_devices (
        connection_id, provider_device_reference, display_name, device_type,
        supports_remote_unlock, supports_remote_lock, supports_temporary_codes,
        supports_lock_status, status
      ) VALUES (
        ${connectionId}, ${d.device_id}, ${d.display_name ?? p.model?.display_name ?? "Smart lock"},
        ${d.device_type ?? null}, ${!!p.can_remotely_unlock}, ${!!p.can_remotely_lock},
        ${!!p.can_program_online_access_codes}, ${p.locked != null || p.online != null},
        ${p.online === false ? "offline" : "active"}
      )
      ON CONFLICT (connection_id, provider_device_reference) DO UPDATE SET
        display_name             = EXCLUDED.display_name,
        device_type              = EXCLUDED.device_type,
        supports_remote_unlock   = EXCLUDED.supports_remote_unlock,
        supports_remote_lock     = EXCLUDED.supports_remote_lock,
        supports_temporary_codes = EXCLUDED.supports_temporary_codes,
        status                   = CASE WHEN smart_lock_devices.status = 'removed'
                                        THEN 'removed' ELSE EXCLUDED.status END,
        updated_at               = NOW()
    `;
  }
  return devices.length;
}

/** List the caller's connected Seam accounts (optionally filtered by provider). */
async function connectedAccounts(
  sql: ReturnType<typeof getDb>,
  uid: string,
  provider?: string,
): Promise<Array<{ seam_connected_account_id: string }>> {
  return provider
    ? ((await sql`
        SELECT seam_connected_account_id FROM seam_connected_accounts
        WHERE user_id = ${uid} AND status = 'connected'
          AND provider = ${provider} AND seam_connected_account_id IS NOT NULL
      `) as Array<{ seam_connected_account_id: string }>)
    : ((await sql`
        SELECT seam_connected_account_id FROM seam_connected_accounts
        WHERE user_id = ${uid} AND status = 'connected'
          AND seam_connected_account_id IS NOT NULL
      `) as Array<{ seam_connected_account_id: string }>);
}

/** Feature status + whether this cleaning would incur the $5 fee. */
smartEntryRouter.get("/status", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cfg = await loadSmartEntryConfig(sql);
  const uid = await userId(sql, c.get("user").clerkId);
  const member = uid ? await isMember(sql, uid) : false;
  return c.json({
    enabled: cfg.smartEntryEnabled,
    remoteUnlockEnabled: cfg.remoteUnlockEnabled,
    manualCodeEnabled: cfg.manualCodeEnabled,
    feeCents: member ? 0 : cfg.nonmemberFeeCents,
    includedWithMembership: member,
  });
});

/**
 * Start a Seam Connect Webview so the customer can authorize their smart-lock
 * brand (docs/seam-audit.md §3.3). The client opens the returned `url` in a NEW
 * TAB — never an iframe (the provider consent screen is X-Frame-Options blocked
 * cross-site). We stamp custom_metadata.user_id so the connected_account webhook
 * can correlate back to this user. Safe 503 when Seam is unconfigured.
 */
smartEntryRouter.post("/connect/start", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cfg = await loadSmartEntryConfig(sql);
  if (!cfg.smartEntryEnabled) return c.json({ error: "smart_entry_disabled" }, 403);
  if (!c.env.SEAM_API_KEY) return c.json({ error: "seam_unconfigured" }, 503);
  const uid = await userId(sql, c.get("user").clerkId);
  if (!uid) return c.json({ error: "no_account" }, 400);

  try {
    const webview = await makeSeam(c.env.SEAM_API_KEY).createConnectWebview({
      acceptedProviders: SMART_LOCK_PROVIDERS,
      customRedirectUrl: CONNECT_RETURN_URL,
      customMetadata: { user_id: uid, provider: "seam" },
    });
    await sql`
      INSERT INTO seam_connected_accounts (user_id, connect_webview_id, provider, status)
      VALUES (${uid}, ${webview.connectWebviewId}, 'seam', 'pending')
    `;
    return c.json({ url: webview.url, webviewId: webview.connectWebviewId });
  } catch (err) {
    logger.error("seam connect start failed", err, { uid });
    return c.json({ error: "connect_start_failed" }, 502);
  }
});

/**
 * Poll a Connect Webview. When Seam reports it authorized, upsert the resulting
 * connected_account, ensure the local connection mirror, and (best-effort) sync
 * the newly-available devices. Lives in the generous poll rate-limit bucket.
 */
smartEntryRouter.get("/connect/status", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const uid = await userId(sql, c.get("user").clerkId);
  if (!uid) return c.json({ error: "no_account" }, 400);
  const webviewId = c.req.query("webviewId");
  if (!webviewId) return c.json({ error: "webviewId_required" }, 400);

  // The caller must own the pending webview row.
  const owns = (await sql`
    SELECT id FROM seam_connected_accounts
    WHERE user_id = ${uid} AND connect_webview_id = ${webviewId} LIMIT 1
  `) as Array<{ id: string }>;
  if (!owns[0]) return c.json({ error: "not_found" }, 404);
  if (!c.env.SEAM_API_KEY) return c.json({ error: "seam_unconfigured" }, 503);

  try {
    const wv = await makeSeam(c.env.SEAM_API_KEY).getConnectWebview(webviewId);
    if (wv.status !== "authorized" || !wv.connected_account_id) {
      return c.json({ connected: false, status: wv.status });
    }
    const accountId = wv.connected_account_id;
    await sql`
      UPDATE seam_connected_accounts
      SET seam_connected_account_id = ${accountId}, status = 'connected', updated_at = NOW()
      WHERE user_id = ${uid} AND connect_webview_id = ${webviewId}
    `;
    await ensureConnection(sql, uid, accountId, "seam");
    await syncDevicesForAccount(sql, c.env.SEAM_API_KEY, uid, accountId, "seam");
    return c.json({ connected: true, accountId });
  } catch (err) {
    logger.error("seam connect status failed", err, { uid, webviewId });
    return c.json({ error: "connect_status_failed" }, 502);
  }
});

/**
 * List the caller's smart-lock devices, scoped to smart_lock_connections the
 * caller owns (which are themselves scoped to a single Seam connected_account —
 * fixing the audit's cross-customer leak, §1.7#2). Airbnb links are excluded
 * (provider = 'seam' only); use /airbnb/listings for those.
 */
smartEntryRouter.get("/devices", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const uid = await userId(sql, c.get("user").clerkId);
  if (!uid) return c.json({ devices: [] });
  const rows = (await sql`
    SELECT d.id, d.display_name, d.device_type, d.status,
           d.supports_remote_unlock, d.supports_temporary_codes
    FROM smart_lock_devices d
    JOIN smart_lock_connections cn ON cn.id = d.connection_id
    WHERE cn.customer_id = ${uid} AND cn.provider = 'seam'
      AND cn.status = 'connected' AND d.status != 'removed'
    ORDER BY d.display_name
  `) as Array<{
    id: string;
    display_name: string | null;
    device_type: string | null;
    status: string;
    supports_remote_unlock: boolean;
    supports_temporary_codes: boolean;
  }>;
  const devices = rows.map((d) => ({
    id: d.id,
    name: d.display_name ?? "Smart lock",
    type: d.device_type,
    online: d.status === "active",
    supportsRemoteUnlock: d.supports_remote_unlock,
    supportsTemporaryCodes: d.supports_temporary_codes,
  }));
  return c.json({ devices });
});

/**
 * Re-sync devices from Seam for the caller's connected accounts. Scoped per
 * connected_account_id — NEVER lists the whole workspace (audit §1.7#2). Safe
 * no-op without SEAM_API_KEY.
 */
smartEntryRouter.post("/devices/sync", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cfg = await loadSmartEntryConfig(sql);
  if (!cfg.smartEntryEnabled || !c.env.SEAM_API_KEY) return c.json({ synced: 0 });
  const uid = await userId(sql, c.get("user").clerkId);
  if (!uid) return c.json({ error: "no_account" }, 400);

  const accounts = await connectedAccounts(sql, uid, "seam");
  if (!accounts.length) return c.json({ synced: 0 });

  try {
    let synced = 0;
    for (const acct of accounts) {
      synced += await syncDevicesForAccount(
        sql,
        c.env.SEAM_API_KEY,
        uid,
        acct.seam_connected_account_id,
        "seam",
      );
    }
    return c.json({ synced });
  } catch (err) {
    logger.error("seam device sync failed", err, { uid });
    return c.json({ error: "sync_failed" }, 502);
  }
});

const bookingAccessSchema = z.object({
  method: z.enum(["home", "keypad_code", "smart_entry", "lockbox", "front_desk", "other"]),
  deviceId: z.string().uuid().nullish(),
  secretValue: z.string().max(2000).nullish(),
  authorize: z.boolean().optional(), // explicit consent for smart_entry
});

/** Current access selection for a booking the caller owns. */
smartEntryRouter.get("/booking/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const uid = await userId(sql, c.get("user").clerkId);
  const rows = (await sql`
    SELECT a.access_method, a.lock_device_id, a.customer_authorized_at,
           a.access_starts_at, a.access_ends_at, a.revoked_at
    FROM booking_access_authorizations a
    JOIN bookings b ON b.id = a.booking_id
    JOIN customers cu ON cu.id = b.customer_id
    WHERE a.booking_id = ${c.req.param("id")} AND cu.user_id = ${uid}
    LIMIT 1
  `) as unknown[];
  return c.json({ authorization: rows[0] ?? null });
});

/** Set the booking's access method + (for smart_entry) authorize + provision. */
smartEntryRouter.put("/booking/:id", zValidator("json", bookingAccessSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cfg = await loadSmartEntryConfig(sql);
  const uid = await userId(sql, c.get("user").clerkId);
  if (!uid) return c.json({ error: "no_account" }, 400);
  const bookingId = c.req.param("id");

  // Ownership check.
  const owns = (await sql`
    SELECT b.id FROM bookings b JOIN customers cu ON cu.id = b.customer_id
    WHERE b.id = ${bookingId} AND cu.user_id = ${uid} LIMIT 1
  `) as Array<{ id: string }>;
  if (!owns[0]) return c.json({ error: "not_found" }, 404);

  const body = c.req.valid("json");
  if (body.method === "smart_entry" && !cfg.smartEntryEnabled) {
    return c.json({ error: "smart_entry_disabled" }, 403);
  }

  // Verify a supplied device belongs to THIS customer before it is stored as
  // lock_device_id — otherwise a customer could point a booking at another
  // customer's device row (audit §1.7#4, latent IDOR).
  if (body.deviceId && !(await ownsDevice(sql, uid, body.deviceId))) {
    return c.json({ error: "device_not_found" }, 404);
  }

  const consent =
    body.method === "smart_entry" || body.authorize
      ? {
          version: CONSENT_VERSION,
          ip: c.req.header("CF-Connecting-IP") ?? null,
          sessionId: c.req.header("x-session-id") ?? null,
        }
      : null;
  if (body.method === "smart_entry" && !body.authorize) {
    return c.json({ error: "authorization_required" }, 400);
  }

  await setBookingAccessMethod(sql, c.env, {
    bookingId,
    method: body.method,
    deviceId: body.deviceId ?? null,
    secretValue: body.secretValue ?? null,
    consent,
  });

  let feeCents = 0;
  if (body.method === "smart_entry") {
    // $5 add-on for non-members (members: included). Idempotent.
    feeCents = await applySmartEntryFee(sql, getStripe(c.env.STRIPE_SECRET_KEY), c.env, bookingId, uid);
    await provisionSmartEntry(sql, c.env, bookingId);
  }
  return c.json({ ok: true, smartEntryFeeCents: feeCents });
});

const deviceAttachSchema = z.object({ deviceId: z.string().uuid() });

/**
 * Attach a chosen smart-lock device to a booking's access authorization, then
 * provision the Seam access grant. This is the missing wire (audit §1.7#1):
 * setBookingAccessMethod stores lock_device_id, and provisionSmartEntry joins
 * smart_lock_devices → provider_device_reference → createCodeGrant, so a PIN is
 * finally programmed for smart_entry bookings. Requires an existing smart_entry
 * authorization the caller has consented to.
 */
smartEntryRouter.put("/booking/:id/device", zValidator("json", deviceAttachSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cfg = await loadSmartEntryConfig(sql);
  if (!cfg.smartEntryEnabled) return c.json({ error: "smart_entry_disabled" }, 403);
  const uid = await userId(sql, c.get("user").clerkId);
  if (!uid) return c.json({ error: "no_account" }, 400);
  const bookingId = c.req.param("id");
  const { deviceId } = c.req.valid("json");

  // Ownership: caller owns the booking AND the device.
  const owns = (await sql`
    SELECT b.id FROM bookings b JOIN customers cu ON cu.id = b.customer_id
    WHERE b.id = ${bookingId} AND cu.user_id = ${uid} LIMIT 1
  `) as Array<{ id: string }>;
  if (!owns[0]) return c.json({ error: "not_found" }, 404);
  if (!(await ownsDevice(sql, uid, deviceId))) return c.json({ error: "device_not_found" }, 404);

  // The booking must already have a smart_entry authorization (method + consent
  // set via PUT /booking/:id). Attach the device to it.
  const updated = (await sql`
    UPDATE booking_access_authorizations
    SET lock_device_id = ${deviceId}, updated_at = NOW()
    WHERE booking_id = ${bookingId} AND access_method = 'smart_entry' AND revoked_at IS NULL
    RETURNING id
  `) as Array<{ id: string }>;
  if (!updated[0]) return c.json({ error: "no_smart_entry_authorization" }, 409);

  await provisionSmartEntry(sql, c.env, bookingId);
  return c.json({ ok: true });
});

// ── Airbnb → Seam link (Sweepr-native reservation + smart-lock link) ─────────
// COMPLEMENTS, does NOT duplicate, the existing .ics calendar sync
// (calendar_sources / imported_calendar_reservations, provider 'airbnb' in
// routes/rentals.ts + lib/calendarSync.ts), which is READ-ONLY checkout dates.
// This Seam-managed link additionally exposes structured reservations AND the
// ability to program the listing's smart lock. Per docs/seam-audit.md §3.2,
// when a property has a Seam-Airbnb connection prefer it and suppress the
// ICS-derived duplicate; keep ICS as the zero-integration default.
// The Airbnb consent screen is Airbnb's own hosted OAuth (unavoidable) — we
// launch the Connect Webview url in a new tab, exactly like the lock-brand flow.

/** Start the Airbnb Connect Webview. Returns the hosted-consent url + webviewId. */
smartEntryRouter.post("/airbnb/connect/start", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cfg = await loadSmartEntryConfig(sql);
  if (!cfg.smartEntryEnabled) return c.json({ error: "smart_entry_disabled" }, 403);
  if (!c.env.SEAM_API_KEY) return c.json({ error: "seam_unconfigured" }, 503);
  const uid = await userId(sql, c.get("user").clerkId);
  if (!uid) return c.json({ error: "no_account" }, 400);

  try {
    const webview = await makeSeam(c.env.SEAM_API_KEY).createConnectWebview({
      acceptedProviders: ["airbnb"],
      customRedirectUrl: CONNECT_RETURN_URL,
      customMetadata: { user_id: uid, provider: "airbnb" },
    });
    await sql`
      INSERT INTO seam_connected_accounts (user_id, connect_webview_id, provider, status)
      VALUES (${uid}, ${webview.connectWebviewId}, 'airbnb', 'pending')
    `;
    return c.json({ url: webview.url, webviewId: webview.connectWebviewId });
  } catch (err) {
    logger.error("seam airbnb connect start failed", err, { uid });
    return c.json({ error: "connect_start_failed" }, 502);
  }
});

/** Poll the Airbnb Connect Webview; on success upsert the connected_account. */
smartEntryRouter.get("/airbnb/connect/status", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const uid = await userId(sql, c.get("user").clerkId);
  if (!uid) return c.json({ error: "no_account" }, 400);
  const webviewId = c.req.query("webviewId");
  if (!webviewId) return c.json({ error: "webviewId_required" }, 400);

  const owns = (await sql`
    SELECT id FROM seam_connected_accounts
    WHERE user_id = ${uid} AND connect_webview_id = ${webviewId} AND provider = 'airbnb' LIMIT 1
  `) as Array<{ id: string }>;
  if (!owns[0]) return c.json({ error: "not_found" }, 404);
  if (!c.env.SEAM_API_KEY) return c.json({ error: "seam_unconfigured" }, 503);

  try {
    const wv = await makeSeam(c.env.SEAM_API_KEY).getConnectWebview(webviewId);
    if (wv.status !== "authorized" || !wv.connected_account_id) {
      return c.json({ connected: false, status: wv.status });
    }
    const accountId = wv.connected_account_id;
    await sql`
      UPDATE seam_connected_accounts
      SET seam_connected_account_id = ${accountId}, status = 'connected', updated_at = NOW()
      WHERE user_id = ${uid} AND connect_webview_id = ${webviewId}
    `;
    await ensureConnection(sql, uid, accountId, "airbnb");
    return c.json({ connected: true, accountId });
  } catch (err) {
    logger.error("seam airbnb connect status failed", err, { uid, webviewId });
    return c.json({ error: "connect_status_failed" }, 502);
  }
});

/**
 * List the caller's Airbnb listings as surfaced by Seam (listings appear as Seam
 * devices/resources once the account is linked — docs/seam-audit.md §3.1). Empty
 * list when no Airbnb account is connected.
 */
smartEntryRouter.get("/airbnb/listings", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const uid = await userId(sql, c.get("user").clerkId);
  if (!uid) return c.json({ listings: [] });
  if (!c.env.SEAM_API_KEY) return c.json({ listings: [] });

  const accounts = await connectedAccounts(sql, uid, "airbnb");
  if (!accounts.length) return c.json({ listings: [] });

  try {
    const seam = makeSeam(c.env.SEAM_API_KEY);
    const listings: Array<{ id: string; name: string; type: string | null; online: boolean }> = [];
    for (const acct of accounts) {
      const devices = await seam.listDevices(acct.seam_connected_account_id);
      for (const d of devices) {
        listings.push({
          id: d.device_id,
          name: d.display_name ?? d.properties?.model?.display_name ?? "Airbnb listing",
          type: d.device_type ?? null,
          online: d.properties?.online !== false,
        });
      }
    }
    return c.json({ listings });
  } catch (err) {
    logger.error("seam airbnb listings failed", err, { uid });
    return c.json({ error: "listings_failed" }, 502);
  }
});

/** Customer revokes access for a booking (spec §15). */
smartEntryRouter.post("/booking/:id/revoke", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const uid = await userId(sql, c.get("user").clerkId);
  const owns = (await sql`
    SELECT b.id FROM bookings b JOIN customers cu ON cu.id = b.customer_id
    WHERE b.id = ${c.req.param("id")} AND cu.user_id = ${uid} LIMIT 1
  `) as Array<{ id: string }>;
  if (!owns[0]) return c.json({ error: "not_found" }, 404);
  await revokeSmartEntry(sql, c.env, c.req.param("id"), "customer_revoked");
  return c.json({ ok: true });
});
