import type { Quote } from "@sweepr/types";
import { formatCurrency } from "@sweepr/utils";
import { Card } from "../primitives/Card";

/**
 * Customer-facing price summary. Per the locked pricing model, customers see
 * ONLY the single all-inclusive price — no fee breakdowns, service fees, or tax
 * line items. Subscription pricing is surfaced when provided.
 */
export function PriceSummary({
  quote,
  title = "Price Summary",
  footer,
  subscriptionPrice,
  cadence,
}: {
  quote: Quote;
  title?: string;
  footer?: React.ReactNode;
  /** Per-visit subscription price (dollars), if this is a subscription. */
  subscriptionPrice?: number;
  cadence?: "weekly" | "biweekly" | "monthly";
}) {
  const savings =
    subscriptionPrice != null ? Math.round(quote.total - subscriptionPrice) : 0;

  return (
    <Card className="sticky top-20">
      <h3 className="text-sm font-semibold text-charcoal dark:text-white">
        {title}
      </h3>

      <div className="mt-4">
        <p className="text-sm text-slate-500">Your clean</p>
        <p className="text-3xl font-bold text-charcoal dark:text-white">
          {formatCurrency(quote.total)}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Includes everything — supplies, service, tax
        </p>
      </div>

      {subscriptionPrice != null && (
        <div className="mt-4 rounded-xl bg-seafoam-50 p-3 dark:bg-slate-800">
          <p className="text-sm font-semibold text-seafoam-700 dark:text-seafoam-300">
            Subscription price: {formatCurrency(subscriptionPrice)}/visit
          </p>
          {savings > 0 && (
            <p className="text-xs text-amber-600">
              You save {formatCurrency(savings)} per cleaning
              {cadence ? ` (${cadence})` : ""}
            </p>
          )}
        </div>
      )}

      {footer && <div className="mt-4">{footer}</div>}
    </Card>
  );
}
