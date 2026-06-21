# Incident Response Procedure

## Severity Classification

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|---------|
| P0 — Critical | Data breach, system compromise, payment fraud | 15 min | Unauthorized DB access, credential leak, mass PII exposure |
| P1 — High | Service outage, auth bypass, significant data loss | 1 hour | Auth service down, admin access bypass, payment processing failure |
| P2 — Medium | Degraded service, isolated security issue | 4 hours | Single endpoint down, limited scope vulnerability |
| P3 — Low | Minor issue, no data impact | 24 hours | UI bug with security implication, single user affected |

## P0 Response Procedure (Data Breach)

1. **Detect (0:00)** — Automated alert or user report received
2. **Notify (0:15)** — Alert security@sweep-r.com, engineering lead, legal counsel
3. **Contain (0:15–1:00)** — Revoke compromised credentials, block attack vector, preserve logs
4. **Assess (1:00–24:00)** — Determine scope: what data, how many users, what time window
5. **Regulatory notification (≤72:00)** — GDPR Art. 33: notify supervisory authority within 72 hours if risk to individuals. CCPA: notify CA AG if >500 CA residents affected.
6. **User notification (≤72:00)** — If high risk to individuals (GDPR Art. 34), notify affected users promptly
7. **Remediation** — Fix root cause, deploy patch, verify containment
8. **Post-incident review (within 7 days)** — Document timeline, root cause, lessons learned, control improvements

## Regulatory Contacts

- **GDPR (EU):** Report to relevant EU Member State supervisory authority
- **CCPA (California):** California Attorney General — oag.ca.gov
- **Internal escalation:** security@sweep-r.com → legal@sweep-r.com

## Evidence Preservation

Do NOT delete logs or modify systems before forensic review. Preserve:
- Cloudflare access logs
- `admin_audit_log` table snapshot
- Neon query logs
- Stripe dashboard events
- Clerk audit log
