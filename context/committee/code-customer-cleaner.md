# Code committee — customer+cleaner (sonnet)
[SAFE-DELETE] cleaner navigation/simulation/navigationSimulator.ts:1-225 — zero real imports (only a comment ref in navigation/types/navigation.ts:214). Delete + SimulationScenario/SimulatedLocationSample types if unused.
[BROKEN] cleaner YardstikSimulatePage.tsx:27-33 — postMessage "yardstik-simulate-complete" has NO listener anywhere; mock getReport hardcodes "clear"; page reachable unauthenticated at /yardstik-simulate (outside ProtectedRoute, App.tsx:196). Strip dead button or wire real listener.
[NEEDS-REVIEW] NavAuth drift: cleaner renders null signed-out (no sign-in path) + hardcodes "Sign out" though auth.signOut exists in all 10 locales. Backport t() + confirm signed-out behavior.
[NEEDS-REVIEW] authHelpers drift: cleaner fork gained a11y (role=alert, aria-live, aria-busy, focus-visible, sr-only Loading) that customer's copy (used by SignInPage/SignUpPage/ContinueSignUp) lacks. Port a11y to customer.
[DRY] CentralSession.tsx, lib/appToken.ts, hooks/useNotifications.ts, ProtectedRoute.tsx byte-identical across customer/cleaner (+business CentralSession) — move to shared package.
CLEAN otherwise; FounderBanner/ContactSettings/ContinueSignUp same-name diverge legitimately.
