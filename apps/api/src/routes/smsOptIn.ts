/**
 * Public SMS opt-in form endpoint — backs the getsweepr.com/sms/consent page.
 *
 *   POST /sms/opt-in   { phone: string, consent: true }
 *
 * Unauthenticated (the page is public for carrier verification), so it is
 * rate-limited and always returns a generic success — it never reveals
 * whether a phone number belongs to an account. When the number matches an
 * existing customer/cleaner, consent is granted with the full TCPA audit
 * trail (IP, user agent, version, source 'web_form') and the carrier-required
 * opt-in confirmation SMS is sent best-effort.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";
import { rateLimit } from "../middleware/rateLimit";
import { grantSmsConsent } from "../lib/smsConsent";
import { sendSms, SMS_MESSAGES, toE164 } from "../lib/sms";
import type { AppBindings } from "../types";

export const smsOptInRouter = new Hono<AppBindings>();

const optInSchema = z.object({
  phone: z.string().min(10).max(20),
  // The checkbox must be affirmatively checked — the API enforces it too.
  consent: z.literal(true),
});

smsOptInRouter.post(
  "/opt-in",
  rateLimit({ limit: 5, windowMs: 60 * 60_000, keyPrefix: "sms-opt-in" }),
  zValidator("json", optInSchema),
  async (c) => {
    const { phone } = c.req.valid("json");
    const e164 = toE164(phone);
    if (!e164) return c.json({ error: "Please enter a valid US phone number." }, 400);

    const sql = getDb(c.env.DATABASE_URL);
    const digits = e164.replace(/\D/g, "").slice(-10);
    const users = (await sql`
      SELECT u.id FROM users u
      LEFT JOIN customers cust ON cust.user_id = u.id
      LEFT JOIN cleaners cl ON cl.user_id = u.id
      WHERE RIGHT(regexp_replace(COALESCE(cust.phone, ''), '\\D', '', 'g'), 10) = ${digits}
         OR RIGHT(regexp_replace(COALESCE(cl.phone, ''), '\\D', '', 'g'), 10) = ${digits}
      LIMIT 1
    `) as Array<{ id: string }>;

    if (users[0]) {
      await grantSmsConsent(sql, users[0].id, {
        source: "web_form",
        ip: c.req.header("CF-Connecting-IP") ?? null,
        userAgent: c.req.header("User-Agent") ?? null,
        phone: e164,
      });
      try {
        await sendSms(c.env, sql, {
          userId: users[0].id, to: e164,
          type: "consent_confirmation", body: SMS_MESSAGES.optInConfirmation,
        });
      } catch (err) {
        logger.error("sms opt-in confirmation failed", err);
      }
    }

    // Generic response either way — never reveal whether an account exists.
    return c.json({ ok: true });
  }
);
