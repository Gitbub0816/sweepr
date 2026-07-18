# Admin committee — money cluster (opus)
[P1] JobDetailPage.tsx:164-168 — booking_price_ledger INVISIBLE: no admin read endpoint, no UI. Add /admin/jobs/:id/ledger + "Price history" card (delta, reason, actor, resulting total, Stripe ref). Biggest gap.
[P1] Raw integer-cents inputs: PayoutsPage.tsx:316/321/325, CouponsPage.tsx:183, PromotionsPage.tsx:458/475 — admin typing 20 for $20 grants $0.20. ApprovalsPage.tsx:124 does it right (parseFloat*100). Dollar inputs w/ $ prefix, convert on submit.
[P1] Money-moving actions no confirm: PayoutsPage.tsx:213 Release (Stripe transfer, single click), :472-473 dispute Release/Cancel, CouponsPage.tsx:221 Evaluate-now mints coupons. Build ConfirmDialog in @sweepr/ui echoing amount + recipient.
[P2] ApprovalDetailPage & PricingApprovalDetailPage ~95% duplicate; fee changes originate 2 places (ApprovalsPage modal + PayoutsPage FeeConfig tab :286-292). One unified Approvals queue w/ type column; shared ProposalDetail.
[P2] PayoutsPage 7-tab mega-page: Disputes tab duplicates /disputes route; fee-config belongs with approvals.
[P2] Coupons/Promotions/FoundingMembers hand-roll headers; standardize DashboardShell.
[P2] PayoutsPage.tsx:625 active tab border-indigo-600 text-indigo-700 — brand violation → seafoam.
[P2] Money formatting re-implemented 4x, unsafe negatives ($-50.00): PricingPage:127, CouponsPage:60, ApprovalDetailPage:141-145, PricingApprovalDetailPage:81 → formatCurrency/formatCents.
[P2] Approval action stacks: six equal full-width buttons; isolate primary, divider destructive, confirm decline/revoke.
[P2] Status pills hand-rolled in Coupons:51-56/Promotions:87-93; unify Badge; tabular-nums on figures; totals rows.
[P3] FoundingMembersPage:178 grant by raw UUID paste; typeahead by name/email.
[P3] PricingPage:185 simulator figures text-slate-500 low contrast → charcoal.
TOP 3: (1) ledger endpoint + Price history card; (2) kill raw-cents inputs; (3) ConfirmDialog on money movers.
