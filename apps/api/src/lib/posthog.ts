import { PostHog } from "posthog-node";

let _client: PostHog | null = null;

export function getPostHog(key: string): PostHog {
  if (!_client) _client = new PostHog(key, { host: "https://app.posthog.com" });
  return _client;
}

export async function serverTrack(
  env: { POSTHOG_KEY?: string },
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>
) {
  if (!env.POSTHOG_KEY) return;
  const ph = getPostHog(env.POSTHOG_KEY);
  ph.capture({ distinctId, event, properties: { ...properties, source: "api" } });
  await ph.flush();
}
