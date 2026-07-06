import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

/** screen key for a slug — mirrors apps/api/src/lib/permissions.ts. */
export const screenKey = (slug: string) => `screen.${slug}`;

/** Route path → screen permission key. Nav + route guards use this. */
export const ROUTE_SCREEN: Record<string, string> = {
  "/": screenKey("dashboard"),
  "/jobs": screenKey("jobs"),
  "/customers": screenKey("customers"),
  "/cleaners": screenKey("cleaners"),
  "/applications": screenKey("applications"),
  "/pricing": screenKey("pricing"),
  "/cleaning-pricing": screenKey("cleaning_pricing"),
  "/approvals": screenKey("approvals"),
  "/scope-review": screenKey("scope_review"),
  "/trust-safety": screenKey("trust_safety"),
  "/insurance": screenKey("insurance"),
  "/disputes": screenKey("disputes"),
  "/payouts": screenKey("payouts"),
  "/service-areas": screenKey("service_areas"),
  "/events": screenKey("events"),
  "/status": screenKey("status"),
  "/training": screenKey("training"),
  "/courses": screenKey("courses"),
  "/email": screenKey("email"),
  "/broadcasts": screenKey("broadcasts"),
  "/newsletter": screenKey("newsletter"),
  "/mail": screenKey("mail"),
  "/observability": screenKey("observability"),
  "/errors": screenKey("errors"),
  "/it-portal": screenKey("it_portal"),
  "/security": screenKey("security"),
  "/notifications": screenKey("notifications"),
  "/slack": screenKey("slack"),
  "/automation": screenKey("automation"),
  "/admins": screenKey("admins"),
  "/access-control": screenKey("access_control"),
  "/settings": screenKey("settings"),
};

export interface PermissionsState {
  loading: boolean;
  /** null while loading — callers should treat null as "not yet known". */
  permissions: Set<string> | null;
  has: (key: string) => boolean;
}

/**
 * The signed-in admin's effective permissions. Cached for the session via
 * react-query. `has()` returns true while still loading so the UI doesn't
 * flash "no access" before the set arrives (the API is the real enforcement).
 */
export function usePermissions(): PermissionsState {
  const { getToken } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-permissions-me"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API}/admin/permissions/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [] as string[];
      const json = (await res.json()) as { permissions: string[] };
      return json.permissions;
    },
  });

  const permissions = data ? new Set(data) : null;
  return {
    loading: isLoading,
    permissions,
    has: (key: string) => (permissions ? permissions.has(key) : true),
  };
}
