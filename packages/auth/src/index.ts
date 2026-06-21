import { createElement, Fragment, type ReactNode } from "react";
import { useUser, useAuth } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";
import type { UserRole } from "@sweepr/types";

/**
 * App-facing shape of the currently signed-in user, mapped from Clerk.
 */
export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  role: UserRole;
}

function readRole(metadata: Record<string, unknown> | undefined): UserRole {
  const role = metadata?.role;
  if (
    role === "customer" ||
    role === "cleaner" ||
    role === "admin" ||
    role === "super_admin"
  ) {
    return role;
  }
  return "customer";
}

/**
 * Returns the current Clerk user mapped to our domain `CurrentUser` type,
 * plus loading state. `user` is null when signed out.
 */
export function useCurrentUser(): { user: CurrentUser | null; isLoaded: boolean } {
  const { user, isLoaded } = useUser();
  if (!isLoaded || !user) {
    return { user: null, isLoaded };
  }
  return {
    isLoaded,
    user: {
      id: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? "",
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      avatarUrl: user.imageUrl,
      role: readRole(user.publicMetadata as Record<string, unknown>),
    },
  };
}

/**
 * Reads the role from `publicMetadata.role`. Defaults to "customer".
 */
export function useUserRole(): { role: UserRole; isLoaded: boolean } {
  const { user, isLoaded } = useUser();
  return {
    isLoaded,
    role: readRole(user?.publicMetadata as Record<string, unknown>),
  };
}

export interface RequireRoleProps {
  role: UserRole | UserRole[];
  children: ReactNode;
  /** Where to send users who lack the required role. */
  redirectTo?: string;
  /** Optional element rendered instead of redirecting (e.g. a 403 page). */
  fallback?: ReactNode;
}

/**
 * Gate children behind one or more roles. Renders nothing while Clerk loads,
 * then either the children, a fallback, or a redirect.
 */
export function RequireRole({
  role,
  children,
  redirectTo = "/sign-in",
  fallback,
}: RequireRoleProps) {
  const { isSignedIn } = useAuth();
  const { role: currentRole, isLoaded } = useUserRole();

  if (!isLoaded) return null;
  if (!isSignedIn) {
    return createElement(Navigate, { to: redirectTo, replace: true });
  }

  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(currentRole)) {
    if (fallback !== undefined) return createElement(Fragment, null, fallback);
    return createElement(Navigate, { to: redirectTo, replace: true });
  }

  return createElement(Fragment, null, children);
}
