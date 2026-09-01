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
import { buildCorsMiddleware } from "./middleware/cors";
import { securityHeaders } from "./middleware/securityHeaders";
import { ipBlocklist } from "./middleware/blocklist";
import { rateLimit } from "./middleware/rateLimit";
import { authRouter } from "./routes/auth";
import { bookingsRouter } from "./routes/bookings";
import { rentalsRouter } from "./routes/rentals";
import { pricingRouter } from "./routes/pricing";
import { paymentsRouter } from "./routes/payments";
import { tipsRouter } from "./routes/tips";
import { stripeWebhookRouter } from "./routes/stripe-webhook";
import { cleanersRouter } from "./routes/cleaners";
import { reviewsRouter } from "./routes/reviews";
import { adminRouter } from "./routes/admin";
import { adminAuthRouter } from "./routes/adminAuth";
import { storageRouter } from "./routes/storage";
import { notificationsRouter } from "./routes/notifications";
import { scheduleRouter } from "./routes/schedule";
import { subscriptionsRouter } from "./routes/subscriptions";
import { yardstikRouter } from "./routes/yardstik";
import { adjudicationRouter, adminAdjudicationRouter } from "./routes/adjudication";
import { diditRouter, diditWebhookRouter } from "./routes/didit";
import { clerkWebhookRouter } from "./routes/webhooks/clerk";
import { clerkAdminWebhookRouter } from "./routes/webhooks/clerkAdmin";
import { smsInboundRouter } from "./routes/smsInbound";
import { localeRouter } from "./routes/locale";
import { smsOptInRouter } from "./routes/smsOptIn";
import { statusRouter } from "./routes/status";
import { serviceAreaCheckRouter } from "./routes/serviceAreaCheck";
import { statusAdminRouter } from "./routes/admin/statusAdmin";
import { adminInviteRouter } from "./routes/adminInvite";
import { adminPermissionsRouter } from "./routes/adminPermissions";
import { adminNewsletterRouter } from "./routes/adminNewsletter";
import { adminServiceAreasRouter } from "./routes/adminServiceAreas";
import { adminBroadcastsRouter } from "./routes/adminBroadcasts";
import { adminScheduleRouter } from "./routes/adminSchedule";
import { adminCalendarRouter } from "./routes/adminCalendar";
import { calendarRouter } from "./routes/calendar";
import { adminFoundingRouter } from "./routes/adminFounding";
import { adminPromotionsRouter } from "./routes/adminPromotions";
import { foundingRouter } from "./routes/founding";
import { promotionsRouter } from "./routes/promotions";
import { couponsRouter } from "./routes/coupons";
import { membershipRouter } from "./routes/membership";
import { smartEntryRouter } from "./routes/smartEntry";
import { seamWebhookRouter } from "./routes/seamWebhook";
import { cleanerAccessRouter } from "./routes/cleanerAccess";
import { adminSmartEntryRouter } from "./routes/adminSmartEntry";
import { adminCouponsRouter } from "./routes/adminCoupons";
import { trainingRouter } from "./routes/training";
import { trainingAdminRouter } from "./routes/admin/trainingAdmin";
import { coursesRouter } from "./routes/courses";
import { crewRouter } from "./routes/crew";
import { crewTasksRouter } from "./routes/crewTasks";
import { adminCrewConfigRouter } from "./routes/adminCrewConfig";
import { adminCoursesRouter } from "./routes/admin/courses";
import { dayOfServiceRouter } from "./routes/dayOfService";
import { insuranceRouter, insuranceAdminRouter } from "./routes/insurance";
import { serviceDemoRouter } from "./routes/serviceDemo";
import { observabilityRouter } from "./routes/adminObservability";
import { adminAutomationRouter } from "./routes/adminAutomation";
import { adminPayoutsRouter } from "./routes/adminPayouts";
import { adminMeRouter } from "./routes/adminMe";
import { cleanerDashboardRouter } from "./routes/cleanerDashboard";
import { adminDebugRouter } from "./routes/adminDebug";
import { itTicketsRouter } from "./routes/itTickets";
import { itRouter } from "./routes/it";
import { accountRouter } from "./routes/account";
import { mapsRouter } from "./routes/maps";
import { adminNotificationSettingsRouter } from "./routes/adminNotificationSettings";
import { adminAlertsRouter } from "./routes/adminAlerts";
import { slackRouter } from "./routes/slack";
import { businessRouter } from "./routes/business";
import { customerTransitionRouter } from "./routes/customerTransition";
import { feeProposalsRouter, feeActionRouter } from "./routes/feeProposals";
import { scopeReviewRouter } from "./routes/scopeReview";
import { pricingAdminRouter } from "./routes/pricingAdmin";
import { securityRouter } from "./routes/security";
import { itInboundRouter } from "./routes/itInbound";
import { mailboxInboundRouter } from "./routes/mailboxInbound";
import { adminMailRouter } from "./routes/adminMail";
import { privacyPublicRouter } from "./routes/privacyPublic";
import { reportRouter } from "./routes/report";
import { reportsRouter } from "./routes/reports";
import { adminReportsRouter } from "./routes/adminReports";
import { responseTemplatesRouter } from "./routes/responseTemplates";
import { adminEmailRouter, mailersendWebhookRouter, unsubscribeRouter } from "./routes/adminEmail";
import { requestLogger } from "./middleware/requestLogger";
import { clientErrorsRouter } from "./routes/clientErrors";
import { customerProfileRouter } from "./routes/customerProfile";
import { adminSettingsRouter } from "./routes/adminSettings";
import { adminTrustRouter } from "./routes/adminTrust";
import { adminPricingConfigRouter } from "./routes/adminPricingConfig";
import { adminZipPricingRouter } from "./routes/adminZipPricing";
import { adminSiteAnalyticsRouter } from "./routes/adminSiteAnalytics";
import { adminPricingV2Router } from "./routes/adminPricingV2";
import { legalArchiveRouter } from "./routes/legalArchive";
import { legalAttorneyRouter } from "./routes/legalAttorney";
import { AppError, toSafeError } from "./lib/errors";
import { logger, redact } from "./lib/logger";
import {
  recordError,
  makeReferenceId,
  makeFingerprint,
  serializeError,
  extractPgError,
} from "./lib/errorLog";
import {
  runWithErrorCapture,
  drainErrorBuffer,
  getBreadcrumbs,
  getStartedAt,
  setResponseReference,
  getResponseReference,
} from "./lib/errorContext";
import { getDb } from "./lib/db";
import type { AppBindings } from "./types";

const app = new Hono<AppBindings>();

// Headers to drop entirely from telemetry (never truncate-and-keep these —
// they're credentials, not debugging context).
const DROPPED_HEADERS = new Set(["authorization", "cookie"]);
const MAX_HEADER_VALUE = 256;

/** Redact + truncate request headers for the admin error feed. */
function buildRedactedHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (DROPPED_HEADERS.has(key.toLowerCase())) return;
    out[key] = value.length > MAX_HEADER_VALUE ? value.slice(0, MAX_HEADER_VALUE) : value;
  });
  return redact(out) as Record<string, string>;
}

const MAX_BODY_SNIPPET_SOURCE_BYTES = 100_000;
const MAX_BODY_SNIPPET_CHARS = 2048;

/**
 * Capture a redacted snippet of the request body for the admin error feed,
 * WITHOUT consuming the body the route handler needs. Must be called before
 * `next()` — by flush time the real body stream is already drained. Only
 * attempts json/text content-types under a sane size cap; any failure (bad
 * JSON, oversized body, exotic content-type) just yields `null`.
 */
async function captureBodySnippet(c: { req: { header: (n: string) => string | undefined; raw: Request } }): Promise<string | null> {
  try {
    const contentType = c.req.header("content-type") ?? "";
    const isJson = /json/i.test(contentType);
    const isText = /^text\//i.test(contentType);
    if (!isJson && !isText) return null;

    const contentLength = Number(c.req.header("content-length") ?? "0");
    if (contentLength && contentLength > MAX_BODY_SNIPPET_SOURCE_BYTES) return null;

    const raw = await c.req.raw.clone().text();
    if (raw.length > MAX_BODY_SNIPPET_SOURCE_BYTES) return null;

    if (isJson) {
      try {
        const parsed = JSON.parse(raw);
        const redacted = JSON.stringify(redact(parsed));
        return redacted.length > MAX_BODY_SNIPPET_CHARS
          ? redacted.slice(0, MAX_BODY_SNIPPET_CHARS)
          : redacted;
      } catch {
        // Not valid JSON despite the content-type — fall through to raw text.
      }
    }
    return raw.length > MAX_BODY_SNIPPET_CHARS ? raw.slice(0, MAX_BODY_SNIPPET_CHARS) : raw;
  } catch {
    return null;
  }
}

// --- Scanner-probe short-circuit -------------------------------------------
// Vulnerability scanners constantly hit the worker with paths like /.env,
// /.git/config, /wp-login.php, /phpinfo.php, /config.json… Letting those flow
// through the full middleware chain burns KV rate-limiter writes and floods
// the logs, so they get an immediate bare 404 BEFORE any other middleware —
// no logging, no KV, no DB. Matchers are deliberately narrow: no legitimate
// API route starts with "/." or "/wp-", or ends in .php/.asp/.aspx/.jsp/
// .yml/.bak, so real traffic can never be intercepted here.
const PROBE_PATH_PREFIXES = ["/.", "/wp-", "/wordpress", "/phpmyadmin"];
const PROBE_PATH_SUFFIXES = [".php", ".asp", ".aspx", ".jsp", ".yml", ".bak"];
const PROBE_PATH_EXACT = new Set(["/config.json", "/web.config"]);

function isProbePath(path: string): boolean {
  const p = path.toLowerCase();
  return (
    PROBE_PATH_EXACT.has(p) ||
    PROBE_PATH_PREFIXES.some((prefix) => p.startsWith(prefix)) ||
    PROBE_PATH_SUFFIXES.some((suffix) => p.endsWith(suffix))
  );
}

app.use("*", async (c, next) => {
  const path = c.req.path;
  if (isProbePath(path)) return c.text("Not found", 404);
  // Crawlers and browsers request these on every host; serve tiny valid
  // responses so they stop showing up as 404 errors.
  if (c.req.method === "GET" || c.req.method === "HEAD") {
    if (path === "/robots.txt") return c.text("User-agent: *\nDisallow: /");
    if (path === "/favicon.ico") return c.body(null, 204);
  }
  await next();
});

// Security headers run first so they apply to every response.
app.use("*", securityHeaders);

// Blocked IPs are rejected before any other work happens (60s cached per
// isolate, fails open on DB errors).
app.use("*", ipBlocklist);

// Request logging (non-fatal, never blocks).
app.use("*", requestLogger());

// Every logger.error/logger.warn call made anywhere during this request
// (including inside routes, middleware further down the chain, and
// app.onError) gets buffered via AsyncLocalStorage (see lib/errorContext.ts)
// and flushed here to the admin error feed (`error_logs`) once the request
// finishes. This makes the ~98 existing logger.error/warn call sites land in
// the admin console without each one needing to know about `recordError`.
// Installed right after requestLogger and before rate limiting so it wraps
// as much of the pipeline as possible.
//
// Rows carry an EGREGIOUSLY detailed `context` JSONB blob (v2, see
// lib/errorLog.ts + errorContext.ts) — full request/user/runtime info,
// the entire breadcrumb trail, and (when applicable) parsed Postgres error
// fields — so a debugging engineer never has to go spelunking for context.
app.use("*", async (c, next) => {
  await runWithErrorCapture(async () => {
    // Body must be captured BEFORE `next()` — by the time we flush, the
    // request body has already been fully consumed by the handler. We only
    // ever read a *clone* of the raw request so downstream body parsing is
    // never disturbed, and only for json/text bodies under a sane size cap.
    const bodySnippetPromise = captureBodySnippet(c);
    try {
      await next();
    } finally {
      try {
        const entries = drainErrorBuffer();
        if (entries.length > 0) {
          const authUser = (() => {
            try {
              return c.get("user");
            } catch {
              return undefined;
            }
          })();
          const user = {
            clerkId: authUser?.clerkId ?? null,
            userId: (authUser as { userId?: string } | undefined)?.userId ?? null,
            role: (authUser as { role?: string } | undefined)?.role ?? null,
          };
          const requestId = c.req.header("cf-ray") ?? undefined;
          const path = c.req.path;
          const method = c.req.method;
          const statusCode = c.res?.status;
          const startedAt = getStartedAt();
          const durationMs = startedAt ? Date.now() - Date.parse(startedAt) : null;
          const breadcrumbs = getBreadcrumbs();
          const responseReference = getResponseReference();

          // Request-level facts shared by every entry flushed for this request.
          const cf = (c.req.raw as { cf?: { colo?: string; country?: string } }).cf;
          const requestInfo = {
            path,
            method,
            query: redact(Object.fromEntries(new URL(c.req.url).searchParams.entries())),
            headers: buildRedactedHeaders(c.req.raw.headers),
            bodySnippet: await bodySnippetPromise,
            ip: c.req.header("cf-connecting-ip") ?? null,
            cfRay: requestId ?? null,
            colo: cf?.colo ?? null,
            country: cf?.country ?? null,
            userAgent: c.req.header("user-agent") ?? null,
          };

          c.executionCtx.waitUntil(
            (async () => {
              try {
                const sql = getDb(c.env.DATABASE_URL);
                for (const entry of entries) {
                  const errSer = serializeError(entry.err);
                  const errorName =
                    errSer?.name ?? (entry.level === "error" ? "Error" : "Warning");
                  const pg = extractPgError(entry.err);
                  const errorCode =
                    entry.err instanceof AppError ? entry.err.code : pg?.code ?? null;
                  const fingerprint = await makeFingerprint(errorName, entry.message, method, path);
                  // The "Unhandled request error" entry logged from app.onError
                  // for a 5xx corresponds 1:1 with the reference the customer
                  // was just shown — reuse it so the two match up exactly.
                  // Every other entry gets its own fresh reference.
                  const referenceId =
                    responseReference && entry.message === "Unhandled request error"
                      ? responseReference
                      : makeReferenceId();

                  await recordError(sql, {
                    source: "server",
                    app: "api",
                    level: entry.level === "error" ? "error" : "warn",
                    message: entry.message,
                    stack: errSer?.stack ?? null,
                    path,
                    method,
                    statusCode: statusCode ?? null,
                    clerkId: user.clerkId,
                    userId: null,
                    requestId,
                    fingerprint,
                    referenceId,
                    errorName,
                    errorCode,
                    durationMs,
                    context: {
                      v: 2,
                      err: errSer,
                      pg,
                      request: requestInfo,
                      user,
                      runtime: { environment: c.env.ENVIRONMENT, worker: "api" },
                      timing: { startedAt, durationMs },
                      breadcrumbs,
                      logData: entry.data ?? null,
                    },
                  }, c.env);
                }
              } catch {
                /* flushing must never throw inside waitUntil */
              }
            })()
          );
        }
      } catch {
        /* draining/scheduling the flush must never break the response */
      }
    }
  });
});

// CORS is built per-request so it can read ALLOWED_ORIGINS from env.
app.use("*", (c, next) => buildCorsMiddleware(c.env)(c, next));

// General API rate limit: 100 req / min per IP.
app.use("*", rateLimit({ limit: 100, windowMs: 60_000, keyPrefix: "general" }));

// Tighter, route-specific limits. The strict 5/15m bucket is for auth
// *mutations* (sign-in, verification) — NOT the read-only identity check
// GET /auth/me, which every app's nav calls on each page mount. Catching /me
// here 429'd normal navigation after ~5 page views per 15m (per shared IP).
const strictAuthLimiter = rateLimit({ limit: 5, windowMs: 15 * 60_000, keyPrefix: "auth", strict: true });
app.use("/auth/*", (c, next) =>
  c.req.path === "/auth/me" && c.req.method === "GET" ? next() : strictAuthLimiter(c, next),
);
// Keyed per-user (not IP) and generous enough for a real checkout flow, which
// legitimately hits /payments/methods (read) + /create-intent plus retries as
// the customer edits their booking. 5/15m was blocking normal checkout with 429s.
app.use("/payments/*", rateLimit({ limit: 40, windowMs: 15 * 60_000, keyPrefix: "payments", by: "user" , strict: true }));
app.use("/tips/*", rateLimit({ limit: 20, windowMs: 15 * 60_000, keyPrefix: "tips", by: "user" , strict: true }));
// Scope review shares the sensitive-money rate profile (like /payments/*), but
// the public action-link GET must stay reachable from email clients — the
// general 100/min limit still applies to it.
app.use("/scope-review/requests", rateLimit({ limit: 5, windowMs: 15 * 60_000, keyPrefix: "scopereview" , strict: true }));
app.use("/scope-review/admin/*", rateLimit({ limit: 30, windowMs: 60_000, keyPrefix: "scopereview-admin" , strict: true }));
app.use("/storage/*", rateLimit({ limit: 20, windowMs: 60 * 60_000, keyPrefix: "storage" , strict: true }));
app.use("/pricing/*", rateLimit({ limit: 60, windowMs: 60_000, keyPrefix: "pricing" }));
app.use("/client-errors/*", rateLimit({ limit: 20, windowMs: 60_000, keyPrefix: "clienterr" , strict: true }));
app.use("/slack/*", rateLimit({ limit: 300, windowMs: 60_000, keyPrefix: "slack" }));
app.use("/unsubscribe/*", rateLimit({ limit: 5, windowMs: 15 * 60_000, keyPrefix: "unsub" , strict: true }));
app.use("/privacy/*", rateLimit({ limit: 10, windowMs: 15 * 60_000, keyPrefix: "privacy" , strict: true }));
// External/expensive identity-verification calls (Yardstik, Didit) — stricter
// than general to blunt cost-abuse. Does NOT cover /webhooks/yardstik or
// /webhooks/didit, which are mounted separately and are HMAC-verified.
// The read-only GET .../status endpoints are POLLED by the onboarding UI every
// few seconds while the candidate finishes verification, so they must NOT share
// the strict mutation bucket (10/15m) — that 429'd polling within a minute and
// the UI never saw completion. They get a generous poll allowance instead; only
// the expensive session/report *mutations* keep the strict limit.
const yardstikStrict = rateLimit({ limit: 10, windowMs: 15 * 60_000, keyPrefix: "yardstik", by: "user", strict: true });
const yardstikPoll = rateLimit({ limit: 240, windowMs: 15 * 60_000, keyPrefix: "yardstik-poll", by: "user" });
app.use("/yardstik/*", (c, next) =>
  c.req.method === "GET" && c.req.path === "/yardstik/status" ? yardstikPoll(c, next) : yardstikStrict(c, next),
);
const diditStrict = rateLimit({ limit: 10, windowMs: 15 * 60_000, keyPrefix: "didit", by: "user", strict: true });
const diditPoll = rateLimit({ limit: 240, windowMs: 15 * 60_000, keyPrefix: "didit-poll", by: "user" });
app.use("/didit/*", (c, next) =>
  c.req.method === "GET" && c.req.path === "/didit/status" ? diditPoll(c, next) : diditStrict(c, next),
);
// Review submission — authenticated, keyed per-user so a single account can't
// spam reviews from many IPs.
app.use("/reviews", rateLimit({ limit: 10, windowMs: 15 * 60_000, keyPrefix: "reviews", by: "user" , strict: true }));
// Public "Report a problem" intake — no signature/JWT required, so IP-keyed.
app.use("/report/*", rateLimit({ limit: 20, windowMs: 15 * 60_000, keyPrefix: "report" , strict: true }));
// Formal user reports (/reports, booking-scoped): submission + photo uploads
// are per-user strict mutations (one submit + up to 6 photo PUTs fits well
// under the cap). The list/detail GETs are loaded by booking/job detail pages
// on every visit, so they stay on the general limit (convention 14 — never
// put polled/list reads in a strict bucket).
const userReportsStrict = rateLimit({ limit: 20, windowMs: 15 * 60_000, keyPrefix: "user-reports", by: "user", strict: true });
const userReportsGate = (c: Parameters<typeof userReportsStrict>[0], next: Parameters<typeof userReportsStrict>[1]) =>
  c.req.method === "GET" ? next() : userReportsStrict(c, next);
app.use("/reports", userReportsGate);
app.use("/reports/*", userReportsGate);
app.use("/maps/*", rateLimit({ limit: 240, windowMs: 15 * 60_000, keyPrefix: "maps" }));
// Booking-calendar availability (blocked dates + date pricing labels): a
// read-only endpoint the wizard refetches on every month navigation, so it
// gets its own generous bucket (convention 14 — never a strict mutation
// bucket on polled/repeated reads).
app.use("/calendar/*", rateLimit({ limit: 240, windowMs: 15 * 60_000, keyPrefix: "calendar" }));

// Smart Entry: the read-only status/poll endpoints (feature status, connect-
// webview status, device list, booking selection) are POLLED by the customer
// booking-detail + lock-connect UI, so they get a generous per-user bucket
// (convention 14 — strict buckets on polls have broken onboarding twice).
// Everything else on /smart-entry is a mutation and gets a strict bucket.
// /webhooks/seam is separate and HMAC(Svix)-verified, not covered here.
const smartEntryPoll = rateLimit({ limit: 240, windowMs: 15 * 60_000, keyPrefix: "smartentry-poll", by: "user" });
const smartEntryStrict = rateLimit({ limit: 30, windowMs: 15 * 60_000, keyPrefix: "smartentry", by: "user", strict: true });
app.use("/smart-entry/*", (c, next) => {
  const p = c.req.path;
  const isPoll =
    c.req.method === "GET" &&
    (p === "/smart-entry/status" ||
      p === "/smart-entry/devices" ||
      p === "/smart-entry/connect/status" ||
      p === "/smart-entry/airbnb/connect/status" ||
      p === "/smart-entry/airbnb/listings" ||
      p.startsWith("/smart-entry/booking/"));
  return isPoll ? smartEntryPoll(c, next) : smartEntryStrict(c, next);
});

app.get("/", (c) => c.json({ name: "sweepr-api", status: "ok" }));
app.get("/health", (c) => c.json({ ok: true }));

app.route("/auth", authRouter);
app.route("/client-errors", clientErrorsRouter);
app.route("/customer-profile", customerProfileRouter);
app.route("/bookings", bookingsRouter);
app.route("/rentals", rentalsRouter);
app.route("/pricing", pricingRouter);
app.route("/payments", paymentsRouter);
app.route("/tips", tipsRouter);
app.route("/webhooks/stripe", stripeWebhookRouter);
app.route("/webhooks/clerk", clerkWebhookRouter);
// Separate admin Clerk application (admin.getsweepr.com) — its own Svix secret.
app.route("/webhooks/clerk-admin", clerkAdminWebhookRouter);
app.route("/cleaners", cleanersRouter);
// Cleaner self-service dashboard (separate from admin cleaners management).
// Mounted under /cleaner-dashboard to avoid conflict with /cleaners admin routes.
app.route("/reviews", reviewsRouter);
// Team Cleans (behind team_cleans_enabled flag): crew management endpoints
// (absolute /bookings/:id/crew/*) and crew task allocation (under /jobs).
app.route("/", crewRouter);
app.route("/jobs", crewTasksRouter);
app.route("/admin/debug", adminDebugRouter);
app.route("/it-tickets", itTicketsRouter);
app.route("/it", itRouter);
app.route("/account", accountRouter);
app.route("/maps", mapsRouter);
// Customer → Business bridge: initiation on the customer surface…
app.route("/account/business-transition", customerTransitionRouter);
// …and the Business-app workspace engine (requireApp("business") throughout).
app.route("/business", businessRouter);
app.route("/admin/notification-settings", adminNotificationSettingsRouter);
app.route("/admin/alerts", adminAlertsRouter);
app.route("/admin/mail", adminMailRouter);
// Alias used by the rebuilt admin Mail tab (contract path).
app.route("/admin-mail", adminMailRouter);
app.route("/admin", adminAuthRouter);
app.route("/admin", adminRouter);
app.route("/storage", storageRouter);
app.route("/notifications", notificationsRouter);
app.route("/schedule", scheduleRouter);
app.route("/subscriptions", subscriptionsRouter);
app.route("/yardstik", yardstikRouter);
// Background Check Adjudication: cleaner acknowledgment + admin T&S queue.
app.route("/adjudication", adjudicationRouter);
app.route("/admin/adjudication", adminAdjudicationRouter);
// Yardstik webhooks use a separate, unauthenticated path verified by HMAC signature.
app.route("/webhooks/yardstik", yardstikRouter);
app.route("/didit", diditRouter);
// Didit webhooks use a separate, unauthenticated path verified by HMAC signature.
app.route("/webhooks/didit", diditWebhookRouter);
// MailerSend inbound SMS (STOP/START/HELP) — signature-verified, fails closed.
app.route("/webhooks/mailersend-sms", smsInboundRouter);
// Public SMS opt-in form (rate-limited) — backs the /sms/consent page.
app.route("/sms", smsOptInRouter);
// Public IP-based initial-language suggestion.
app.route("/locale", localeRouter);
app.route("/status", statusRouter);
app.route("/service-areas", serviceAreaCheckRouter);
app.route("/admin/status", statusAdminRouter);
app.route("/admin/invites", adminInviteRouter);
app.route("/admin/permissions", adminPermissionsRouter);
app.route("/admin/newsletter", adminNewsletterRouter);
app.route("/admin/service-areas", adminServiceAreasRouter);
app.route("/admin/broadcasts", adminBroadcastsRouter);
app.route("/admin/schedule", adminScheduleRouter);
// Admin booking calendar (calendar_date_rules — date blocks, date pricing,
// date coupons). DISTINCT from /admin/schedule, which is comms automations.
app.route("/admin/calendar", adminCalendarRouter);
// Public wizard-facing availability for the same rules (labels only).
app.route("/calendar", calendarRouter);
app.route("/admin/founding", adminFoundingRouter);
app.route("/admin/promotions", adminPromotionsRouter);
app.route("/founding", foundingRouter);
app.route("/promotions", promotionsRouter);
app.route("/coupons", couponsRouter);
app.route("/admin/coupons", adminCouponsRouter);
app.route("/membership", membershipRouter);
app.route("/smart-entry", smartEntryRouter);
app.route("/webhooks/seam", seamWebhookRouter);
app.route("/cleaner", cleanerAccessRouter);
app.route("/admin/smart-entry", adminSmartEntryRouter);
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
app.route("/admin/payouts", adminPayoutsRouter);
app.route("/admin/me", adminMeRouter);
app.route("/cleaner-dashboard", cleanerDashboardRouter);
app.route("/slack", slackRouter);
app.route("/admin/fee-proposals", feeProposalsRouter);
app.route("/fee-action", feeActionRouter);
app.route("/scope-review", scopeReviewRouter);
app.route("/admin/pricing", pricingAdminRouter);
app.route("/security", securityRouter);
app.route("/it-mail", itInboundRouter);
// Generic inbound mailboxes (caleb/kristin/news/updates/help/alerts) —
// per-box MailerSend signing secrets, fail closed.
app.route("/mail", mailboxInboundRouter);
app.route("/report", reportRouter);
// Formal user reports (Trust & Safety): booking-scoped customer↔cleaner
// reports (user side) + the admin investigation console.
app.route("/reports", reportsRouter);
app.route("/admin/reports", adminReportsRouter);
app.route("/admin/response-templates", responseTemplatesRouter);
app.route("/admin/email", adminEmailRouter);
app.route("/admin/settings", adminSettingsRouter);
app.route("/admin-trust", adminTrustRouter);
app.route("/admin-pricing-config", adminPricingConfigRouter);
app.route("/admin/zip-pricing", adminZipPricingRouter);
app.route("/admin/crew-config", adminCrewConfigRouter);
// First-party site analytics (site_events/site_sessions/tracking_links —
// written by the sweepr-analytics worker, read here for the admin dashboard).
app.route("/admin/site-analytics", adminSiteAnalyticsRouter);
// Pricing v2 workspace (versioned labor-minutes engine — Pricing Studio).
app.route("/admin/pricing-v2", adminPricingV2Router);
app.route("/legal-archive", legalArchiveRouter);
app.route("/legal-attorney", legalAttorneyRouter);
app.route("/webhooks/mailersend", mailersendWebhookRouter);
app.route("/unsubscribe", unsubscribeRouter);
app.route("/privacy", privacyPublicRouter);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  const isDev = c.env.ENVIRONMENT === "development";

  const isAppError = err instanceof AppError;
  // A malformed JSON request body throws a SyntaxError out of c.req.json()
  // (via zValidator) — that's a client mistake (400), not a server fault (500).
  const isBadJson =
    err instanceof SyntaxError ||
    /JSON|Unexpected (token|end of)/i.test(err.message ?? "");
  if (isBadJson && !isAppError) {
    return c.json({ error: "Invalid JSON body", code: "invalid_json" }, 400);
  }
  const statusCode = isAppError ? (err as AppError).statusCode : 500;

  // Log (rather than call recordError directly) so this runs inside the
  // AsyncLocalStorage context installed by the buffering middleware above —
  // it gets picked up and flushed to the admin error feed there, deduped
  // against any handler-level logger call for the same failure. We skip
  // expected 4xx AppErrors — those are normal client mistakes, not incidents.
  if (isAppError) {
    if (statusCode >= 500) {
      logger.error("Unhandled request error", err);
    } else {
      logger.warn("Unhandled request error", { message: err.message, statusCode });
    }
    return c.json(
      { error: err.message, code: (err as AppError).code },
      statusCode as 400
    );
  }

  // Unexpected (non-AppError) failure -> generic, customer-safe 5xx. The
  // reference is generated HERE (not in the flush middleware) and stashed on
  // the AsyncLocalStorage store so the error_logs row this produces carries
  // the exact same code the customer sees below — never leak message/stack/
  // SQL/class names into the response, even in dev (dev only gets `detail`).
  const reference = makeReferenceId();
  setResponseReference(reference);
  logger.error("Unhandled request error", err);
  return c.json(toSafeError(err, isDev, reference), 500);
});

export default {
  fetch: app.fetch.bind(app),

  /**
   * Cloudflare Cron Trigger handler.
   * Schedules defined in wrangler.toml under [[triggers.crons]].
   */
  async scheduled(event: ScheduledEvent, env: Record<string, unknown>, ctx: ExecutionContext) {
    await runWithErrorCapture(async () => {
      try {
        await runScheduled(event, env);
      } finally {
        try {
          const entries = drainErrorBuffer();
          if (entries.length > 0) {
            const flush = (async () => {
              try {
                const { getDb } = await import("./lib/db");
                const sql = getDb(env.DATABASE_URL as string);
                for (const entry of entries) {
                  await recordError(sql, {
                    source: "server",
                    app: "api",
                    level: entry.level === "error" ? "error" : "warn",
                    message: entry.message,
                    stack:
                      entry.err instanceof Error ? entry.err.stack ?? null : null,
                    path: "cron",
                    method: "CRON",
                    context: {
                      data: entry.data ?? null,
                      timestamp: entry.timestamp,
                      cron: event.cron,
                      err:
                        entry.err instanceof Error
                          ? { message: entry.err.message, name: entry.err.name }
                          : entry.err ?? null,
                    },
                  });
                }
              } catch {
                /* flushing must never throw */
              }
            })();
            try {
              ctx.waitUntil(flush);
            } catch {
              await flush;
            }
          }
        } catch {
          /* draining/scheduling the flush must never break the cron run */
        }
      }
    });
  },
};

/** Body of the Cron Trigger handler, factored out so it can run inside runWithErrorCapture. */
async function runScheduled(event: ScheduledEvent, env: Record<string, unknown>) {
    const { getDb } = await import("./lib/db");
    const { processExpiredOffers } = await import("./lib/assignment");
    const { expireStaleCrewInvitations } = await import("./lib/crew/crewStaffing");
    const typedEnv = env as unknown as import("./types").Env;
    const sql = getDb(env.DATABASE_URL as string);

    logger.info("cron.fired", { cron: event.cron });

    try {
      // Every 15 minutes: expire stale assignment offers.
      await processExpiredOffers(sql);
      // Team Cleans: expire stale crew-seat invitations and cascade to the
      // next candidate (no-op when the feature is off / no crew bookings).
      try {
        await expireStaleCrewInvitations(sql, typedEnv);
      } catch (err) {
        logger.error("expireStaleCrewInvitations failed", err);
      }

      // Status engine: probe every public component and record health.
      // typedEnv.MYBROWSER (optional) threads the Browser Rendering binding
      // through for the synthetic render checks — see lib/statusChecks.ts.
      try {
        const { runStatusChecks } = await import("./lib/statusChecks");
        await runStatusChecks(sql, typedEnv.MYBROWSER);
      } catch (err) {
        logger.error("status checks failed", err);
      }

      // Hourly jobs (run on every fire, guard with DB dedup via automation_runs).
      // Directly call the business logic instead of HTTP self-calls.
      const { getStripe } = await import("./lib/stripe");
      const stripe = getStripe(env.STRIPE_SECRET_KEY as string);

      // Capture completed payments. Intents are created with manual capture
      // (authorize at booking, capture after service), so completed bookings
      // sit in `requires_capture` until this runs.
      const pendingCaptures = await sql`
        SELECT b.id, b.stripe_payment_intent_id, b.total_price
        FROM bookings b
        LEFT JOIN payments p ON p.booking_id = b.id AND p.status = 'captured'
        WHERE b.status = 'completed'
          AND b.stripe_payment_intent_id IS NOT NULL
          AND p.id IS NULL
        -- Oldest authorizations first (auth is placed at booking creation, per
        -- the manual-capture flow). Stripe cancels an uncaptured PI ~7 days
        -- after authorization, so under a backlog larger than this batch the
        -- bookings nearest that deadline must be captured first — an unordered
        -- LIMIT could let a near-expiry booking lose the row lottery every tick
        -- and get cancelled uncaptured. Uses idx_bookings_created_at.
        ORDER BY b.created_at ASC
        LIMIT 50
      ` as { id: string; stripe_payment_intent_id: string; total_price: number | null }[];

      let capturedCount = 0;
      for (const row of pendingCaptures) {
        try {
          const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
          if (pi.status !== "requires_capture") continue;

          // Honor post-authorization total decreases (e.g. ledger adjustments):
          // never capture more than was authorized, never more than the final
          // total. Stripe forbids capturing above the authorized amount.
          const authorized = pi.amount;
          const target = Math.min(row.total_price ?? authorized, authorized);

          // Claim-then-act: insert the payments row as a 'capturing' claim BEFORE
          // the Stripe capture. `payments.booking_id` is unique (migration 062),
          // so only one cron tick can win the claim; a concurrent/overlapping
          // tick gets an empty RETURNING and skips, guaranteeing exactly one
          // capture attempt per booking. The `capture_${bookingId}` idempotency
          // key makes the Stripe call itself safe even if a claim somehow raced.
          const claim = await sql`
            INSERT INTO payments (booking_id, stripe_payment_intent_id, amount, status)
            VALUES (${row.id}, ${pi.id}, ${target}, 'capturing')
            ON CONFLICT (booking_id) DO NOTHING
            RETURNING id
          ` as { id: string }[];
          if (!claim[0]) continue;

          try {
            await stripe.paymentIntents.capture(
              pi.id,
              { amount_to_capture: target },
              { idempotencyKey: `capture_${row.id}` },
            );
          } catch (captureErr) {
            // Release the claim so a later tick can retry the capture.
            await sql`
              DELETE FROM payments WHERE booking_id = ${row.id} AND status = 'capturing'
            `;
            throw captureErr;
          }

          await sql`
            UPDATE payments SET status = 'captured'
            WHERE booking_id = ${row.id} AND status = 'capturing'
          `;
          capturedCount++;
        } catch (err) {
          logger.error("cron.capture failed", err, { bookingId: row.id });
        }
      }

      // Observability retention cleanup (safe to run every cron fire — idempotent).
      await sql`DELETE FROM api_request_logs WHERE logged_at < NOW() - INTERVAL '90 days'`;
      await sql`DELETE FROM analytics_events  WHERE occurred_at < NOW() - INTERVAL '180 days'`;
      // First-party site analytics: 13-month retention (matches the Privacy
      // Policy's analytics retention disclosure — keep the two in sync).
      await sql`DELETE FROM site_events   WHERE occurred_at   < NOW() - INTERVAL '395 days'`;
      await sql`DELETE FROM site_sessions WHERE last_seen_at  < NOW() - INTERVAL '395 days'`;
      await sql`DELETE FROM session_replay_refs WHERE started_at < NOW() - INTERVAL '90 days'`;
      await sql`DELETE FROM cleaner_location_pings WHERE created_at < NOW() - INTERVAL '72 hours'`;

      // Payout automation: promote eligible payout_ledger rows to 'eligible' after delay window.
      await sql`
        UPDATE payout_ledger pl
        SET status = 'eligible', eligible_at = NOW(), updated_at = NOW()
        FROM bookings b
        JOIN platform_fee_settings pfs ON pfs.active = TRUE
        WHERE pl.booking_id = b.id
          AND pl.status = 'pending'
          AND b.status = 'completed'
          AND b.completed_at + (pfs.payout_delay_days || ' days')::INTERVAL <= NOW()
          AND NOT EXISTS (
            SELECT 1 FROM disputes d WHERE d.booking_id = b.id AND d.status = 'open'
          )
      `;

      // Short-term rental calendar sync: refresh feeds due for a poll.
      try {
        const { syncDueCalendarSources } = await import("./lib/calendarSync");
        await syncDueCalendarSources(sql);
      } catch (err) {
        logger.error("cron.calendar_sync failed", err, { cron: event.cron });
      }

      // Fee Change Approval Engine transitions (idempotent, time-driven).
      try {
        const {
          expirePending,
          completeCooldowns,
          activateEffective,
        } = await import("./lib/approvalEngine");
        const { updateProposalCard } = await import("./lib/approvalNotify");
        await expirePending(sql);
        const noticed = await completeCooldowns(sql);
        const activated = await activateEffective(sql);
        for (const p of [...noticed, ...activated]) {
          await updateProposalCard(sql, typedEnv, p.id as string);
        }

        // Pricing change engine (parallel transitions).
        const pricing = await import("./lib/pricingApproval");
        const { updatePricingCard } = await import("./lib/approvalNotify");
        await pricing.expirePending(sql);
        const pNoticed = await pricing.completeCooldowns(sql);
        const pActivated = await pricing.activateEffective(sql);
        for (const p of [...pNoticed, ...pActivated]) {
          await updatePricingCard(sql, typedEnv, p.id as string);
        }
      } catch (err) {
        logger.error("cron.approval_engine failed", err, { cron: event.cron });
      }

      // Admin schedule calendar: run due automations (broadcasts, launches,
      // status announcements, gate toggles, admin alerts). Idempotent — each
      // event is claimed via a status transition before executing.
      try {
        const { executeDueScheduledEvents } = await import("./lib/scheduledActions");
        const ran = await executeDueScheduledEvents(sql, typedEnv);
        if (ran > 0) logger.info("cron.schedule", { ran });
      } catch (err) {
        logger.error("cron.schedule failed", err, { cron: event.cron });
      }

      // Pricing v2: activate Scheduled pricing versions whose effective time
      // has arrived (claim-by-status-transition; idempotent).
      try {
        const { activateScheduledPricingVersions } = await import("./lib/quoteEngine/service");
        const activated = await activateScheduledPricingVersions(sql);
        if (activated > 0) logger.info("cron.pricing_v2_activated", { activated });
      } catch (err) {
        logger.error("cron.pricing_v2 failed", err, { cron: event.cron });
      }

      // Promotions engine: expire time-/claim-exhausted active promos.
      try {
        const { expireDuePromotions } = await import("./lib/promotions");
        const expired = await expireDuePromotions(sql);
        if (expired > 0) logger.info("cron.promotions_expired", { expired });
      } catch (err) {
        logger.error("cron.promotions failed", err, { cron: event.cron });
      }

      // Coupons: expire past-deadline coupons + evaluate milestone rules
      // (100th customer, cleaner anniversaries, ...). Both idempotent.
      try {
        const { expireDueCoupons, evaluateMilestones } = await import("./lib/coupons");
        const expired = await expireDueCoupons(sql);
        const granted = await evaluateMilestones(sql);
        if (expired > 0 || granted > 0) logger.info("cron.coupons", { expired, granted });
      } catch (err) {
        logger.error("cron.coupons failed", err, { cron: event.cron });
      }

      // Scope review engine time-driven transitions (idempotent).
      try {
        const { audit } = await import("./lib/audit");
        // Expire pending_admin requests past their deadline.
        const expired = await sql`
          UPDATE scope_review_requests
          SET status = 'expired', updated_at = NOW()
          WHERE status = 'pending_admin' AND expires_at IS NOT NULL AND expires_at <= NOW()
          RETURNING id
        ` as { id: string }[];
        for (const r of expired) {
          await audit(sql, {
            action: "admin.action", actorClerkId: "system:cron",
            targetType: "scope_review_request", targetId: r.id,
            metadata: { event: "scope_review_expired" }, timestamp: new Date().toISOString(),
          });
        }

        // Re-enable cleaner privileges whose disable window has elapsed.
        await sql`
          UPDATE cleaner_privileges
          SET additional_attention_enabled = TRUE, refusal_request_enabled = TRUE,
              disabled_reason = NULL, disabled_until = NULL, updated_at = NOW()
          WHERE disabled_until IS NOT NULL AND disabled_until <= NOW()
        `;

        // Reset customers whose investigating/suspended window has elapsed.
        await sql`
          UPDATE customers
          SET account_status = 'normal', account_status_until = NULL,
              account_status_reason = NULL, updated_at = NOW()
          WHERE account_status IN ('investigating', 'suspended')
            AND account_status_until IS NOT NULL AND account_status_until <= NOW()
        `;
      } catch (err) {
        logger.error("cron.scope_review failed", err, { cron: event.cron });
      }

      // Auto-detect error patterns and open status incidents.
      try {
        const { detectAndCreateIncidents } = await import("./lib/statusAutoDetect");
        const opened = await detectAndCreateIncidents(sql, typedEnv);
        if (opened > 0) logger.info("cron.autoDetect", { opened });
      } catch (err) {
        logger.error("cron.autoDetect failed", err, { cron: event.cron });
      }

      logger.info("cron.completed", { cron: event.cron, captures: capturedCount, captureCandidates: pendingCaptures.length });
    } catch (err) {
      logger.error("cron.failed", err, { cron: event.cron });
    }
}
