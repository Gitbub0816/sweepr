# SOC 2 Trust Services Criteria — Control Mapping

## CC6 — Logical and Physical Access Controls

| Criteria | Control | Implementation |
|----------|---------|----------------|
| CC6.1 | Logical access security | Clerk JWT authentication on all API routes via `requireAuth` middleware |
| CC6.2 | User access provisioning | Role assignment via Clerk `publicMetadata.role`; admin approval required for cleaner role |
| CC6.3 | Access removal | Clerk user deletion + soft-delete + GDPR `DELETE /auth/me` endpoint |
| CC6.6 | Logical access restrictions | `RequireRole`, `AdminGuard`, role-checked in every admin route |
| CC6.7 | Transmission integrity | TLS enforced via HSTS headers (`max-age=31536000; includeSubDomains; preload`) |
| CC6.8 | Malicious software prevention | Input validation (Zod), CSP headers, DOMPurify, parameterized SQL |

## CC7 — System Operations

| Criteria | Control | Implementation |
|----------|---------|----------------|
| CC7.1 | Detection of configuration changes | Git history, PR review process |
| CC7.2 | Monitoring for anomalies | Structured audit logging (`admin_audit_log`), rate limiting with 429 responses |
| CC7.3 | Evaluation of security events | Cloudflare dashboard, structured JSON logs |

## CC8 — Change Management

| Criteria | Control | Implementation |
|----------|---------|----------------|
| CC8.1 | Change management process | Git branch strategy, all changes via `claude/wonderful-fermi-nmlpre` → main PR |

## A1 — Availability

| Criteria | Control | Implementation |
|----------|---------|----------------|
| A1.1 | Performance monitoring | Cloudflare Workers/Pages 99.9% SLA |
| A1.2 | Environmental threats | Cloudflare global edge network, DDoS protection |

## PI1 — Processing Integrity

| Criteria | Control | Implementation |
|----------|---------|----------------|
| PI1.1 | Complete and accurate processing | Zod schema validation, status transition machine, idempotent Stripe webhook handling |
| PI1.2 | System inputs authorized | `requireAuth` + role checks on all mutation endpoints |

## C1 — Confidentiality

| Criteria | Control | Implementation |
|----------|---------|----------------|
| C1.1 | Confidential information protection | Role-based access, field redaction in logs (`logger.ts`), RLS on Neon tables |
| C1.2 | Confidential information disposal | GDPR anonymization endpoint, soft-delete with PII nulling |

## P Series — Privacy

| Criteria | Control | Implementation |
|----------|---------|----------------|
| P1.1 | Privacy notice | Privacy Policy page (`/privacy`) — CCPA + GDPR |
| P3.1 | Consent for personal information | Cookie consent banner, background check authorization, IC agreement |
| P4.1 | Accurate personal information | Profile edit endpoints, correction request (`data_subject_requests`) |
| P5.1 | Access to personal information | `GET /auth/export` — data portability endpoint |
| P6.1 | Disclosure to third parties | Subprocessors listed in Privacy Policy and `subprocessors` DB table |
| P7.1 | Quality of personal information | Zod validation on all PII input fields |
| P8.1 | Accounting of disclosures | `data_subject_requests` table, audit log |
