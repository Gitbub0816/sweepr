/**
 * Owner / super-admin bootstrap.
 *
 * The founding owner(s) must always have super_admin access, independent of
 * what's stored in the database — this avoids lockouts when a migration hasn't
 * run on the exact DB the Worker connects to, the Clerk webhook is failing, or
 * the session JWT omits the email claim.
 *
 * We match on BOTH the Clerk user id (always present as the token `sub`, so the
 * most reliable) and email. Values come from env (comma-separated) plus a
 * hardcoded fallback for the founding account.
 */
const FALLBACK_OWNER_EMAILS = [
  "1morecruise@gmail.com",
  "caleb.owen2019@outlook.com",
];
const FALLBACK_OWNER_CLERK_IDS = [
  "user_3FTx8c9CFm4hXjCxQMLDC2NpvWy", // caleb.owen2019@outlook.com (admin)
  "user_3FTuNlZwiqHjvLxQIS76lw5ehMB", // 1morecruise@gmail.com
];

/** Email used when bootstrapping an owner row that has no email yet. */
export const PRIMARY_OWNER_EMAIL = "1morecruise@gmail.com";

function list(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isOwnerEmail(
  email: string | null | undefined,
  env: { SUPER_ADMIN_EMAILS?: string },
): boolean {
  if (!email) return false;
  const all = [...FALLBACK_OWNER_EMAILS, ...list(env.SUPER_ADMIN_EMAILS)].map((e) =>
    e.toLowerCase(),
  );
  return all.includes(email.toLowerCase());
}

export function isOwnerClerkId(
  clerkId: string | null | undefined,
  env: { SUPER_ADMIN_CLERK_IDS?: string },
): boolean {
  if (!clerkId) return false;
  const all = [...FALLBACK_OWNER_CLERK_IDS, ...list(env.SUPER_ADMIN_CLERK_IDS)];
  return all.includes(clerkId);
}
