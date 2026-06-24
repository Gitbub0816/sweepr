import { Hono } from "hono";
import { buildCorsMiddleware } from "./middleware/cors";
import { securityHeaders } from "./middleware/securityHeaders";
import { rateLimit } from "./middleware/rateLimit";
import { authRouter } from "./routes/auth";
import { bookingsRouter } from "./routes/bookings";
import { pricingRouter } from "./routes/pricing";
import { paymentsRouter } from "./routes/payments";
import { stripeWebhookRouter } from "./routes/stripe-webhook";
import { cleanersRouter } from "./routes/cleaners";
import { reviewsRouter } from "./routes/reviews";
import { adminRouter } from "./routes/admin";
import { storageRouter } from "./routes/storage";
import { notificationsRouter } from "./routes/notifications";
import { scheduleRouter } from "./routes/schedule";
import { subscriptionsRouter } from "./routes/subscriptions";
import { checkrRouter } from "./routes/checkr";
import { diditRouter, diditWebhookRouter } from "./routes/didit";
import { statusRouter } from "./routes/status";
import { statusAdminRouter } from "./routes/admin/statusAdmin";
import { adminInviteRouter } from "./routes/adminInvite";
import { adminNewsletterRouter } from "./routes/adminNewsletter";
import { adminServiceAreasRouter } from "./routes/adminServiceAreas";
import { adminBroadcastsRouter } from "./routes/adminBroadcasts";
import { trainingRouter } from "./routes/training";
import { trainingAdminRouter } from "./routes/admin/trainingAdmin";
import { coursesRouter } from "./routes/courses";
import { adminCoursesRouter } from "./routes/admin/courses";
import { dayOfServiceRouter } from "./routes/dayOfService";
import { insuranceRouter, insuranceAdminRouter } from "./routes/insurance";
import { serviceDemoRouter } from "./routes/serviceDemo";
import { observabilityRouter } from "./routes/adminObservability";
import { adminAutomationRouter } from "./routes/adminAutomation";
import { AppError, toSafeError } from "./lib/errors";
import { logger } from "./lib/logger";
import type { AppBindings } from "./types";

const app = new Hono<AppBindings>();

// Security headers run first so they apply to every response.
app.use("*", securityHeaders);

// CORS is built per-request so it can read ALLOWED_ORIGINS from env.
app.use("*", (c, next) => buildCorsMiddleware(c.env)(c, next));

// General API rate limit: 100 req / min per IP.
app.use("*", rateLimit({ limit: 100, windowMs: 60_000, keyPrefix: "general" }));

// Tighter, route-specific limits.
app.use("/auth/*", rateLimit({ limit: 5, windowMs: 15 * 60_000, keyPrefix: "auth" }));
app.use("/payments/*", rateLimit({ limit: 5, windowMs: 15 * 60_000, keyPrefix: "payments" }));
app.use("/storage/*", rateLimit({ limit: 20, windowMs: 60 * 60_000, keyPrefix: "storage" }));
app.use("/pricing/*", rateLimit({ limit: 60, windowMs: 60_000, keyPrefix: "pricing" }));

app.get("/", (c) => c.json({ name: "sweepr-api", status: "ok" }));
app.get("/health", (c) => c.json({ ok: true }));

app.route("/auth", authRouter);
app.route("/bookings", bookingsRouter);
app.route("/pricing", pricingRouter);
app.route("/payments", paymentsRouter);
app.route("/webhooks/stripe", stripeWebhookRouter);
app.route("/cleaners", cleanersRouter);
app.route("/reviews", reviewsRouter);
app.route("/admin", adminRouter);
app.route("/storage", storageRouter);
app.route("/notifications", notificationsRouter);
app.route("/schedule", scheduleRouter);
app.route("/subscriptions", subscriptionsRouter);
app.route("/checkr", checkrRouter);
// Checkr webhooks use a separate, unauthenticated path verified by HMAC signature.
app.route("/webhooks/checkr", checkrRouter);
app.route("/didit", diditRouter);
// Didit webhooks use a separate, unauthenticated path verified by HMAC signature.
app.route("/webhooks/didit", diditWebhookRouter);
app.route("/status", statusRouter);
app.route("/admin/status", statusAdminRouter);
app.route("/admin/invites", adminInviteRouter);
app.route("/admin/newsletter", adminNewsletterRouter);
app.route("/admin/service-areas", adminServiceAreasRouter);
app.route("/admin/broadcasts", adminBroadcastsRouter);
app.use("/training/*", (c, next) => {
  // requireAuth is applied per-route inside trainingRouter
  return next();
});
app.route("/training", trainingRouter);
app.route("/admin/training", trainingAdminRouter);
app.route("/courses", coursesRouter);
app.route("/admin/courses", adminCoursesRouter);
app.route("/jobs", dayOfServiceRouter);
app.route("/insurance", insuranceRouter);
app.route("/admin/insurance", insuranceAdminRouter);
app.route("/service", serviceDemoRouter);
app.route("/admin/observability", observabilityRouter);
app.route("/admin/automation", adminAutomationRouter);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  const isDev = c.env.ENVIRONMENT === "development";
  logger.error("Unhandled request error", err);
  if (err instanceof AppError) {
    return c.json(
      { error: err.message, code: err.code },
      err.statusCode as 400
    );
  }
  return c.json(toSafeError(err, isDev), 500);
});

export default {
  fetch: app.fetch.bind(app),

  /**
   * Cloudflare Cron Trigger handler.
   * Schedules defined in wrangler.toml under [[triggers.crons]].
   */
  async scheduled(event: ScheduledEvent, env: Record<string, unknown>, _ctx: ExecutionContext) {
    const { getDb } = await import("./lib/db");
    const { processExpiredOffers } = await import("./lib/assignment");
    const sql = getDb(env.DATABASE_URL as string);

    logger.info("cron.fired", { cron: event.cron });

    try {
      // Every 15 minutes: expire stale assignment offers.
      await processExpiredOffers(sql);

      // Hourly jobs (run on every fire, guard with DB dedup via automation_runs).
      const { adminAutomationRouter: _ } = await import("./routes/adminAutomation");
      // Directly call the business logic instead of HTTP self-calls.
      const { getStripe } = await import("./lib/stripe");
      const stripe = getStripe(env.STRIPE_SECRET_KEY as string);

      // Capture completed payments.
      const pendingCaptures = await sql`
        SELECT b.id, b.stripe_payment_intent_id
        FROM bookings b
        LEFT JOIN payments p ON p.booking_id = b.id AND p.status = 'captured'
        WHERE b.status = 'completed'
          AND b.stripe_payment_intent_id IS NOT NULL
          AND p.id IS NULL
        LIMIT 50
      ` as { id: string; stripe_payment_intent_id: string }[];

      for (const row of pendingCaptures) {
        try {
          const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
          if (pi.status === "requires_capture") {
            await stripe.paymentIntents.capture(pi.id);
            await sql`UPDATE payments SET status = 'captured' WHERE booking_id = ${row.id}`;
          }
        } catch (err) {
          logger.error("cron.capture failed", err, { bookingId: row.id });
        }
      }

      logger.info("cron.completed", { cron: event.cron, captures: pendingCaptures.length });
    } catch (err) {
      logger.error("cron.failed", err, { cron: event.cron });
    }
  },
};
