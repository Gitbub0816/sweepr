# UI committee — cross-app consistency (opus)
[P1] customer App.tsx:77,226 + src/components/ErrorBoundary.tsx — stale local ErrorBoundary nests INSIDE the canonical packages/ui one and wins for subtree errors (worse UX, no reporting). Delete local file + wrap.
[P1] apps/cleaner/index.html:18 — meta description says "Sweepr Pro" (HARD BRAND BAN, SEO-visible). Fix: "The Sweepr Cleaner dashboard: jobs, schedule, earnings, and training."
[P1] favicons: 7 apps use 2421x847 wordmark → illegible sliver; business 612x408 PNG; only marketing square. Add one square sweepr-mark (1:1) + repoint all apps.
[P2] NavAuth copy-pasted 3x + DRIFTED: cleaner line 72 hardcodes English "Sign out", dropped useTranslation despite 10 locales (i18n regression). Promote one NavAuth to packages/ui; restore t("auth.signOut").
[P2] 25 admin files raw animate-spin, 0 uses of SweeprLoader; adopt SweeprLoader/Screen for page loads, raw spinners only inline in buttons.
[P2] apps/business/index.html:15 theme-color #14b8a6 (seafoam) on platinum surface → #4B5056; 85KB favicon PNG too heavy.
[P2] business/main.tsx:68 + auth/main.tsx:43 mount ErrorBoundary with no app/apiUrl props → render errors never reach admin error feed. Pass app="business"/"auth" + AppName entries.
[P3] No shared EmptyState primitive; add <EmptyState icon title body action> to packages/ui.
[P3] CentralSession.tsx & appToken.ts duplicated 3x byte-identical — move to shared package before drift.
[P3] Head hygiene: mixed title formats; customer+business lack meta robots (business should noindex); standardize template.
[P3] SweeprLoader broom Lottie teal-locked; business shows seafoam broom on platinum. Neutral variant or currentColor tint.
POSITIVE: business platinum remap intentional + well executed (keep); toast genuinely unified via sonner ToastProvider (keep).
TOP 3: delete customer stale ErrorBoundary; fix "Sweepr Pro" meta; square favicon everywhere.
