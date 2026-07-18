# UI committee — customer app (sonnet)
[P1] packages/ui Button.tsx:25-33 — no press feedback; add active:scale-[0.97] transition-[transform,colors] duration-150 ease-out.
[P1] PaymentMethodsPage.tsx:67-72 — empty state dead end, no "Add payment method" CTA (BookingsPage passes one to same component).
[P1] TipCard.tsx:130-149 + BookingDetailPage.tsx:144-147 — tip-sent/review-submitted success states have zero motion; wrap Check in motion.div spring (stiffness 200 damping 14) matching ConfirmedStep.tsx:45-52.
[P2] BookingDetailPage.tsx:296-311 vs 424-444 — "Live updates" badge green-* vs seafoam status tracker on same page; unify to seafoam.
[P2] BookingLayout.tsx:88-99 — step transitions plain x:40 slide; ease:[0.16,1,0.3,1] ~200ms, consider mode="popLayout".
[P2] ConfirmedStep.tsx:62-83 — finding-cleaner→assigned hard swap; AnimatePresence crossfade (opacity/scale 0.95, 180ms).
[P2] AddressBook.tsx:110-112 — address delete fires instantly, no confirm/undo; Modal confirm or undo toast + active:scale-95.
[P2] Home.tsx:56-58,141-149 — greeting "!👋" against brand voice; GetCleaningCard hover: add -translate-y-0.5 + shadow-md lift.
[P3] RoomConditionStep.tsx:122-126 — selected checkmark hard conditional; spring in (stiffness 300 damping 20).
[P3] ScheduleStep 196-204/300-306, AddOnsStep 50-57, AddressStep 263-267, AddressBook TypeToggle — six ad-hoc card-select treatments; standardize one selectable-option treatment w/ active:scale-[0.98].
[P3] BookingsPage.tsx:71-87 — hand-drawn SVG broom breaks lucide icon family; use Sparkles.
[P3] ProfilePage.tsx:92-124 — 8 cards flat stack; group Account vs Offers w/ section labels, tint promos down.
TOP 3: (1) Button press feedback; (2) payment-methods empty-state CTA; (3) spring celebration on tip/review success.
