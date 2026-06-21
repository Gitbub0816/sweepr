import type { Quote } from "@sweepr/types";
import { formatCurrency, SERVICE_LABELS } from "@sweepr/utils";
import { Card } from "../primitives/Card";

export function QuoteCard({ quote }: { quote: Quote }) {
  return (
    <Card className="bg-gradient-to-br from-seafoam-500 to-seafoam-600 text-white">
      <p className="text-sm/relaxed opacity-90">
        {SERVICE_LABELS[quote.serviceType]}
      </p>
      <p className="mt-1 text-4xl font-bold">{formatCurrency(quote.total)}</p>
      <p className="mt-2 text-sm opacity-90">
        Instant quote · includes service fee &amp; tax
      </p>
    </Card>
  );
}
