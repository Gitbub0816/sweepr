import { useUser } from "@clerk/clerk-react";

export type AdminRole = "super_admin" | "admin" | "ops" | "finance" | "trainer" | "support" | "it";

export interface AdminPermissions {
  role: AdminRole | null;
  can: (feature: keyof typeof PERMISSION_MAP) => boolean;
  isLoaded: boolean;
}

/**
 * Permission matrix per admin_role.
 * super_admin and admin always have full access regardless of this map.
 */
const PERMISSION_MAP = {
  dashboard:     ["ops", "finance", "trainer", "support"],
  jobs:          ["ops", "support"],
  customers:     ["ops", "support"],
  cleaners:      ["ops"],
  applications:  ["ops", "trainer"],
  pricing:       ["finance"],
  insurance:     ["finance"],
  disputes:      ["ops", "finance", "support"],
  payouts:       ["finance"],
  serviceAreas:  ["ops"],
  events:        ["ops"],
  status:        ["ops", "support"],
  training:      ["ops", "trainer"],
  courses:       ["trainer"],
  newsletter:    ["ops"],
  broadcasts:    ["ops"],
  observability: ["finance"],
  automation:    ["ops", "finance"],
  admins:        [] as string[], // super_admin + admin only (handled below)
  settings:      [] as string[], // super_admin only
} as const;

export function useAdminRole(): AdminPermissions {
  const { isLoaded, user } = useUser();

  const role = (user?.publicMetadata?.adminRole as AdminRole | undefined)
    ?? (user?.publicMetadata?.role === "super_admin" ? "super_admin" as AdminRole : null);

  const can = (feature: keyof typeof PERMISSION_MAP): boolean => {
    if (!isLoaded || !role) return false;
    if (role === "super_admin") return true;
    if (role === "admin") {
      // admin can do everything except settings (super_admin only)
      return feature !== "settings";
    }
    return (PERMISSION_MAP[feature] as readonly string[]).includes(role);
  };

  return { role, can, isLoaded };
}
