# Admin committee — ops cluster (sonnet)
[P1] App.tsx:113-165 — Errors/Security/T&S/Legal Archive/IT/Automation/Access Control split across three nav sections; consolidate into one "Ops" group ordered by triage frequency.
[P1] SecurityPage.tsx:169-346 vs ITPortalPage.tsx:165-436 — two near-identical ticket-queue implementations diverging (IT has bulk actions, slaBorder L146-152, queue stats; Security has none). Extract shared TicketQueueShell.
[P1] ITPortalPage.tsx:1092-1109 — Telemetry tab duplicates Errors page inline w/ different style. Replace with stat + "View in Errors →" link.
[P2] SecurityPage.tsx:186-207 — no urgency affordance on report rows; port SLA-border + priority pills from ITPortal.
[P2] AdjudicationTab.tsx:118-132 — executive_review/hold rows (FCRA-critical) look identical to auto_decided; amber left-border + "Needs decision" chip, sort to top.
[P2] AutomationPage.tsx:79-92,167-183 — Run buttons fire real Stripe capture/payouts with no confirm; gate capture-completed + batch-payouts behind Modal confirm.
[P2] ErrorsPage/AutomationPage/ITPortalPage have zero dark: classes (white-on-charcoal in dark mode); add dark variants mirroring TRIAGE_STYLE SecurityPage.tsx:45-50.
[P3] TrustSafetyPage.tsx:322 — Refresh does window.location.reload(); call active tab's load().
[P3] ITPortalPage.tsx:552-571,705-711 — Escalate to Security: toast should deep-link to /security with case pre-selected.
[P3] ScopeReviewPage.tsx:121 — Expires column plain text; amber/red escalation near expiry.
[P3] ScopeReviewPage.tsx:152-161 — row nav via closest("tr") DOM hack; add onRowClick prop to shared DataTable.
TOP 3: (1) one Ops nav group; (2) shared ticket-queue component; (3) confirm modal on money-moving Run buttons.
