import { cors } from "hono/cors";

export const LOCALHOST_ORIGINS = [
  "https://sweep-r.com",
  "https://app.sweep-r.com",
  "https://clean.sweep-r.com",
  "https://admin.sweep-r.com",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
];

/** Backwards-compatible export. */
export const ALLOWED_ORIGINS = LOCALHOST_ORIGINS;

export function buildCorsMiddleware(env: {
  ENVIRONMENT?: string;
  ALLOWED_ORIGINS?: string;
}) {
  const origins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
    : env.ENVIRONMENT === "production"
      ? [] // deny all if not configured in production
      : LOCALHOST_ORIGINS;
  return cors({
    origin: origins,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  });
}

/** Default middleware (dev origins) for backwards compatibility. */
export const corsMiddleware = cors({
  origin: LOCALHOST_ORIGINS,
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400,
});
