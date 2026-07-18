# Code committee — API worker (opus)
1. [SAFE-DELETE] lib/adminRoles.ts entire file (51 lines) — dup of middleware/adminRoles.ts; zero importers (all 36 consumers use middleware/).
2. [SAFE-DELETE] lib/piiRedact.ts entire file — zero importers.
3. [BROKEN+SAFE-DELETE] lib/firebase.ts — self-labeled stub, fake signed URL; zero refs.
4. [SAFE-DELETE] lib/fcm.ts + lib/firestore.ts — dead FCM push subsystem; real notifications use lib/notifications.ts. Verify no planned mobile push first.
5. [SAFE-DELETE] index.ts:605 — cron import of adminAutomationRouter aliased to _, unused.
6. [SAFE-DELETE] middleware/cors.ts:53 corsMiddleware export — superseded by buildCorsMiddleware (index.ts:313).
7. [NEEDS-REVIEW] lib/constants.ts:11-30 — stale money constants (PLATFORM_FEE_PERCENT=0.2 etc.) zero refs + contradict conv #2; keep only OFFER_EXPIRY_MINUTES, MAX_UPLOAD_BYTES, TAX_RATE.
8. [NEEDS-REVIEW] lib/bookingAuthorization.ts:72-91 — canViewBooking/canModifyBooking/canViewAccessCodes dead (only getBookingAuthCtx + canUploadPhotos wired).
9. [SAFE-DELETE] dead helpers: emailI18n.isRtl; rbac.isPermissionKey; workspaces.listWorkspacesForIdentity; sweeprPlus.tryConsumeRescheduleWaiver.
10. [SAFE-DELETE] index.ts:441-444 no-op /training/* middleware.
FALSE POSITIVES ruled out: sweeprPricingEngine (used via ./ import), permissions vs rbac distinct, adminDebug intentional, /admin/mail+/admin-mail alias intentional.
