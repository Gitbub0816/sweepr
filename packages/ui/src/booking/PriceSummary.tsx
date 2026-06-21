import type { Quote } from "@sweepr/types";
import { formatCurrency } from "@sweepr/utils";
import { Card } from "../primitives/Card";

export function PriceSummary({
  quote,
  title = "Price Summary",
  footer,
}: {
  quote: Quote;
  title?: string;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="sticky top-20">
      <h3 className="text-sm font-semibold text-charcoal dark:text-white">
        {title}
      </h3>
      <dl className="mt-4 space-y-2 text-sm">
        {quote.lineItems.map((item, i) => (
          <div key={i} className="flex justify-between text-slate-600 dark:text-slate-300">
            <dt>{item.label}</dt>
            <dd>{formatCurrency(item.amount)}</dd>
          </div>
        ))}
        <div className="my-2 border-t border-slate-100 dark:border-slate-800" />
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <dt>Subtotal</dt>
          <dd>{formatCurrency(quote.subtotal)}</dd>
        </div>
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <dt>Service fee</dt>
          <dd>{formatCurrency(quote.serviceFee)}</dd>
        </div>
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <dt>Tax</dt>
          <dd>{formatCurrency(quote.tax)}</dd>
        </div>
        <div className="my-2 border-t border-slate-100 dark:border-slate-800" />
        <div className="flex justify-between text-base font-bold text-charcoal dark:text-white">
          <dt>Total</dt>
          <dd>{formatCurrency(quote.total)}</dd>
        </div>
      </dl>
      {footer && <div className="mt-4">{footer}</div>}
    </Card>
  );
}
