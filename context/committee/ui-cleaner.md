# UI committee — cleaner app (sonnet)

**[P1] apps/cleaner/src/pages/DashboardPage.tsx:241,703,732 — Systemic indigo/violet brand violation (29 occurrences).** Every tab (Overview welcome card, Next Job callout, Performance tier hero, milestone bar, tab underline, toggle icons) uses indigo/violet, not seafoam. Fix: indigo-600→seafoam-700, indigo-*→seafoam-*, violet-*→teal-700/seafoam-600; gradients read from-seafoam-600 to-teal-700 per TrainingPage's from-seafoam-500 via-seafoam-600 to-teal-700.

**[P2] packages/ui/src/cards/StatCard.tsx:15-53 — stat numbers inert: no hover, no transition, no count-up.** Add transition-shadow hover:shadow-md to Card; animate value with 400-600ms count-up or motion.span fade+translateY on mount.

**[P2] apps/cleaner/src/pages/JobDetailPage.tsx:414-422 — Job completion has zero celebration.** Reuse TrainingPage's Confetti component (or extract to @sweepr/ui) + spring scale-in (scale 0.95→1, spring bounce 0.2) on ShieldCheck icon.

**[P2] apps/cleaner/src/pages/OnboardingPage.tsx:456-522 — Application submitted → only a toast.** Add 600-800ms success state (checkmark scale-in + confetti burst) before navigating to /pending.

**[P2] packages/ui/src/primitives/Button.tsx:26-33 — No press feedback.** Add transition-transform active:scale-[0.97] to base classes.

**[P3] DashboardPage.tsx:128-215 OnboardingChecklist — step-complete = instant icon swap.** Add scale+fade icon swap + one-time progress-bar fill animation.

**[P3] JobDetailPage.tsx:273-303 — progress stepper flat transition-colors.** Add scale pulse (1→1.1→1, 300ms ease-out) on circle when it becomes active.

**[P3] SchedulePage.tsx:137-144 — infinite animate-pulse on Available Now card.** Replace with single 2-3s pulse on toggle-on then settle static.

**[P3] DashboardPage.tsx:323-329 STATUS_COLOR — raw green/yellow/blue-100 pills instead of shared Badge.** Swap to StatusBadge from packages/ui/src/primitives/Badge.tsx.

**[P3] apps/cleaner/src/components/JobCard.tsx:149-156 — offer-expiry countdown plain text.** Add radial countdown ring or gentle pulse under 30s.

TOP 3: (1) purge indigo/violet from DashboardPage; (2) celebration on job completion + application submission reusing Confetti; (3) active:scale-[0.97] on shared Button.
