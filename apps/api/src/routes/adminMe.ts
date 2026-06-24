import { Hono } from "hono";
import { getUserByClerkId } from "@sweepr/db";
import { requireAuth } from "../middleware/auth";
import { getDb } from "../lib/db";
import type { AppBindings } from "../types";

const PERMISSION_MAP: Record<string, string[]> = {
  super_admin: ["*"],
  admin:       ["dashboard:view","jobs:view","jobs:manage","customers:view","cleaners:view",
                 "applications:view","pricing:view","disputes:view","disputes:manage",
                 "payouts:view","service_areas:view","events:view","training:view",
                 "courses:view","newsletter:view","broadcasts:view","observability:view",
                 "automation:view","admins:view","insurance:view"],
  ops:         ["dashboard:view","jobs:view","jobs:manage","cleaners:view","customers:view",
                 "applications:view","service_areas:view","events:view","training:view",
                 "courses:view","automation:view","insurance:view"],
  finance:     ["dashboard:view","payouts:view","payouts:modify","payouts:modify_settings",
                 "disputes:view","disputes:manage","pricing:view","pricing:manage"],
  trainer:     ["dashboard:view","training:view","training:manage","courses:view","courses:manage",
                 "cleaners:view"],
  support:     ["dashboard:view","jobs:view","customers:view","cleaners:view","disputes:view",
                 "bookings:view","events:view"],
};

export const adminMeRouter = new Hono<AppBindings>();

adminMeRouter.get("/", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "Forbidden" }, 403);

  const role = user.role as string;
  const adminRole = (user as unknown as Record<string, unknown>).admin_role as string | null;

  if (role !== "admin" && role !== "super_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const effectiveRole = role === "super_admin" ? "super_admin" : (adminRole ?? "admin");
  const permissions = PERMISSION_MAP[effectiveRole] ?? PERMISSION_MAP["admin"] ?? [];

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      role,
      adminRole,
      permissions,
    },
  });
});
