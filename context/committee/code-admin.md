# Code committee — admin app (sonnet)
[NEEDS-REVIEW] ~14 files reimplement authed-fetch closure (ApprovalsPage:91, ApprovalDetailPage:81, ScopeReviewPage:81, ScopeReviewDetailPage:97, PricingRulePage:44, SecurityPage:58, ITPortalPage:181,466, SlackPage:43, MailPage:58, ZipPricingPanel:45, PricingApprovalDetailPage:45, SettingsPage:277, TrustSafetyPage:65, CleaningPricingPage:99) — shared useAuthedFetch already exists in lib/alerts.ts:64 (used by 6 pages). Consolidate.
[NEEDS-REVIEW] PayoutsPage:52 useApi vs ObservabilityPage:47 useObs — duplicate fetch hooks → one shared hook.
[SAFE-DELETE] components/AdminMap.tsx:1-92 — zero imports monorepo-wide.
[NEEDS-REVIEW] lib/permissions.ts:20-52 ROUTE_SCREEN missing 6 mounted routes (/schedule /promotions /coupons /smart-entry /founding-members /legal-archive) — frontend-ungated for all admins (matches IA committee finding).
[NEEDS-REVIEW] hand-rolled tables in AdminsPage(2), CouponsPage(2), EventsPage, FoundingMembersPage, MailPage, PromotionsPage, ObservabilityPage(6) vs DataTable used by 12 pages.
No dead API paths (all resolve to mounted routers). No orphaned pages/components. useAdminRole used.
