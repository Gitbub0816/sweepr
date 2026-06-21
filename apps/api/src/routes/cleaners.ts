import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getCleanerByUserId, getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { getStripe } from "../lib/stripe";
import { handleOfferResponse } from "../lib/assignment";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";
import type { Context } from "hono";

/** Resolve the current user's cleaner row, or null. */
async function currentCleaner(c: Context<AppBindings>) {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return { sql, user: null, cleaner: null };
  const cleaner = await getCleanerByUserId(sql, user.id);
  return { sql, user, cleaner };
}

export const cleanersRouter = new Hono<AppBindings>();

cleanersRouter.use("*", requireAuth);

cleanersRouter.get("/me", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "User not found" }, 404);
  const cleaner = await getCleanerByUserId(sql, user.id);
  return c.json({ cleaner });
});

const profileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

cleanersRouter.patch("/me", zValidator("json", profileSchema), async (c) => {
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "User not found" }, 404);

  const rows = (await sql`
    UPDATE cleaners SET
      first_name = COALESCE(${input.firstName ?? null}, first_name),
      last_name  = COALESCE(${input.lastName ?? null}, last_name),
      phone      = COALESCE(${input.phone ?? null}, phone),
      bio        = COALESCE(${input.bio ?? null}, bio),
      avatar_url = COALESCE(${input.avatarUrl ?? null}, avatar_url)
    WHERE user_id = ${user.id}
    RETURNING *
  `) as unknown[];

  return c.json({ cleaner: rows[0] ?? null });
});

// ---------------------------------------------------------------------------
// Stripe Connect (Express) payouts
// ---------------------------------------------------------------------------

/** Create an Express connected account + onboarding link. */
cleanersRouter.post("/stripe-connect/onboard", async (c) => {
  const { sql, user, cleaner } = await currentCleaner(c);
  if (!user) return c.json({ error: "User not found" }, 404);
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);

  let connectId = cleaner?.stripe_connect_id ?? null;
  if (!connectId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: user.email,
      capabilities: {
        transfers: { requested: true },
      },
      business_type: "individual",
    });
    connectId = account.id;
    await sql`
      UPDATE cleaners SET stripe_connect_id = ${connectId} WHERE user_id = ${user.id}
    `;
  }

  const base = c.env.CUSTOMER_URL ?? "https://app.sweep-r.com";
  const link = await stripe.accountLinks.create({
    account: connectId,
    refresh_url: `${base}/cleaner/stripe-refresh`,
    return_url: `${base}/cleaner/stripe-return`,
    type: "account_onboarding",
  });

  return c.json({ url: link.url });
});

/** Regenerate an expired onboarding link. */
cleanersRouter.post("/stripe-connect/refresh", async (c) => {
  const { user, cleaner } = await currentCleaner(c);
  if (!user) return c.json({ error: "User not found" }, 404);
  if (!cleaner?.stripe_connect_id) {
    return c.json({ error: "No connected account" }, 400);
  }
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
  const base = c.env.CUSTOMER_URL ?? "https://app.sweep-r.com";
  const link = await stripe.accountLinks.create({
    account: cleaner.stripe_connect_id,
    refresh_url: `${base}/cleaner/stripe-refresh`,
    return_url: `${base}/cleaner/stripe-return`,
    type: "account_onboarding",
  });
  return c.json({ url: link.url });
});

/** Check connected-account status. */
cleanersRouter.get("/stripe-connect/status", async (c) => {
  const { user, cleaner } = await currentCleaner(c);
  if (!user) return c.json({ error: "User not found" }, 404);
  if (!cleaner?.stripe_connect_id) {
    return c.json({
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    });
  }
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
  const account = await stripe.accounts.retrieve(cleaner.stripe_connect_id);
  return c.json({
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  });
});

// ---------------------------------------------------------------------------
// Onboarding: background check, identity verification, application submit
// ---------------------------------------------------------------------------

const backgroundSchema = z.object({
  fullLegalName: z.string().min(2).max(200),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // SSN last-4 only; full SSN is never accepted, logged, or stored.
  ssnLast4: z.string().regex(/^\d{4}$/),
  address: z.string().max(500),
});

cleanersRouter.post(
  "/background-check",
  zValidator("json", backgroundSchema),
  async (c) => {
    const { sql, user } = await currentCleaner(c);
    if (!user) return c.json({ error: "User not found" }, 404);

    // In production we'd POST to Checkr and store only the candidate id +
    // status. We never persist SSN/PII in our own database.
    const candidateId = `cand_${crypto.randomUUID()}`;
    await sql`
      UPDATE cleaners
      SET checkr_candidate_id = ${candidateId}
      WHERE user_id = ${user.id}
    `;
    return c.json({ checkr_status: "submitted", candidateId });
  }
);

const identitySchema = z.object({
  provider: z.string().default("didit"),
});

cleanersRouter.post(
  "/identity-verify",
  zValidator("json", identitySchema),
  async (c) => {
    const { sql, user } = await currentCleaner(c);
    if (!user) return c.json({ error: "User not found" }, 404);
    const verificationId = `verif_${crypto.randomUUID()}`;
    await sql`
      UPDATE cleaners
      SET didit_verification_id = ${verificationId}
      WHERE user_id = ${user.id}
    `;
    return c.json({ didit_status: "submitted", verificationId });
  }
);

const applySchema = z.object({
  fullName: z.string().optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  basedIn: z.string().optional(),
  radiusMi: z.number().optional(),
  services: z.array(z.string()).optional(),
  addOns: z.array(z.string()).optional(),
  availability: z.record(z.string()).optional(),
});

cleanersRouter.post("/apply", zValidator("json", applySchema), async (c) => {
  const input = c.req.valid("json");
  const { sql, user } = await currentCleaner(c);
  if (!user) return c.json({ error: "User not found" }, 404);

  const [firstName, ...rest] = (input.fullName ?? "").split(" ");
  const lastName = rest.join(" ");
  const existing = await getCleanerByUserId(sql, user.id);

  if (existing) {
    await sql`
      UPDATE cleaners SET
        first_name = COALESCE(${firstName || null}, first_name),
        last_name  = COALESCE(${lastName || null}, last_name),
        phone      = COALESCE(${input.phone ?? null}, phone),
        bio        = COALESCE(${input.bio ?? null}, bio),
        avatar_url = COALESCE(${input.avatarUrl ?? null}, avatar_url),
        status     = 'pending'
      WHERE user_id = ${user.id}
    `;
  } else {
    await sql`
      INSERT INTO cleaners (user_id, first_name, last_name, phone, bio, avatar_url, status)
      VALUES (
        ${user.id}, ${firstName || null}, ${lastName || null},
        ${input.phone ?? null}, ${input.bio ?? null}, ${input.avatarUrl ?? null},
        'pending'
      )
    `;
  }

  return c.json({ ok: true, status: "pending_review" });
});

// ---------------------------------------------------------------------------
// Job offers (assignment queue)
// ---------------------------------------------------------------------------

const offerRespondSchema = z.object({
  response: z.enum(["accepted", "declined"]),
});

cleanersRouter.post(
  "/offers/:offerId/respond",
  zValidator("json", offerRespondSchema),
  async (c) => {
    const { sql, cleaner } = await currentCleaner(c);
    if (!cleaner) return c.json({ error: "Cleaner not found" }, 404);
    const { response } = c.req.valid("json");
    const offerId = c.req.param("offerId");

    const offerRows = (await sql`
      SELECT * FROM assignment_queue
      WHERE id = ${offerId} AND cleaner_id = ${cleaner.id}
      LIMIT 1
    `) as { id: string; booking_id: string; status: string }[];
    const offer = offerRows[0];
    if (!offer) return c.json({ error: "Offer not found" }, 404);
    if (offer.status !== "pending") {
      return c.json({ error: "Offer is no longer active" }, 409);
    }

    await handleOfferResponse(sql, offer.booking_id, cleaner.id, response);
    return c.json({ ok: true, response });
  }
);
