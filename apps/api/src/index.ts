import { Hono } from "hono";
import { corsMiddleware } from "./middleware/cors";
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
import type { AppBindings } from "./types";

const app = new Hono<AppBindings>();

app.use("*", corsMiddleware);
app.use("/pricing/*", rateLimit({ limit: 60, windowMs: 60_000 }));
app.use("/payments/*", rateLimit({ limit: 30, windowMs: 60_000 }));

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

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
