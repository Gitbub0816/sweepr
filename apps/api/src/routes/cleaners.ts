import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getCleanerByUserId, getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { getStripe } from "../lib/stripe";
import { handleOfferResponse } from "../lib/assignment";
import { requireAuth } from "../middleware/auth";
import { grantSmsConsent } from "../lib/smsConsent";
import { checkInsurance } from "../lib/cleanerRequirements";
import { sendSms, SMS_MESSAGES } from "../lib/sms";
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

/**
 * Onboarding progress — server-authoritative completion of each onboarding
 * step. Safe to call before a cleaner row exists (everything reports false).
 * Drives the dashboard checklist so cleaners can complete steps individually.
 */
cleanersRouter.get("/onboarding-progress", async (c) => {
  const { user, cleaner } = await currentCleaner(c);
  if (!user) return c.json({ error: "User not found" }, 404);

  const ch = cleaner as
    | {
        first_name?: string | null;
        bio?: string | null;
        checkr_status?: string | null;
        didit_status?: string | null;
        required_training_completed?: boolean | null;
        status?: string | null;
      }
    | null;

  const profile = Boolean(ch?.first_name && ch?.bio);
  const training = Boolean(ch?.required_training_completed);
  const background = ch?.checkr_status === "clear";
  const identity = ch?.didit_status === "approved";
  const submitted = ch?.status === "pending" || ch?.status === "approved";
  const approved = ch?.status === "approved";

  // Validated insurance: Sweepr Coverage active OR an approved, unexpired
  // personal policy. Mirrors the server-side job-accept enforcement.
  let insurance = false;
  const cleanerId = (cleaner as { id?: string } | null)?.id;
  if (cleanerId) {
    const sql = getDb(c.env.DATABASE_URL);
    insurance = (await checkInsurance(sql, cleanerId)).valid;
  }

  return c.json({
    status: ch?.status ?? "incomplete",
    steps: { profile, training, background, identity, insurance, submitted, approved },
  });
});

const profileSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  bio: z.string().max(5000).optional(),
  avatarUrl: z.string().url().max(512).optional(),
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
    RETURNING id, first_name, last_name, phone, bio, avatar_url, status
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

  const base = c.env.CUSTOMER_URL ?? "https://app.getsweepr.com";
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
  const base = c.env.CUSTOMER_URL ?? "https://app.getsweepr.com";
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

// Background check is handled via the Checkr invitation flow at /checkr/invite.
// Candidates enter all PII directly on Checkr's hosted form — no PII reaches
// Sweepr servers.  This stub is intentionally removed.

const identitySchema = z.object({
  provider: z.string().default("didit"),
});

cleanersRouter.post(
  "/identity-verify",
  zValidator("json", identitySchema),
  async (c) => {
    const { sql, user, cleaner } = await currentCleaner(c);
    if (!user) return c.json({ error: "User not found" }, 404);

    // Create a hosted Didit verification session. Document/biometric capture
    // happens entirely on Didit — no ID images or PII reach Sweepr. When Didit
    // is unconfigured this returns a stub session and falls back to manual
    // admin review.
    const { diditClient } = await import("../lib/didit");
    const client = diditClient(c.env);
    const workflow = cleaner?.account_type === "business" ? "business" : "personal";
    const session = await client.createSession({
      workflow,
      vendorData: user.id,
      callbackUrl: "https://api.getsweepr.com/webhooks/didit",
    });

    const status = session.stub ? "in_review" : "pending";
    await sql`
      UPDATE cleaners
      SET didit_verification_id = ${session.session_id},
          didit_status          = ${status}
      WHERE user_id = ${user.id}
    `;

    // Only the hosted URL crosses the wire — never Didit credentials.
    return c.json({
      didit_status: status,
      url: session.url,
      sessionId: session.session_id,
      stub: session.stub,
    });
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
  // Explicit SMS opt-in from the (never pre-checked) onboarding checkbox.
  smsOptIn: z.boolean().optional(),
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

  // Consent is stored in the same request as the application (atomic with
  // account setup) but is NOT required — applicants may decline.
  if (input.smsOptIn === true) {
    await grantSmsConsent(sql, user.id, {
      source: "onboarding",
      ip: c.req.header("CF-Connecting-IP") ?? null,
      userAgent: c.req.header("User-Agent") ?? null,
      phone: input.phone ?? null,
    });
    if (input.phone) {
      try {
        await sendSms(c.env, sql, {
          userId: user.id, to: input.phone,
          type: "consent_confirmation", body: SMS_MESSAGES.optInConfirmation,
        });
      } catch { /* non-fatal */ }
    }
  }

  return c.json({ ok: true, status: "pending_review" });
});

// ---------------------------------------------------------------------------
// Business cleaner application (KYB via Stripe Connect)
// ---------------------------------------------------------------------------

const businessApplySchema = z.object({
  businessName: z.string().min(2).max(200),
  businessType: z.string().min(2).max(40),
  // EIN itself is NEVER accepted here — only a boolean that it was provided.
  einProvided: z.literal(true),
  stateOfIncorporation: z.string().min(2).max(60),
  authorizedRep: z.object({
    name: z.string().min(2).max(200),
    title: z.string().max(80),
    email: z.string().email(),
    // DOB and address are collected directly by Checkr — never by Sweepr.
  }),
  serviceTypes: z.array(z.string()).optional(),
  addOnKeys: z.array(z.string()).optional(),
  availability: z.record(z.string()).optional(),
  // Explicit SMS opt-in from the (never pre-checked) onboarding checkbox.
  smsOptIn: z.boolean().optional(),
});

cleanersRouter.post(
  "/business/apply",
  zValidator("json", businessApplySchema),
  async (c) => {
    const input = c.req.valid("json");
    const { sql, user } = await currentCleaner(c);
    if (!user) return c.json({ error: "User not found" }, 404);

    const [firstName, ...rest] = input.authorizedRep.name.split(" ");
    const lastName = rest.join(" ");
    const existing = await getCleanerByUserId(sql, user.id);

    // Create a business Stripe Connect (Express) account for KYB + payouts.
    let connectId = existing?.stripe_connect_id ?? null;
    try {
      const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
      const account = await stripe.accounts.create({
        type: "express",
        business_type: "company",
        company: { name: input.businessName },
        metadata: { account_type: "business" },
      });
      connectId = account.id;
    } catch {
      // Stripe creation is best-effort here; KYB stays pending until completed.
    }

    // NOTE: EIN is never stored — only ein_provided + kyb_status are persisted.
    if (existing) {
      await sql`
        UPDATE cleaners SET
          first_name = COALESCE(${firstName || null}, first_name),
          last_name  = COALESCE(${lastName || null}, last_name),
          account_type = 'business',
          business_name = ${input.businessName},
          business_type = ${input.businessType},
          state_of_incorporation = ${input.stateOfIncorporation},
          authorized_rep_name = ${input.authorizedRep.name},
          authorized_rep_title = ${input.authorizedRep.title},
          ein_provided = true,
          kyb_status = 'pending',
          stripe_connect_id = COALESCE(${connectId}, stripe_connect_id),
          status = 'pending'
        WHERE user_id = ${user.id}
      `;
    } else {
      await sql`
        INSERT INTO cleaners (
          user_id, first_name, last_name, account_type, business_name,
          business_type, state_of_incorporation, authorized_rep_name,
          authorized_rep_title, ein_provided, kyb_status, stripe_connect_id, status
        ) VALUES (
          ${user.id}, ${firstName || null}, ${lastName || null}, 'business',
          ${input.businessName}, ${input.businessType},
          ${input.stateOfIncorporation}, ${input.authorizedRep.name},
          ${input.authorizedRep.title}, true, 'pending', ${connectId}, 'pending'
        )
      `;
    }

    // Consent is stored in the same request as the application (atomic with
    // account setup) but is NOT required — applicants may decline.
    if (input.smsOptIn === true) {
      await grantSmsConsent(sql, user.id, {
        source: "onboarding",
        ip: c.req.header("CF-Connecting-IP") ?? null,
        userAgent: c.req.header("User-Agent") ?? null,
      });
    }

    // Trigger a Checkr invitation for the authorized rep.
    // DOB, SSN, and address are collected directly by Checkr's hosted form.
    const { checkrClient } = await import("../lib/checkr");
    const client = checkrClient(c.env);
    const repParts = input.authorizedRep.name.split(" ");
    const repFirst = repParts[0];
    const repLast = repParts.slice(1).join(" ") || repFirst;
    const candidate = await client.createCandidate(
      input.authorizedRep.email,
      repFirst,
      repLast
    );
    const invitation = await client.createInvitation(candidate.id, input.stateOfIncorporation.slice(0, 2).toUpperCase());
    await sql`
      UPDATE cleaners
      SET checkr_candidate_id  = ${candidate.id},
          checkr_invitation_id = ${invitation.id},
          checkr_status        = 'invited',
          checkr_invited_at    = NOW()
      WHERE user_id = ${user.id}
    `;

    return c.json({
      ok: true,
      status: "pending_review",
      kyb_status: "pending",
      account_type: "business",
      checkr: {
        invitationUrl: invitation.invitation_url,
        expiresAt: invitation.expires_at,
      },
    });
  }
);

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
