# Code committee — packages (opus)
[SAFE-DELETE] packages/utils/src/email.ts whole file (~150 lines; superseded by lib/mailer.ts) + drop export * index.ts:17.
[SAFE-DELETE] packages/utils/src/storage.ts whole file + index.ts:18.
[SAFE-DELETE] packages/ui/src/components/MapR3FOverlay.tsx (only consumer of three.js stack).
[SAFE-DELETE] packages/ui package.json deps: @react-three/fiber, @react-three/drei, three, @types/three (only MapR3FOverlay used them).
[SAFE-DELETE] packages/ui/src/layout/MobileNav.tsx (129 lines) + index.ts:31.
[SAFE-DELETE] packages/ui/src/primitives/Drawer.tsx + re-export.
[SAFE-DELETE] packages/ui/src/primitives/Stepper.tsx + re-export (service/marketing Steppers are local components).
[SAFE-DELETE] packages/ui/src/booking/QuoteCard.tsx + ServiceCard.tsx + re-exports.
[SAFE-DELETE] packages/ui/src/components/SavedPaymentCard.tsx (orphaned; PaymentMethodsPage uses generic Card).
[SAFE-DELETE] utils dead fns: formatTime (format.ts), getCleaningLevelInfo + getPackageScope.
[SAFE-DELETE] packages/db index.ts `transact` export (no importer).
[NEEDS-REVIEW] 10 tables never queried by api (background_check_consents, billing_profiles, clerk_organization_mappings, platform_organizations, tax_profiles, damage_claims, incident_reports, legal_documents, sms_consents, subprocessors) — several forward-looking for business migration. DO NOT DROP without confirmation.
[NEEDS-REVIEW] over-exported pricing internals (ADD_ON_PRICES etc.) — optional de-export.
NOT DEAD (verified): NavigationMap, SlotChip, WaitlistForm, lottie-web + posthog-js (dynamic imports), auth_* tables (Rust broker), config preset.
~450 lines UI + 2 utils files + 4 heavy deps removable.
