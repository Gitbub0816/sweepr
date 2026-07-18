# Admin committee — comms cluster (sonnet)
[P1] EmailPage.tsx:21-27,159-514 vs BroadcastsPage:65-295 vs NewsletterPage:23-171 — three parallel systems; EmailPage Broadcasts tab duplicates BroadcastsPage; its Newsletter tab CANNOT SEND (no subject/body); Compose tab = third builder hitting /admin/email/send. Fix: delete EmailPage.tsx; BroadcastsPage/NewsletterPage sole owners; fold block builder into Mail ComposeModal.
[P1] EmailPage.tsx:518-532 — Inbox tab is "coming soon" placeholder next to the real working /mail. Remove.
[P1] App.tsx:144-157 — Comms bucket = 10 flat items incl. Promotions/Coupons/Smart Entry. Split.
[P2] MailPage:302-311, NotificationsPage:96-109, SchedulePage:130-142 hand-roll headers vs shared DashboardShell (packages/ui/src/layout/DashboardShell.tsx:14-43). Wrap all three.
[P2] ComposeModal.tsx:78-113 — TemplatePicker exists but only wired to IT/Security; add department:"support" picker to Mail compose.
[P2] "Notifications" naming collision: settings matrix page vs bell feed (AdminNotificationBell.tsx:85-143, no history page). Rename "Notification settings"; add alert-history page.
[P2] EmailPage:374 broadcast_type vs BroadcastsPage:111 broadcastType — fork drift bug in waiting.
[P2] EmailPage:109,282-317 — logo from raw.githubusercontent.com (must be objects.getsweepr.com CLAUDE.md §11); pun-heavy tone suggestions clash with brand voice.
[P3] SchedulePage:155-182 — day cell click always opens create modal; no day-agenda view for "+N more". Empty-space click → agenda panel.
[P3] MailPage:364-434 — super-admin mailbox-access table bolted under inbox; move to Access Control.
[P3] EmailPage:411-414 — tone suggestion stays pinned after admin writes copy.
TOP 3: kill EmailPage dup tabs; fix nav split + rename Notifications + history page; TemplatePicker in Mail compose.
