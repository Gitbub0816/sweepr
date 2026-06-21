# CIS Controls v8 — Implementation Group 1 (IG1)

IG1 represents "essential cyber hygiene" — the minimum controls every organization should implement.

| CIS Control | Title | Status | Implementation |
|-------------|-------|--------|----------------|
| 1 | Inventory and Control of Enterprise Assets | ✅ | Cloudflare Workers + Pages (documented), all services in `subprocessors` table |
| 2 | Inventory and Control of Software Assets | ✅ | `pnpm-lock.yaml` pins all dependencies; `pnpm audit` for vulnerability scanning |
| 3 | Data Protection | ✅ | Neon encryption at rest, TLS in transit, PII field redaction in logs, GDPR consent |
| 4 | Secure Configuration | ✅ | Security headers (`_headers`), CSP, HSTS, no default credentials, env vars for secrets |
| 5 | Account Management | ✅ | Clerk-managed accounts, no shared credentials, role-based, admin approval for cleaners |
| 6 | Access Control Management | ✅ | Principle of least privilege, `RequireRole`, `AdminGuard`, RLS in Neon |
| 7 | Continuous Vulnerability Management | ✅ | `pnpm audit` script, `.github/dependabot.yml` weekly scans |
| 8 | Audit Log Management | ✅ | `admin_audit_log` table, structured JSON logging with PII redaction |
| 9 | Email and Web Browser Protections | ✅ | MailerSend for outbound, CSP restricts script sources, SameSite cookies via Clerk |
| 10 | Malware Defenses | ✅ | Input validation (Zod), DOMPurify (XSS), no dynamic code execution |
| 11 | Data Recovery | 📋 | Neon PITR available — configure 7-day retention in Neon console |
| 12 | Network Infrastructure Management | ✅ | Cloudflare WAF recommended, CORS allowlist, rate limiting |
| 14 | Security Awareness and Skills Training | 📋 | Recommended for team — not automated |
| 16 | Application Software Security | ✅ | OWASP Top 10 mitigations: SQLi (parameterized), XSS (DOMPurify+CSP), CSRF (Bearer tokens), injection (Zod), auth (Clerk) |

**Legend:** ✅ Implemented | 📋 Manual/Process control (not automated)
