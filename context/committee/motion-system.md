# UI committee — motion & microinteraction system (opus)
KEY CONSTRAINTS: @sweepr/ui must stay CSS-only (framer-motion = app-level vendor-motion chunk only). Marketing already uses the target ease-out (apps/marketing/src/index.css:84). 150-250ms ease-out; springs only for celebration.
1. Motion tokens in packages/config/tailwind.ts:62-80: transitionTimingFunction { out-quart: cubic-bezier(0.23,1,0.32,1), in-out-strong: cubic-bezier(0.77,0,0.175,1), drawer: cubic-bezier(0.32,0.72,0,1) }; transitionDuration { press:120ms, base:180ms, modal:220ms, sheet:360ms }; keyframes +shimmer +check-draw +ping-soft +modal-in. Soften global reduced-motion zeroing to keep opacity crossfades.
2. Button.tsx:59 — transition-[transform,background-color,box-shadow] duration-press ease-out-quart active:scale-[0.97], gate w/ [@media(hover:hover)].
3. Card.tsx:20 — opt-in `interactive` prop → hover:-translate-y-0.5 hover:shadow-md; only clickable cards; warm shadow.
4. Modal.tsx:39 — content: data-[state=open]:animate modal-in 220ms from scale(0.96)+opacity; exit 150ms; origin center.
5. Input.tsx:40 — animate focus ring via box-shadow transition; NO floating labels.
6. States.tsx:84,91,95 — replace animate-pulse skeletons with shimmer gradient sheen (bg-[length:200%_100%], 1.5s linear).
7. New packages/ui/src/components/SuccessCheck.tsx — SVG stroke-dashoffset draw 400ms; wire into ConfirmedStep.tsx:45-52; reduced-motion → instant.
8. New packages/ui/src/primitives/CountUp.tsx — rAF tween ~600ms ease-out, tabular-nums; StatCard.tsx:38, earnings, admin KPIs.
9. .stagger-item CSS utility keyed off --i (delay calc(var(--i)*45ms)) reusing fade-in; jobs/bookings lists.
10. Signature moments: booking-confirmed radial seafoam ring + check draw (no confetti); FoundingMemberBadge:34 gold sheen reusing sweep; check-in ping-soft halo; earnings CountUp; NotificationBell:98 one-shot ping on new unread; Toast = sonner default fine.
11. BAN: transition:all; scale(0) entrances; ease-in entrances; bounce on professional surfaces; animating height/top/margin; infinite loops on high-frequency elements; unguarded springs (ConfirmedStep.tsx:48 ignores useReducedMotion — wrap it).
TOP 3: (1) motion tokens in preset; (2) Button press-scale + skeleton shimmer; (3) keep @sweepr/ui framer-free, guard ConfirmedStep spring.
