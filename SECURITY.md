# Security Policy

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email **security@sweep-r.com** with subject line `[SECURITY] <brief description>`.

**Response SLAs:**
- Acknowledgment: 24 hours
- Triage and severity assessment: 72 hours
- Critical/High remediation: 14 days
- Medium remediation: 30 days
- Low remediation: 90 days

## Scope

| Target | In Scope |
|--------|----------|
| `apps/api` (Cloudflare Worker) | ✅ |
| `apps/customer`, `apps/cleaner`, `apps/admin`, `apps/marketing` | ✅ |
| `packages/*` | ✅ |
| Third-party services (Clerk, Stripe, Checkr, Didit) | ❌ Report to them directly |

## Out of Scope

- Social engineering attacks
- Physical access attacks
- Denial of service attacks
- Vulnerabilities requiring physical access to a device

## Disclosure Policy

We follow responsible disclosure. We will acknowledge your report, work with you to understand the impact, and credit you in our release notes (unless you prefer anonymity).
