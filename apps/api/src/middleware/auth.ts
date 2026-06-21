import { createMiddleware } from "hono/factory";
import { verifyToken } from "@clerk/backend";
import type { AppBindings } from "../types";

/**
 * Verifies the Clerk session JWT from the Authorization header and attaches
 * the user to the request context. Returns 401 when missing/invalid.
 */
export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Missing bearer token" }, 401);
  }
  const token = header.slice("Bearer ".length);

  try {
    const payload = await verifyToken(token, {
      secretKey: c.env.CLERK_SECRET_KEY,
    });
    c.set("user", {
      clerkId: payload.sub,
      email: (payload as { email?: string }).email,
    });
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }

  await next();
});
