# UI committee — public sites (sonnet)
[P1] apps/legal, apps/status, apps/service tailwind.config.ts — NONE import @sweepr/config/tailwind preset; slate-* = stock blue-gray, no dark mode/grain, each defines charcoal #1a1a2e (bluish, wrong — brand is #1c1a17). Fix: presets:[preset], delete local color/font blocks.
[P1] legal AttorneyPortal.tsx:347-417 — entire portal inline CSSProperties w/ stock hexes + #14b8a6 button, bypasses @sweepr/ui. Rebuild w/ Tailwind + Button/Card, bg-seafoam-700.
[P1] legal HomePage.tsx:36-69 — 49 docs as identical card grid; replace with hairline-divided editorial list per category (divide-y rows), matching marketing StepList treatment.
[P1] status App.tsx:338-339 — prelaunch banner bg-purple-100 (AI purple tell); → seafoam-50/700 or amberaccent.
[P2] service LandingPage.tsx:40-42 — floating pill above H1 (banned); → small-caps label pattern.
[P2] service LandingPage.tsx:122 + CustomerView.tsx:86-87 — violet second accent; differentiate roles by icon+label or neutral slate.
[P2] status App.tsx:71-83 — STATUS/SEVERITY_COLORS raw yellow/orange/blue/red incl. blue for monitoring; recolor amberaccent/seafoam/warm red.
[P2] status App.tsx:216 — raw emoji 🔧🗓 → lucide Wrench/Calendar.
[P3] legal Section.tsx:23 — no max-width cap on prose; add max-w-[75ch].
[P3] legal DocPage.tsx:12,129-132 + HomePage.tsx:12,38-43 — full framer-motion import for trivial fade (~126KB); port marketing's CSS sweepr-fade-up/reveal, drop import.
TOP 3: preset wiring for legal/status/service; rebuild AttorneyPortal on @sweepr/ui; editorial list for legal home.
