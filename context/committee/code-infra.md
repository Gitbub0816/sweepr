# Code committee — broker + infra (opus)
1. [BROKEN] services/auth-broker/fly.toml:16-19 — PUBLIC_HOST, PUBLIC_ORIGIN, SESSION_TTL_SECONDS never read by binary (TTLs come from registry.rs consts). Delete three lines.
2. [NEEDS-REVIEW] SEAM_WEBHOOK_SECRET synced (deploy.yml:117) + typed (types.ts:87) but no route verifies Seam webhooks. Wire verifier or drop.
3. [NEEDS-REVIEW] wrangler.toml catalog omits USED secrets: ANTHROPIC_API_KEY (adjudication.ts:40,71; adminBroadcasts.ts:137-141; adminEmail.ts:122-124), MAILERSEND_WEBHOOK_SECRET, MAILERSEND_SMS_FROM, MAILERSEND_SMS_INBOUND_SECRET, CF_ANALYTICS_TOKEN, CF_ZONE_ID. Add to catalog.
4. [SAFE-DELETE] wrangler.toml:49-55 stale DIDIT entries: DIDIT_WORKFLOW_ID(+_BUSINESS) hardcoded now (didit.ts:58); DIDIT_CLIENT_ID/SECRET/ORGANIZATION_ID zero usages. Prune 5 lines.
5. [SAFE-DELETE] types.ts dead bindings: CLERK_PUBLISHABLE_KEY (line 19), SEED_BOOL (line 74) zero reads. CLERK_BUSINESS/CLEANER_WEBHOOK_SECRET only in types (keep if split-Clerk pending).
6. [SAFE-DELETE] turbo.json:28 + package.json:9 lint task is a no-op (no package defines lint script). Add real lint or drop.
7. [NEEDS-REVIEW] scripts/deploy-init.sh:111-115,219-231 bootstrap lists 5 Pages projects; deploy.yml ships 10. Sync.
8. [NEEDS-REVIEW] broker admin deployment (BROKER_DEPLOYMENT=admin path in main.rs:80-82,875-887 + registry) unreachable from any in-repo config — CLAUDE.md says physically separate deploy; confirm the separate Fly app exists.
9. [SAFE-DELETE] stale pre-Fly comments: jwt.rs:12 wasm32 notes; main.rs:12 says broker at auth.getsweepr.com (actually broker.getsweepr.com). Doc-only fix.
Migrations clean (008 family intentional). pnpm-workspace excluding services/* correct.
