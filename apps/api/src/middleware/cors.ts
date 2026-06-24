import { cors } from "hono/cors";

export const LOCALHOST_ORIGINS = [
  "https://getsweepr.com",
  "https://app.getsweepr.com",
  "https://clean.getsweepr.com",
  "https://admin.getsweepr.com",
  "https://status.getsweepr.com",
  "https://service.getsweepr.com",
  "https://legal.getsweepr.com",
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
    : LOCALHOST_ORIGINS;
  return cors({
    origin: origins,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Accept-Encoding", "X-App-Version", "X-Platform"],
    exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "ETag"],
    credentials: true,
    maxAge: 86400,
  });
}

/** Default middleware (dev origins) for backwards compatibility. */
export const corsMiddleware = cors({
  origin: LOCALHOST_ORIGINS,
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "Accept-Encoding", "X-App-Version", "X-Platform"],
  exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "ETag"],
  credentials: true,
  maxAge: 86400,
});
