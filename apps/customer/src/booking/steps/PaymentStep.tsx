import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ShieldCheck, RefreshCw, Tag, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  AddressElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { useAuth } from "@clerk/clerk-react";
import { Button, Card, toast, SweeprLogo } from "@sweepr/ui";
import { formatCurrency, recurringDisplayPrice, calculateQuote } from "@sweepr/utils";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";
import { getStripeAppearance } from "../../lib/stripeAppearance";

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

function isDarkMode() {
  return document.documentElement.classList.contains("dark");
}

// ─── Order Summary ────────────────────────────────────────────────────────────

function OrderSummary() {
  const { t } = useTranslation();
  const serviceType = useBookingStore((s) => s.serviceType);
  const home = useBookingStore((s) => s.home);
  const addOnKeys = useBookingStore((s) => s.addOnKeys);
  const isSubscription = useBookingStore((s) => s.isSubscription);
  const subscriptionCadence = useBookingStore((s) => s.subscriptionCadence);
  const cadence = useBookingStore((s) => s.cadence);
  const quote = serviceType ? calculateQuote({ serviceType, home, addOnKeys }) : null;

  if (!quote) return null;

  const displayPrice = quote.total;

  // Recurring discount label
  const activeCadence = isSubscription ? subscriptionCadence : null;
  const recurringPrice =
    activeCadence ? recurringDisplayPrice(displayPrice, activeCadence) : null;
  const savings = recurringPrice !== null ? displayPrice - recurringPrice : 0;


  return (
    <Card className="space-y-4 border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between">
        <SweeprLogo size="lg" />
        <span className="rounded-full bg-seafoam-50 px-3 py-1 text-xs font-semibold text-seafoam-700 dark:bg-seafoam-900/30 dark:text-seafoam-300">
          {t("booking.payment.orderSummary")}
        </span>
      </div>

      <div className="h-px bg-slate-100 dark:bg-slate-800" />

      {/* Service line */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-400">
          {t(`serviceTypes.${serviceType ?? "standard"}`, { defaultValue: t("serviceTypes.standard") })}
        </span>
        <span className="font-semibold text-charcoal dark:text-white">
          {formatCurrency(displayPrice)}
        </span>
      </div>

      {/* Add-ons */}
      {addOnKeys.length > 0 && (
        <div className="space-y-1">
          {addOnKeys.map((key) => (
            <div key={key} className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-seafoam-400" />
                {key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
              </span>
              <span>{t("booking.payment.included")}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recurring badge */}
      {activeCadence && recurringPrice !== null && (
        <>
          <div className="h-px bg-slate-100 dark:bg-slate-800" />
          <div className="flex items-center gap-2 rounded-xl bg-seafoam-50 px-3 py-2.5 dark:bg-seafoam-900/20">
            <RefreshCw className="h-4 w-4 shrink-0 text-seafoam-500" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-seafoam-800 dark:text-seafoam-200">
                {t("booking.payment.subscription", { cadence: activeCadence.charAt(0).toUpperCase() + activeCadence.slice(1) })}
              </p>
              <p className="text-xs text-seafoam-600 dark:text-seafoam-400">
                {t("booking.payment.subscriptionPrice", { price: formatCurrency(recurringPrice), savings: formatCurrency(savings) })}
              </p>
            </div>
            <Tag className="h-4 w-4 shrink-0 text-seafoam-500" />
          </div>
        </>
      )}

      <div className="h-px bg-slate-100 dark:bg-slate-800" />

      {/* Total */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          {activeCadence ? t("booking.payment.firstCleanTotal") : t("booking.payment.total")}
        </span>
        <div className="text-right">
          <span className="text-xl font-bold text-charcoal dark:text-white">
            {formatCurrency(activeCadence && recurringPrice !== null ? recurringPrice : displayPrice)}
          </span>
          {cadence !== "none" && cadence && !isSubscription && (
            <p className="text-xs text-slate-400">{t("booking.payment.recurringCadence", { cadence })}</p>
          )}
        </div>
      </div>

      {/* Trust badges */}
      <div className="flex items-center gap-3 pt-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-seafoam-400" />
          {t("booking.payment.satisfactionGuarantee")}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Lock className="h-3.5 w-3.5 text-seafoam-400" />
          {t("booking.payment.securedByStripe")}
        </div>
      </div>
    </Card>
  );
}

// ─── Checkout form (inside <Elements>) ────────────────────────────────────────

function CheckoutForm({ total }: { total: number }) {
  const { t } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const confirmPayment = useBookingStore((s) => s.confirmPayment);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setProcessing(true);

    if (!stripe || !elements) {
      setProcessing(false);
      return;
    }

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message ?? "Please check your payment details.");
        setProcessing(false);
        return;
      }
      confirmPayment();
      toast.success("Payment confirmed!");
      navigate("/book/confirmed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed. Please try again.");
      setProcessing(false);
      return;
    }
    setProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Card / wallet tabs */}
      <div>
        <PaymentElement
          options={{
            layout: { type: "tabs", defaultCollapsed: false },
            fields: { billingDetails: { address: "never" } },
          }}
        />
      </div>

      {/* Billing address — separate so it gets our label styling via Stripe rules */}
      <div>
        <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">
          {t("booking.payment.billingAddress")}
        </p>
        <AddressElement
          options={{
            mode: "billing",
            fields: { phone: "never" },
            display: { name: "split" },
          }}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      <Button
        fullWidth
        size="lg"
        type="submit"
        loading={processing}
        className="h-14 text-base tracking-wide"
      >
        <Lock className="mr-2 h-4 w-4" />
        {t("booking.payment.payButton", { amount: formatCurrency(total) })}
      </Button>

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        {t("booking.payment.cardNotCharged")}
      </p>
    </form>
  );
}

// ─── Demo fallback (no Stripe key) ───────────────────────────────────────────

function DemoCheckout({ total }: { total: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirmPayment = useBookingStore((s) => s.confirmPayment);
  const [processing, setProcessing] = useState(false);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
        <strong>{t("booking.payment.demoMode")}</strong> — set{" "}
        <code className="text-xs">VITE_STRIPE_PUBLISHABLE_KEY</code> to enable
        live Stripe Elements.
      </div>

      {/* Visual mockup of the form */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <Lock className="h-3.5 w-3.5 text-seafoam-400" />
          {t("booking.payment.detailsSecure")}
        </div>
        <div className="grid gap-3">
          <div className="h-11 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-11 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
            <div className="h-11 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="h-11 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>

      <Button
        fullWidth
        size="lg"
        loading={processing}
        className="h-14 text-base tracking-wide"
        onClick={() => {
          setProcessing(true);
          setTimeout(() => {
            confirmPayment();
            toast.success("Payment confirmed (demo)");
            navigate("/book/confirmed");
          }, 900);
        }}
      >
        <Lock className="mr-2 h-4 w-4" />
        {t("booking.payment.payButton", { amount: formatCurrency(total) })}
      </Button>
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export function PaymentStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const serviceType = useBookingStore((s) => s.serviceType);
  const home = useBookingStore((s) => s.home);
  const addOnKeys = useBookingStore((s) => s.addOnKeys);
  const bookingId = useBookingStore((s) => s.bookingId);
  const quote = serviceType ? calculateQuote({ serviceType, home, addOnKeys }) : null;
  const isSubscription = useBookingStore((s) => s.isSubscription);
  const subscriptionCadence = useBookingStore((s) => s.subscriptionCadence);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [dark, setDark] = useState(() => isDarkMode());

  const displayPrice = quote?.total ?? 0;
  const chargedPrice =
    isSubscription && subscriptionCadence
      ? recurringDisplayPrice(displayPrice, subscriptionCadence)
      : displayPrice;

  // Track dark-mode changes so the Stripe appearance updates live.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(isDarkMode());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  // Create Stripe payment intent using the DB booking ID set by ReviewStep.
  useEffect(() => {
    if (!bookingId) return;
    getToken().then((token) => {
      fetch(`${API_URL}/payments/create-intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ bookingId }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { clientSecret?: string } | null) => {
          if (data?.clientSecret) setClientSecret(data.clientSecret);
        })
        .catch(() => {/* demo mode: no clientSecret, DemoCheckout renders */});
    });
  }, [bookingId, getToken]);

  const options = useMemo(
    () =>
      clientSecret
        ? {
            clientSecret,
            appearance: getStripeAppearance(dark),
            fonts: [
              {
                cssSrc:
                  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
              },
            ],
          }
        : undefined,
    [clientSecret, dark]
  );

  if (!quote) {
    navigate("/book/service");
    return null;
  }

  return (
    <StepShell
      title={t("booking.payment.title")}
      subtitle={t("booking.payment.subtitle")}
      onBack={() => navigate("/book/review")}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Left: payment form */}
        <div>
          {stripePromise && clientSecret && options ? (
            <Elements stripe={stripePromise} options={options}>
              <CheckoutForm total={chargedPrice} />
            </Elements>
          ) : (
            <DemoCheckout total={chargedPrice} />
          )}
        </div>

        {/* Right: order summary */}
        <div className="lg:order-first xl:order-last">
          <OrderSummary />
        </div>
      </div>
    </StepShell>
  );
}
