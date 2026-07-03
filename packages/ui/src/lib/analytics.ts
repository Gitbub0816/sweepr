// PostHog client wrapper — consent-gated, only initializes once.
// Reads from import.meta.env.VITE_POSTHOG_KEY and VITE_POSTHOG_HOST.
//
// Privacy model (GDPR/CCPA):
//  • Analytics NEVER starts until the visitor has affirmatively consented
//    (choice stored in localStorage under CONSENT_KEY).
//  • A Global Privacy Control signal (navigator.globalPrivacyControl) is
//    treated as an automatic, standing "declined" — it wins over stored consent.
//  • Declining after consenting opts out and clears stored analytics state.

type PostHogClient = typeof import('posthog-js').default

let _posthog: PostHogClient | null = null

export const CONSENT_KEY = 'sweepr_cookie_consent'

function env(): Record<string, string | undefined> {
  try {
    return (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
  } catch {
    return {}
  }
}

function gpcDeclined(): boolean {
  return Boolean((navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl)
}

export type ConsentState = 'granted' | 'denied' | 'unset'

export function getAnalyticsConsent(): ConsentState {
  if (typeof window === 'undefined') return 'unset'
  if (gpcDeclined()) return 'denied'
  try {
    const v = localStorage.getItem(CONSENT_KEY)
    if (!v) return 'unset'
    if (v === 'granted' || v === 'denied') return v
    // Marketing's banner stores a JSON record { analytics: boolean, ... }
    // under the same key — honor it too.
    const rec = JSON.parse(v) as { analytics?: boolean }
    if (typeof rec?.analytics === 'boolean') return rec.analytics ? 'granted' : 'denied'
    return 'unset'
  } catch {
    return 'unset'
  }
}

/** Persist the visitor's choice and start/stop analytics accordingly. */
export function setAnalyticsConsent(granted: boolean) {
  try {
    localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied')
  } catch { /* storage unavailable — session-only choice */ }
  if (granted && !gpcDeclined()) {
    void startPosthog()
  } else if (_posthog) {
    _posthog.opt_out_capturing()
    _posthog.reset()
  }
}

async function startPosthog() {
  const key = env().VITE_POSTHOG_KEY
  // Skip when unset or left at a placeholder value. A real PostHog project
  // key always starts with "phc_".
  if (!key || !key.startsWith('phc_')) return
  if (_posthog) {
    _posthog.opt_in_capturing()
    return
  }
  const { default: posthog } = await import('posthog-js')
  posthog.init(key, {
    api_host: env().VITE_POSTHOG_HOST ?? 'https://app.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    persistence: 'localStorage+cookie',
    session_recording: { maskAllInputs: true }, // never record PII input
    loaded: (ph) => {
      _posthog = ph as unknown as PostHogClient
    },
  })
  _posthog = posthog
}

/** Initialize analytics — no-op unless the visitor has already consented. */
export async function initAnalytics() {
  if (typeof window === 'undefined') return
  if (getAnalyticsConsent() !== 'granted') return
  await startPosthog()
}

export function track(event: string, properties?: Record<string, unknown>) {
  _posthog?.capture(event, properties)
}

export function identify(userId: string, traits?: Record<string, unknown>) {
  _posthog?.identify(userId, traits)
}

export function resetAnalytics() {
  _posthog?.reset()
}
