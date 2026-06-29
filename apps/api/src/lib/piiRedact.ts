// PII visibility rules:
// super_admin           → full visibility
// {dept}_senior         → full PII visibility (within their scope)
// {dept} / admin        → masked PII

const SENIOR_ROLES = new Set([
  'super_admin',
  'ops_senior', 'finance_senior', 'trainer_senior',
  'support_senior', 'it_senior', 'security_senior',
]);

export function canSeePii(adminRole: string | null | undefined): boolean {
  if (!adminRole) return false;
  return SENIOR_ROLES.has(adminRole);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***@***.***";
  const maskedLocal = local.length <= 2
    ? local[0] + "***"
    : local[0] + "*".repeat(local.length - 2) + local[local.length - 1];
  const [domainName, ...tldParts] = domain.split(".");
  const maskedDomain = domainName.length <= 2
    ? domainName[0] + "***"
    : domainName[0] + "*".repeat(domainName.length - 2) + domainName[domainName.length - 1];
  return `${maskedLocal}@${maskedDomain}.${tldParts.join(".")}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***-***-****";
  const last4 = digits.slice(-4);
  return `***-***-${last4}`;
}

export function redactUser<T extends {
  email?: string | null;
  phone?: string | null;
  clerk_id?: string;
}>(user: T, adminRole: string | null | undefined): T {
  if (canSeePii(adminRole)) return user;
  return {
    ...user,
    email: user.email ? maskEmail(user.email) : user.email,
    phone: user.phone ? maskPhone(user.phone) : user.phone,
    clerk_id: user.clerk_id ? "REDACTED" : user.clerk_id,
  };
}
