# In-browser navigation — known limitations

This module is a web approximation of turn-by-turn navigation, built on
Apple MapKit JS and the browser Geolocation/Wake Lock/Speech Synthesis APIs.
It runs inside a normal (or installed-PWA) browser tab, not as a native app,
which comes with real, permanent limitations. These are documented here
deliberately and not softened elsewhere in the UI:

- **Background throttling.** Mobile browsers aggressively throttle or fully
  suspend JavaScript timers, `requestAnimationFrame`, and geolocation
  callbacks when the tab isn't the foreground app. Backgrounding the browser
  or switching apps will pause or degrade navigation.
- **Screen-lock interruption.** Locking the screen typically halts
  geolocation updates and animation. The Wake Lock API (used here when
  available) keeps the screen on to avoid this, but it is a best-effort
  browser API — it can be denied, revoked by the OS, or unsupported, and is
  released automatically whenever the tab is hidden (we re-request it on
  `visibilitychange`, not while hidden).
- **Variable location update frequency.** `watchPosition` update cadence and
  accuracy vary by device, OS power state, and browser — there is no
  guaranteed fix rate the way native CoreLocation navigation apps get.
- **No reliable device heading in many browsers/devices.** `coords.heading`
  from the Geolocation API is frequently `null` at low speed or when
  unsupported; this module falls back to a bearing computed from consecutive
  GPS fixes, which is noisier and lags a true compass heading.
- **Web Speech API behavior is inconsistent.** Voice availability, quality,
  and even whether `speechSynthesis` works at all while the tab is
  backgrounded varies significantly across mobile Safari and Chrome-Android.
  Voice guidance is fully optional for this reason.
- **No CarPlay / Android Auto.** This is a browser tab; it cannot appear on
  a vehicle's built-in display.
- **No native lane guidance or junction imagery.** MapKit JS's directions
  response does not include lane arrows or junction/exit signage — only
  turn-by-turn text instructions and route geometry.
- **No native CoreLocation privileges, even installed as a PWA.** A
  home-screen PWA on iOS/Android still runs through the browser's
  geolocation stack, not a native location manager — it does not gain
  background location, precise-location-always permission, or any
  capability a native app would have.

Given all of the above, an "Open in Apple Maps" native handoff button is
always shown alongside the in-browser experience (see
`components/NavigationScreen.tsx`) so a cleaner can drop into native
turn-by-turn at any time.
