# Admin committee — visual system (opus)
1. StatusBadge fragmented across 3 systems, leaks raw enums ("consider","not_started","hard denied"; casing chaos; no icons). Spec: STATUS_REGISTRY in packages/utils/src/status.ts keyed by domain (job,yardstik,didit,kyb,scope_review,application,payout,dispute) → {label,tone,icon}; generalize <StatusBadge domain value /> in packages/ui Badge.tsx. Human labels: "Needs review" not "consider", "Cleared" not "clear". Sentence case, role="status".
2. Two blue statuses violate brand: DashboardPage.tsx:44 + JobsPage.tsx:38 confirmed:"bg-blue-100 text-blue-700"; same status green via JOB_STATUS_TONE elsewhere. Registry fixes.
3. DataTable app-local + unadopted (24 <table> blocks in 16 files hand-rolled). Promote to packages/ui/src/data/DataTable.tsx: sticky bg-offwhite header text-[11px] uppercase tracking-wide, 44px rows, hover no zebra, sortable th carets, Column<T> align/numeric(tabular-nums)/sortable/width, one formatDate.
4. No breadcrumbs/back on detail routes; add breadcrumbs slot to DashboardShell.
5. Filter/search copy-pasted in 28 files; JobsPage.tsx:144-161 = best pattern; extract packages/ui/src/data/FilterBar.tsx, debounced, 36px controls.
6. Refresh button re-implemented inline everywhere bypassing Button; add RefreshButton to packages/ui, pass via DashboardShell actions.
7. Two stat-card looks on dashboard (StatCard vs DashboardPage.tsx:196-204 bespoke); add compact variant.
8. AppShell main max-w-6xl too narrow for 9-col tables; widen to max-w-7xl.
9. 45 nav destinations, no global search; add ⌘K command menu.
10. ScopeReviewPage row-click closest("tr") hack — inaccessible; DataTable onRowClick w/ focusable rows, translate-y-px active, 150ms.
11. Mandate DashboardShell as only page-header path.
12. App.tsx:196 accent="Sweepr Ops" dead prop — surface or drop.
TOP 3: (1) one StatusBadge vocabulary; (2) promote+complete one DataTable; (3) shared toolbar primitives (FilterBar, RefreshButton, breadcrumbs, StatCard unify).
