import { CreditCard, Trash2 } from "lucide-react";

export interface SavedPaymentCardProps {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault?: boolean;
  onRemove?: () => void;
}

const BRAND_LABEL: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  discover: "Discover",
};

/** Displays a saved card with brand, last 4 and expiry, plus a remove action. */
export function SavedPaymentCard({
  brand,
  last4,
  expMonth,
  expYear,
  isDefault,
  onRemove,
}: SavedPaymentCardProps) {
  const label = BRAND_LABEL[brand.toLowerCase()] ?? brand;
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-14 items-center justify-center rounded-lg bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-charcoal dark:text-white">
            {label} •••• {last4}
            {isDefault && (
              <span className="rounded-full bg-seafoam-100 px-2 py-0.5 text-xs font-semibold text-seafoam-700">
                Default
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500">
            Expires {String(expMonth).padStart(2, "0")}/{String(expYear).slice(-2)}
          </p>
        </div>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label} ending ${last4}`}
          className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
