# Admin committee — applications flow (sonnet)
1. FCRA adjudication endpoint has ZERO UI: POST /applications/:id/adjudicate (apps/api/src/routes/admin.ts:510-586) implements engage/pre-adverse/adverse w/ waiting-period gating, but ApplicationDetailPage.tsx:258-270 only wires generic approve/reject. Spec: when yardstik_status==="consider", render Adjudication panel (Clear/Issue pre-adverse/Finalize adverse w/ countdown until adverseActionEarliestAt) each behind typed reason, calling /adjudicate.
2. Report detail can't show screenings/records — NOT MODELED. YardstikReport (lib/yardstik.ts:83-92) = {id,status,candidate_id,package_name,meta,created_at,completed_at}; no screening data fetched/persisted (adjudication.ts:62-64 passes only id/status/package). Add admin-only LIVE proxy GET /admin/applications/:id/yardstik-report → extend client.getReport to capture screenings array — fetched live, never persisted (yardstik.ts:14-18 posture). Audit every view.
3. Dangling-comma root cause: ApplicationDetailPage.tsx:142 `[city,state].filter(Boolean).join(", ") || ", "` → renders ", ". Same anti-pattern lines 178,179 (`?? ", "`), 306 (Row fallback), ApplicationsPage.tsx:63,68. Fix: placeholder "Not provided" or omit.
4. Verification panel dead end (234-256): redesign as two expandable sections (Yardstik, Didit), collapsed to summary chip + "View report".
5. Service area card conflates 3 facts (190-193): split into Row dt/dd — Location / Travel radius / Preferred services.
6. Approve has no confirmation (260-262) while Reject does; add confirm-with-summary.
7. Applicant timeline missing though data exists (yardstik_invited_at/completed_at/pre_adverse_at, created_at in admin.ts:498-503): vertical timeline Applied→Invited→Didit→Report→Pre-adverse→Decision.
8. List hardcoded to pending (ApplicationsPage.tsx:41); add status segmented control + search + sort.
9. List rows lack verification chips; add dual-status column, "needs adjudication" first.
10. yardstikVariant maps consider→error(red) same as failure (29-35); icon + literal FCRA term, red only for adverse.
11. KYB Row shares ", " fallback bug (301-310); fix at component level.
12. Show "Reviewed by X on Y" from audit entries once decided.
TOP 3: wire /adjudicate UI; fix ", " fallbacks; build live Yardstik report fetch first.
