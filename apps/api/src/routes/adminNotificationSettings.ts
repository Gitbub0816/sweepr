/**
 * Notification settings — admin toggles for every notification event the system
 * can emit. The catalog of events lives here; the DB stores only the on/off
 * override per event_key (defaults to enabled).
 */
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { isOwnerClerkId } from "../lib/owner";
import type { AppBindings } from "../types";

export const adminNotificationSettingsRouter = new Hono<AppBindings>();
adminNotificationSettingsRouter.use("*", requireAuth);
adminNotificationSettingsRouter.use("*", createMiddleware<AppBindings>(async (c, next) => {
  if (isOwnerClerkId(c.get("user").clerkId, c.env)) return next();
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
}));

interface CatalogItem {
  key: string;
  label: string;
  description: string;
  audience: "customer" | "cleaner" | "admin";
}

// The complete catalog of notification events, grouped by category.
export const NOTIFICATION_CATALOG: { category: string; items: CatalogItem[] }[] = [
  {
    category: "Bookings",
    items: [
      { key: "booking.confirmed", label: "Booking confirmed", description: "Customer's booking is confirmed.", audience: "customer" },
      { key: "booking.reminder_24h", label: "24-hour reminder", description: "Reminder sent 24h before a clean.", audience: "customer" },
      { key: "booking.reminder_1h", label: "1-hour reminder", description: "Reminder sent 1h before a clean.", audience: "customer" },
      { key: "booking.rescheduled", label: "Booking rescheduled", description: "A booking's time changed.", audience: "customer" },
      { key: "booking.cancelled", label: "Booking cancelled", description: "A booking was cancelled.", audience: "customer" },
      { key: "booking.completed", label: "Clean completed", description: "Service finished, receipt available.", audience: "customer" },
      { key: "booking.review_request", label: "Review request", description: "Ask the customer to review.", audience: "customer" },
    ],
  },
  {
    category: "Jobs (Cleaners)",
    items: [
      { key: "job.offered", label: "New job offer", description: "A job is offered to a cleaner.", audience: "cleaner" },
      { key: "job.offer_expiring", label: "Offer expiring", description: "An offer is about to expire.", audience: "cleaner" },
      { key: "job.assigned", label: "Job assigned", description: "A job is confirmed to a cleaner.", audience: "cleaner" },
      { key: "job.reminder", label: "Job reminder", description: "Upcoming job reminder.", audience: "cleaner" },
      { key: "job.cancelled", label: "Job cancelled", description: "A job was cancelled.", audience: "cleaner" },
      { key: "job.day_of", label: "Day-of start", description: "Day-of-service flow prompts.", audience: "cleaner" },
    ],
  },
  {
    category: "Payments & Payouts",
    items: [
      { key: "payment.succeeded", label: "Payment succeeded", description: "Customer payment captured.", audience: "customer" },
      { key: "payment.failed", label: "Payment failed", description: "A charge failed.", audience: "customer" },
      { key: "payment.refunded", label: "Refund issued", description: "A refund was processed.", audience: "customer" },
      { key: "payout.sent", label: "Payout sent", description: "Cleaner payout transferred.", audience: "cleaner" },
      { key: "payout.failed", label: "Payout failed", description: "A payout failed.", audience: "cleaner" },
      { key: "payout.stripe_action", label: "Stripe action needed", description: "Connect onboarding/action required.", audience: "cleaner" },
    ],
  },
  {
    category: "Onboarding & Verification",
    items: [
      { key: "cleaner.application_received", label: "Application received", description: "Cleaner application submitted.", audience: "cleaner" },
      { key: "cleaner.approved", label: "Application approved", description: "Cleaner approved to work.", audience: "cleaner" },
      { key: "cleaner.rejected", label: "Application rejected", description: "Cleaner application rejected.", audience: "cleaner" },
      { key: "checkr.status", label: "Background check update", description: "Checkr status changed.", audience: "cleaner" },
      { key: "didit.status", label: "Identity verification update", description: "Didit decision received.", audience: "cleaner" },
      { key: "insurance.status", label: "Insurance status", description: "Coverage approved/expiring.", audience: "cleaner" },
    ],
  },
  {
    category: "Training",
    items: [
      { key: "training.module_unlocked", label: "Module unlocked", description: "A new training module is available.", audience: "cleaner" },
      { key: "training.completed", label: "Training completed", description: "Required training finished.", audience: "cleaner" },
      { key: "training.reminder", label: "Training reminder", description: "Nudge to finish training.", audience: "cleaner" },
    ],
  },
  {
    category: "Disputes & Support",
    items: [
      { key: "dispute.opened", label: "Dispute opened", description: "A dispute was filed.", audience: "customer" },
      { key: "dispute.updated", label: "Dispute updated", description: "Dispute status changed.", audience: "customer" },
      { key: "ticket.created", label: "Support ticket created", description: "Confirmation of a submitted ticket.", audience: "customer" },
      { key: "ticket.updated", label: "Support ticket updated", description: "An update on a support ticket.", audience: "customer" },
    ],
  },
  {
    category: "Admin & System",
    items: [
      { key: "admin.new_application", label: "New cleaner application", description: "Alert admins of a new application.", audience: "admin" },
      { key: "admin.new_ticket", label: "New IT ticket", description: "Alert admins of a new support ticket.", audience: "admin" },
      { key: "admin.new_dispute", label: "New dispute", description: "Alert admins of a new dispute.", audience: "admin" },
      { key: "admin.payout_failed", label: "Payout failure", description: "Alert admins when a payout fails.", audience: "admin" },
      { key: "admin.webhook_failed", label: "Webhook failure", description: "Alert admins of a failed webhook.", audience: "admin" },
      { key: "admin.error_spike", label: "Error spike", description: "Alert admins of an error spike.", audience: "admin" },
      { key: "system.marketing", label: "Marketing & tips", description: "Promotional / tips messages.", audience: "customer" },
    ],
  },
];

adminNotificationSettingsRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`SELECT event_key, enabled FROM notification_settings`) as Array<{ event_key: string; enabled: boolean }>;
  const overrides = new Map(rows.map((r) => [r.event_key, r.enabled]));

  const groups = NOTIFICATION_CATALOG.map((g) => ({
    category: g.category,
    items: g.items.map((it) => ({
      ...it,
      enabled: overrides.get(it.key) ?? true, // default ON
    })),
  }));
  return c.json({ groups });
});

adminNotificationSettingsRouter.put(
  "/",
  zValidator("json", z.object({ event_key: z.string().min(1), enabled: z.boolean() })),
  async (c) => {
    const sql = getDb(c.env.DATABASE_URL);
    const { event_key, enabled } = c.req.valid("json");
    const { clerkId } = c.get("user");
    await sql`
      INSERT INTO notification_settings (event_key, enabled, updated_by, updated_at)
      VALUES (${event_key}, ${enabled}, ${clerkId}, NOW())
      ON CONFLICT (event_key) DO UPDATE SET enabled = ${enabled}, updated_by = ${clerkId}, updated_at = NOW()
    `;
    return c.json({ ok: true });
  },
);
