// Department scopes for senior admin management authority
const DEPT_SCOPES: Record<string, string[]> = {
  ops_senior:       ['ops'],
  finance_senior:   ['finance'],
  trainer_senior:   ['trainer'],
  support_senior:   ['support'],
  it_senior:        ['it'],
  security_senior:  ['security'],
  super_admin:      ['super_admin', 'admin', 'ops', 'ops_senior', 'finance', 'finance_senior',
                     'trainer', 'trainer_senior', 'support', 'support_senior',
                     'it', 'it_senior', 'security', 'security_senior'],
};

// Returns true if `actorRole` has authority to manage an admin with `targetRole`
export function canManageAdminRole(actorRole: string, targetRole: string): boolean {
  const scope = DEPT_SCOPES[actorRole];
  if (!scope) return false;
  return scope.includes(targetRole);
}

// Returns true if `actorRole` can invite someone with `targetRole`
export function canInviteRole(actorRole: string, targetRole: string): boolean {
  return canManageAdminRole(actorRole, targetRole);
}

export const ALL_ADMIN_ROLES = [
  'super_admin',
  'admin',
  'ops', 'ops_senior',
  'finance', 'finance_senior',
  'trainer', 'trainer_senior',
  'support', 'support_senior',
  'it', 'it_senior',
  'security', 'security_senior',
] as const;

export type AdminRole = typeof ALL_ADMIN_ROLES[number];

export function isSeniorOrAbove(role: string): boolean {
  return role === 'super_admin' || role.endsWith('_senior');
}
