import Stripe from "stripe";

/**
 * Stripe client configured for the Cloudflare Workers fetch runtime.
 */
export function getStripe(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}
