/**
 * Unified broadcast system — send emails to any subscriber list.
 *
 * Audiences:
 *   newsletter        → newsletter_subscribers
 *   waitlist_customer → waitlist WHERE type = 'customer'
 *   waitlist_cleaner  → waitlist WHERE type = 'cleaner'
 *   city              → city_subscribers (optionally filtered by area_slug)
 *   all               → all of the above combined (deduplicated)
 */
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { sendBulkEmail, sendEmail, wrapBodyInTemplate } from "../lib/mailer";
import { translateText, langName } from "../lib/translate";
import { requireAuth } from "../middleware/auth";
import { isOwnerClerkId } from "../lib/owner";
import type { AppBindings } from "../types";

export const adminBroadcastsRouter = new Hono<AppBindings>();

const requireAdmin = createMiddleware<AppBindings>(async (c, next) => {
  if (isOwnerClerkId(c.get("user").clerkId, c.env)) return next();
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

adminBroadcastsRouter.use("*", requireAuth, requireAdmin);

/** Retrieve past broadcasts. */
adminBroadcastsRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const sends = await sql`
    SELECT id, audience, area_slug, subject, sent_count, sent_by, created_at
    FROM broadcast_sends ORDER BY created_at DESC LIMIT 100
  `;
  return c.json({ sends });
});

/** Subscriber counts by audience (for the compose UI). */
adminBroadcastsRouter.get("/counts", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const [newsletter, waitlistCustomer, waitlistCleaner, city, areas] = await Promise.all([
    sql`SELECT COUNT(*)::int AS n FROM newsletter_subscribers` as unknown as Promise<Array<{ n: number }>>,
    sql`SELECT COUNT(*)::int AS n FROM waitlist WHERE type = 'customer'` as unknown as Promise<Array<{ n: number }>>,
    sql`SELECT COUNT(*)::int AS n FROM waitlist WHERE type = 'cleaner'` as unknown as Promise<Array<{ n: number }>>,
    sql`SELECT COUNT(*)::int AS n FROM city_subscribers` as unknown as Promise<Array<{ n: number }>>,
    sql`SELECT slug, name FROM service_areas ORDER BY name` as unknown as Promise<Array<{ slug: string; name: string }>>,
  ]);
  return c.json({
    newsletter: newsletter[0].n,
    waitlist_customer: waitlistCustomer[0].n,
    waitlist_cleaner: waitlistCleaner[0].n,
    city: city[0].n,
    areas,
  });
});

const BROADCAST_TYPES = ["announcement", "launch", "feature", "area", "offer", "operational"] as const;
type BroadcastType = typeof BROADCAST_TYPES[number];

const sendSchema = z.object({
  audience: z.enum(["newsletter", "waitlist_customer", "waitlist_cleaner", "city", "all"]),
  broadcastType: z.enum(BROADCAST_TYPES).default("announcement"),
  areaSlug: z.string().optional(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1),
  previewTo: z.string().email().optional(),
});

adminBroadcastsRouter.post("/send", zValidator("json", sendSchema), async (c) => {
  const { audience, broadcastType, areaSlug, subject, body, previewTo } = c.req.valid("json");
  const html = wrapBodyInTemplate(subject, body);
  const sql = getDb(c.env.DATABASE_URL);
  const actorClerkId = c.get("user").clerkId;

  if (previewTo) {
    const { sendEmail } = await import("../lib/mailer");
    await sendEmail(c.env.MAILERSEND_API_KEY, { to: previewTo, subject, html });
    return c.json({ ok: true, sent: 1, preview: true });
  }

  // Collect recipients
  const emails = new Set<string>();

  async function addList(rows: Array<{ email: string }>) {
    for (const r of rows) emails.add(r.email.toLowerCase());
  }

  if (audience === "newsletter" || audience === "all") {
    await addList(await sql`SELECT email FROM newsletter_subscribers` as Array<{ email: string }>);
  }
  if (audience === "waitlist_customer" || audience === "all") {
    await addList(await sql`SELECT email FROM waitlist WHERE type = 'customer'` as Array<{ email: string }>);
  }
  if (audience === "waitlist_cleaner" || audience === "all") {
    await addList(await sql`SELECT email FROM waitlist WHERE type = 'cleaner'` as Array<{ email: string }>);
  }
  if (audience === "city" || audience === "all") {
    const rows = areaSlug
      ? await sql`SELECT email FROM city_subscribers WHERE area_slug = ${areaSlug}` as Array<{ email: string }>
      : await sql`SELECT email FROM city_subscribers` as Array<{ email: string }>;
    await addList(rows);
  }

  const emailSet = [...emails];
  if (emailSet.length === 0) return c.json({ ok: true, sent: 0 });

  // Look up preferred_language for every recipient.
  const langRows = await sql`
    SELECT LOWER(email) AS email, preferred_language
    FROM users
    WHERE LOWER(email) = ANY(${emailSet.map((e) => e.toLowerCase())})
      AND preferred_language IS NOT NULL
      AND preferred_language != 'en'
  ` as Array<{ email: string; preferred_language: string }>;

  const langByEmail = new Map(langRows.map((r) => [r.email, r.preferred_language]));

  // Group recipients: "en" (default) vs each non-English language.
  const groups = new Map<string, string[]>(); // lang -> emails
  for (const email of emailSet) {
    const lang = langByEmail.get(email.toLowerCase()) ?? "en";
    if (!groups.has(lang)) groups.set(lang, []);
    groups.get(lang)!.push(email);
  }

  // Pre-translate for each non-English language (in parallel).
  const nonEnglishLangs = [...groups.keys()].filter((l) => l !== "en");
  const translations = new Map<string, { subject: string; html: string }>();

  if (nonEnglishLangs.length > 0 && c.env.ANTHROPIC_API_KEY) {
    await Promise.all(
      nonEnglishLangs.map(async (lang) => {
        const tSubject = await translateText(c.env.ANTHROPIC_API_KEY!, subject, langName(lang));
        const tBody = await translateText(c.env.ANTHROPIC_API_KEY!, body, langName(lang));
        translations.set(lang, {
          subject: tSubject,
          html: wrapBodyInTemplate(tSubject, tBody, lang),
        });
      }),
    );
  }

  let sent = 0;

  // Send English group via bulk endpoint (fast path).
  const englishEmails = groups.get("en") ?? [];
  if (englishEmails.length > 0) {
    sent += await sendBulkEmail(
      c.env.MAILERSEND_API_KEY,
      englishEmails.map((e) => ({ email: e })),
      subject,
      html,
    );
  }

  // Send each non-English group. Fall back to English if translation failed.
  for (const [lang, langEmails] of groups) {
    if (lang === "en") continue;
    const t = translations.get(lang) ?? { subject, html };
    sent += await sendBulkEmail(
      c.env.MAILERSEND_API_KEY,
      langEmails.map((e) => ({ email: e })),
      t.subject,
      t.html,
    );
  }

  await sql`
    INSERT INTO broadcast_sends (audience, broadcast_type, area_slug, subject, html, sent_count, sent_by)
    VALUES (
      ${audience}, ${broadcastType}, ${areaSlug ?? null}, ${subject}, ${html}, ${sent}, ${actorClerkId}
    )
  `;

  return c.json({ ok: true, sent });
});
