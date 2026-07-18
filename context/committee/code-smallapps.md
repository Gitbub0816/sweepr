# Code committee — small apps + BFFs (sonnet)
[SAFE-DELETE] marketing pages Terms.tsx, PrivacyPolicy.tsx, IndependentContractorDisclosure.tsx — unrouted (App.tsx:48,52,53 use LegalRedirect), zero imports.
[NEEDS-REVIEW] business CentralSession.tsx:62-67 exports RedirectToCentralLogin (never imported); App.tsx:58-61 shadows with weaker local dup (no return_to, renders null). Delete dead export or wire the good one.
[NEEDS-REVIEW] legal deploy env gap: main.tsx:22-28 reads VITE_POSTHOG_KEY/HOST but deploy-legal job (~line 342 deploy.yml) sets none → zero analytics on legal. Oversight.
[NEEDS-REVIEW] sanitizeReturnPath duplicated 5x across 2 languages (3 BFF _lib.ts:217-233 + Rust broker + looser apps/auth/src/broker.ts:145-157 buildRedirectUrl). Drift hazard.
[COSMETIC] customer+cleaner functions/_lib.ts:12 "Sweepr Sweepr" doubled-word typo (confirms hand-copied trio).
[CLEAN] BFF trio functional parity confirmed — only expected per-app substitutions.
[CLEAN] apps/service actively used (cors.ts:20, statusChecks.ts:36, deployed).
[NEEDS-REVIEW] marketing StatusPage.tsx duplicates apps/status App.tsx (types drifting: loose string vs strict unions). Intentional embed vs standalone, but two-copy risk.
[CLEAN] apps/auth no legacy remnants.
