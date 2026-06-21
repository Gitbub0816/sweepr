# ISO 27001:2022 Annex A Controls — Implementation Status

| Control | Title | Status | Implementation |
|---------|-------|--------|----------------|
| A.5.1 | Information security policies | ✅ | SECURITY.md, this document |
| A.5.9 | Inventory of assets | ✅ | `subprocessors` table, package.json dependency list |
| A.5.15 | Access control | ✅ | Clerk RBAC, RequireRole, AdminGuard |
| A.5.17 | Authentication information | ✅ | Clerk manages all credentials — no passwords stored by Sweepr |
| A.5.23 | Information security of cloud services | ✅ | DPA-covered subprocessors, TLS, Cloudflare Workers |
| A.5.33 | Protection of records | ✅ | Neon PITR, 7-year financial data retention |
| A.5.34 | Privacy and PII protection | ✅ | GDPR compliance, consent log, data subject requests |
| A.8.2 | Privileged access rights | ✅ | Separate admin role, `super_admin` for elevated actions |
| A.8.3 | Information access restriction | ✅ | Row-level security, role-gated endpoints |
| A.8.5 | Secure authentication | ✅ | Clerk handles MFA, session management, brute-force protection |
| A.8.7 | Protection against malware | ✅ | Input validation, CSP, DOMPurify, no eval() |
| A.8.9 | Configuration management | ✅ | `wrangler.toml`, env vars documented, no secrets in code |
| A.8.12 | Data leakage prevention | ✅ | PII redaction in logs, field-level access controls |
| A.8.15 | Logging | ✅ | Structured JSON logs, `admin_audit_log` table |
| A.8.16 | Monitoring activities | ✅ | Cloudflare analytics, rate limit tracking |
| A.8.24 | Use of cryptography | ✅ | TLS 1.3 (Cloudflare), Neon encryption at rest, Stripe PCI DSS |
| A.8.25 | Secure development lifecycle | ✅ | Input validation, parameterized SQL, security headers, CSP |
| A.8.26 | Application security requirements | ✅ | Zod validation, OWASP Top 10 mitigations |
| A.8.28 | Secure coding | ✅ | No eval, no innerHTML, DOMPurify, parameterized queries |
| A.8.32 | Change management | ✅ | Git PRs, branch protection recommended |
| A.8.33 | Test information | ✅ | Mock data separated from production, no real PII in dev |
