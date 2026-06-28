/**
 * Owner / super-admin bootstrap.
 *
 * The founding owner(s) must always have super_admin access, independent of
 * what's stored in the database — this avoids lockouts when a migration hasn't
 * run on the exact DB the Worker connects to, or a role row is missing/wrong.
 *
 * Emails come from the SUPER_ADMIN_EMALS env (comma-separated) plus a hardcoded
 * fallback for the founding account.
 */
const FALLBACK_OWNER_EMAILS = ["caleb.owen2019@outlook.com"];

export function ownerEmails(env: { SUPER_ADMIN_EMAILS?: string }): string[] {
  const fromEnv = (env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...FALLBACK_OWNER_EMAILS.map((e) => e.toLowerCase()), ...fromEnv])];
}

export function isOwnerEmail(
  email: string | null | undefined,
  env: { SUPER_ADMIN_EMAILS?: string },
): boolean {
  if (!email) return false;
  return ownerEmails(env).includes(email.toLowerCase());
}
