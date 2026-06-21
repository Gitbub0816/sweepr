import { cors } from "hono/cors";

export const ALLOWED_ORIGINS = [
  "https://sweep-r.com",
  "https://app.sweep-r.com",
  "https://clean.sweep-r.com",
  "https://admin.sweep-r.com",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
];

export const corsMiddleware = cors({
  origin: ALLOWED_ORIGINS,
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});
