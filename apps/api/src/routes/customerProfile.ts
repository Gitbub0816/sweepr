/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getUserByClerkId, upsertUser } from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { grantSmsConsent, revokeSmsConsent, getSmsConsent } from "../lib/smsConsent";
import { sendSms, SMS_MESSAGES } from "../lib/sms";
import type { AppBindings } from "../types";
import type { Sql } from "../lib/db";
import type { UserRow } from "@sweepr/db";

export const customerProfileRouter = new Hono<AppBindings>();

customerProfileRouter.use("*", requireAuth);

// requireAuth already provisions the user row. Use the existing row when
// possible; only call upsertUser if the row is somehow missing (e.g. very
// first request before requireAuth had a resolvable email). Passing an empty
// string to upsertUser would corrupt the email column and collide with other
// users that also lack an email claim in their JWT.
async function resolveUser(sql: Sql, clerkId: string, email?: string): Promise<UserRow> {
  const existing = await getUserByClerkId(sql, clerkId);
  if (existing) return existing;
  return upsertUser(sql, { clerkId, email: email || `${clerkId}@noemail.sweepr.local`, role: "customer" });
}

async function ensureCustomer(sql: Sql, userId: string): Promise<void> {
  await sql`INSERT INTO customers (user_id) SELECT ${userId} WHERE NOT EXISTS (SELECT 1 FROM customers WHERE user_id = ${userId})`;
}

// ─── GET /customer-profile ────────────────────────────────────────────────────
customerProfileRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");
  const user = await resolveUser(sql, authUser.clerkId, authUser.email);
  await ensureCustomer(sql, user.id);

  // These four reads are independent of one another (all keyed only on the
  // already-resolved user.id) — run them concurrently instead of one round
  // trip at a time.
  const [rows, addresses, smsConsent, langRows] = await Promise.all([
    sql`
      SELECT c.home_bedrooms, c.home_bathrooms, c.home_sqft, c.home_type,
             c.has_pets, c.onboarded, c.default_address_id
      FROM customers c
      WHERE c.user_id = ${user.id}
      LIMIT 1
    ` as unknown as Promise<Array<{
      home_bedrooms: number | null;
      home_bathrooms: number | null;
      home_sqft: number | null;
      home_type: string | null;
      has_pets: boolean;
      onboarded: boolean;
      default_address_id: string | null;
    }>>,
    sql`
      SELECT id, label, street AS line1, unit, city, state, zip, lat, lng, is_default
      FROM addresses
      WHERE user_id = ${user.id}
      ORDER BY is_default DESC, created_at DESC
    ` as unknown as Promise<Array<{
      id: string;
      label: string | null;
      line1: string;
      unit: string | null;
      city: string;
      state: string;
      zip: string;
      lat: number | null;
      lng: number | null;
      is_default: boolean;
    }>>,
    getSmsConsent(sql, user.id),
    sql`
      SELECT preferred_language FROM users WHERE id = ${user.id} LIMIT 1
    ` as unknown as Promise<Array<{ preferred_language: string | null }>>,
  ]);

  const p = rows[0] ?? {
    home_bedrooms: null, home_bathrooms: null, home_sqft: null,
    home_type: null, has_pets: false, onboarded: false, default_address_id: null,
  };
  const langRow = langRows[0];

  return c.json({
    profile: {
      onboarded: !!p.onboarded,
      homeBedrooms: p.home_bedrooms,
      homeBathrooms: p.home_bathrooms,
      homeSqft: p.home_sqft,
      homeType: p.home_type,
      hasPets: !!p.has_pets,
      defaultAddressId: p.default_address_id,
      smsConsent: smsConsent?.smsConsent ?? false,
      preferredLanguage: langRow?.preferred_language ?? null,
    },
    addresses: addresses.map((a) => ({
      id: a.id,
      label: a.label,
      line1: a.line1,
      line2: a.unit ?? undefined,
      city: a.city,
      state: a.state,
      zip: a.zip,
      lat: a.lat ?? undefined,
      lng: a.lng ?? undefined,
      isDefault: a.is_default,
    })),
  });
});

// ─── PATCH /customer-profile ──────────────────────────────────────────────────
const LANG_CODES = ["en","es","vi","zh-Hans","zh-Hant","fil","ko","ar","pt","hi"] as const;

const patchSchema = z.object({
  homeBedrooms: z.number().int().min(0).max(20).optional(),
  homeBathrooms: z.number().int().min(0).max(20).optional(),
  homeSqft: z.number().int().min(100).max(20000).optional(),
  homeType: z.enum(["apartment", "house", "condo", "townhouse", "studio", "large_house"]).optional(),
  hasPets: z.boolean().optional(),
  defaultAddressId: z.string().uuid().optional().nullable(),
  onboarded: z.boolean().optional(),
  preferredLanguage: z.enum(LANG_CODES).optional(),
  smsConsent: z.boolean().optional(),
});

customerProfileRouter.patch("/", zValidator("json", patchSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");
  const user = await resolveUser(sql, authUser.clerkId, authUser.email);
  await ensureCustomer(sql, user.id);

  const input = c.req.valid("json");

  // Validate defaultAddressId ownership before writing (prevents IDOR).
  if (input.defaultAddressId) {
    const owned = (await sql`
      SELECT id FROM addresses WHERE id = ${input.defaultAddressId} AND user_id = ${user.id} LIMIT 1
    `) as Array<{ id: string }>;
    if (!owned[0]) return c.json({ error: "Address not found" }, 404);
  }

  await sql`
    UPDATE customers SET
      home_bedrooms    = COALESCE(${input.homeBedrooms ?? null}, home_bedrooms),
      home_bathrooms   = COALESCE(${input.homeBathrooms ?? null}, home_bathrooms),
      home_sqft        = COALESCE(${input.homeSqft ?? null}, home_sqft),
      home_type        = COALESCE(${input.homeType ?? null}, home_type),
      has_pets         = COALESCE(${input.hasPets ?? null}, has_pets),
      default_address_id = COALESCE(${input.defaultAddressId ?? null}, default_address_id),
      onboarded        = COALESCE(${input.onboarded ?? null}, onboarded)
    WHERE user_id = ${user.id}
  `;
  if (input.preferredLanguage) {
    await sql`UPDATE users SET preferred_language = ${input.preferredLanguage} WHERE id = ${user.id}`;
  }

  // Explicit SMS consent change — capture IP/UA for the TCPA audit trail.
  if (input.smsConsent !== undefined) {
    const meta = {
      ip: c.req.header("CF-Connecting-IP") ?? null,
      userAgent: c.req.header("User-Agent") ?? null,
    };
    if (input.smsConsent) {
      await grantSmsConsent(sql, user.id, { ...meta, source: "customer_settings" });
      const phones = (await sql`
        SELECT phone FROM customers WHERE user_id = ${user.id} LIMIT 1
      `) as Array<{ phone: string | null }>;
      if (phones[0]?.phone) {
        // Carrier-required opt-in confirmation (best-effort).
        try {
          await sendSms(c.env, sql, {
            userId: user.id, to: phones[0].phone,
            type: "consent_confirmation", body: SMS_MESSAGES.optInConfirmation,
          });
        } catch { /* non-fatal */ }
      }
    } else {
      await revokeSmsConsent(sql, user.id, { ...meta, source: "customer_settings" });
    }
  }

  return c.json({ ok: true });
});

// ─── GET /addresses ───────────────────────────────────────────────────────────
customerProfileRouter.get("/addresses", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ addresses: [] });

  const rows = (await sql`
    SELECT id, label, street AS line1, unit, city, state, zip, lat, lng, is_default, property_type
    FROM addresses
    WHERE user_id = ${user.id}
    ORDER BY is_default DESC, created_at DESC
  `) as Array<{
    id: string;
    label: string | null;
    line1: string;
    unit: string | null;
    city: string;
    state: string;
    zip: string;
    lat: number | null;
    lng: number | null;
    is_default: boolean;
    property_type: string;
  }>;

  return c.json({
    addresses: rows.map((a) => ({
      id: a.id,
      label: a.label,
      line1: a.line1,
      line2: a.unit ?? undefined,
      city: a.city,
      state: a.state,
      zip: a.zip,
      lat: a.lat ?? undefined,
      lng: a.lng ?? undefined,
      isDefault: a.is_default,
      propertyType: a.property_type,
    })),
  });
});

// ─── PATCH /addresses/:id ────────────────────────────────────────────────────
const addressPatchSchema = z.object({
  label: z.string().max(50).nullable().optional(),
  propertyType: z.enum(["home", "short_term_rental"]).optional(),
  makeDefault: z.boolean().optional(),
});
customerProfileRouter.patch("/addresses/:id", zValidator("json", addressPatchSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "Not found" }, 404);
  const id = c.req.param("id");
  const input = c.req.valid("json");

  const owns = (await sql`SELECT 1 FROM addresses WHERE id = ${id} AND user_id = ${user.id} LIMIT 1`) as unknown[];
  if (!owns.length) return c.json({ error: "Not found" }, 404);

  if (input.label !== undefined)
    await sql`UPDATE addresses SET label = ${input.label} WHERE id = ${id}`;
  if (input.propertyType)
    await sql`UPDATE addresses SET property_type = ${input.propertyType} WHERE id = ${id}`;
  if (input.makeDefault) {
    await sql`UPDATE addresses SET is_default = false WHERE user_id = ${user.id}`;
    await sql`UPDATE addresses SET is_default = true WHERE id = ${id}`;
    await sql`UPDATE customers SET default_address_id = ${id} WHERE user_id = ${user.id}`;
  }
  return c.json({ ok: true });
});

// ─── DELETE /addresses/:id ───────────────────────────────────────────────────
customerProfileRouter.delete("/addresses/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "Not found" }, 404);
  const id = c.req.param("id");
  const rows = (await sql`
    DELETE FROM addresses WHERE id = ${id} AND user_id = ${user.id} RETURNING id
  `) as { id: string }[];
  if (!rows[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ─── POST /addresses ──────────────────────────────────────────────────────────
const addressSchema = z.object({
  street: z.string().min(3).max(200),
  unit: z.string().max(50).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(2),
  zip: z.string().min(5).max(10),
  // Accept explicit null (saved addresses without geocoding return null lat/lng);
  // z.number().optional() alone rejects null and 400'd address save at checkout.
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  label: z.string().max(50).optional(),
  propertyType: z.enum(["home", "short_term_rental"]).optional(),
  makeDefault: z.boolean().optional(),
});

customerProfileRouter.post("/addresses", zValidator("json", addressSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const authUser = c.get("user");
  const user = await resolveUser(sql, authUser.clerkId, authUser.email);
  await ensureCustomer(sql, user.id);

  const input = c.req.valid("json");
  const makeDefault = input.makeDefault ?? false;

  // Upsert: if the exact same street+city+state+zip exists for this user, return it.
  const existing = (await sql`
    SELECT id FROM addresses
    WHERE user_id = ${user.id}
      AND LOWER(street) = LOWER(${input.street})
      AND LOWER(city) = LOWER(${input.city})
      AND LOWER(state) = LOWER(${input.state})
      AND zip = ${input.zip}
    LIMIT 1
  `) as Array<{ id: string }>;

  let addressId: string;

  if (existing[0]) {
    addressId = existing[0].id;
  } else {
    if (makeDefault) {
      await sql`UPDATE addresses SET is_default = false WHERE user_id = ${user.id}`;
    }

    const rows = (await sql`
      INSERT INTO addresses (user_id, label, street, unit, city, state, zip, lat, lng, is_default, property_type)
      VALUES (
        ${user.id},
        ${input.label ?? null},
        ${input.street},
        ${input.unit ?? null},
        ${input.city},
        ${input.state},
        ${input.zip},
        ${input.lat ?? null},
        ${input.lng ?? null},
        ${makeDefault},
        ${input.propertyType ?? "home"}
      )
      RETURNING id
    `) as Array<{ id: string }>;

    addressId = rows[0].id;

    if (makeDefault) {
      await sql`
        UPDATE customers SET default_address_id = ${addressId}
        WHERE user_id = ${user.id}
      `;
    }
  }

  return c.json({ id: addressId }, 201);
});
