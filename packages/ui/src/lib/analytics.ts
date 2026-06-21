// PostHog client wrapper — only initializes once
// Reads from import.meta.env.VITE_POSTHOG_KEY and VITE_POSTHOG_HOST

type PostHogClient = typeof import('posthog-js').default

let _posthog: PostHogClient | null = null

function env(): Record<string, string | undefined> {
  try {
    return (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
  } catch {
    return {}
  }
}

export async function initAnalytics() {
  if (typeof window === 'undefined') return
  const key = env().VITE_POSTHOG_KEY
  if (!key) return
  const { default: posthog } = await import('posthog-js')
  posthog.init(key, {
    api_host: env().VITE_POSTHOG_HOST ?? 'https://app.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    session_recording: { maskAllInputs: true }, // never record PII input
    loaded: (ph) => {
      _posthog = ph as unknown as PostHogClient
    },
  })
  _posthog = posthog
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
