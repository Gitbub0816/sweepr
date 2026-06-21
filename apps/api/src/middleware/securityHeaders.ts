import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../types";

export const securityHeaders = createMiddleware<AppBindings>(async (c, next) => {
  await next();
  // Prevent MIME sniffing
  c.header("X-Content-Type-Options", "nosniff");
  // Stop clickjacking
  c.header("X-Frame-Options", "DENY");
  // XSS filter (legacy browsers)
  c.header("X-XSS-Protection", "1; mode=block");
  // HSTS — 1 year, include subdomains
  c.header(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );
  // Referrer policy
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  // Permissions policy
  c.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self), payment=(self)"
  );
  // Remove server identification
  c.header("Server", "");
  // CSP for API (no HTML, so strict)
  c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
});
