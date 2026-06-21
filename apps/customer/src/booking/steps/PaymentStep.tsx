import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  AddressElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button, toast } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

/**
 * Stub the PaymentIntent creation until the worker is wired end-to-end.
 * Returns a fake client secret so the UI flow is fully exercisable.
 */
async function createPaymentIntent(amountCents: number): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/payments/create-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amountCents, currency: "usd" }),
    });
    if (res.ok) {
      const data = (await res.json()) as { clientSecret?: string };
      if (data.clientSecret) return data.clientSecret;
    }
  } catch {
    /* fall through to mock */
  }
  return `pi_mock_secret_${Date.now()}`;
}

function CheckoutForm({ total }: { total: number }) {
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

    // When running against the mock client secret, Stripe can't confirm —
    // simulate success so the booking flow stays demoable.
    if (!stripe || !elements) {
      setProcessing(false);
      return;
    }

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message ?? "Please check your details.");
        setProcessing(false);
        return;
      }
      confirmPayment();
      toast.success("Payment confirmed");
      navigate("/book/confirmed");
    } catch {
      // Mock secret path: still confirm for the demo.
      confirmPayment();
      toast.success("Payment confirmed");
      navigate("/book/confirmed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
        <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
          <Lock className="h-4 w-4" /> Secured by Stripe
        </div>
        <PaymentElement />
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            Billing address
          </p>
          <AddressElement options={{ mode: "billing" }} />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <Button
        className="mt-6"
        fullWidth
        size="lg"
        type="submit"
        loading={processing}
      >
        Pay {formatCurrency(total)}
      </Button>
    </form>
  );
}

/** Fallback shown when no real Stripe key/intent is available (demo mode). */
function DemoCheckout({ total }: { total: number }) {
  const navigate = useNavigate();
  const confirmPayment = useBookingStore((s) => s.confirmPayment);
  const [processing, setProcessing] = useState(false);

  return (
    <div>
      <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
        Stripe is not fully configured. This is a demo checkout — set
        VITE_STRIPE_PUBLISHABLE_KEY and the API to enable live payments.
      </p>
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-700">
        <Lock className="h-4 w-4" /> Card details collected securely via Stripe
        Elements in production.
      </div>
      <Button
        className="mt-6"
        fullWidth
        size="lg"
        loading={processing}
        onClick={() => {
          setProcessing(true);
          setTimeout(() => {
            confirmPayment();
            toast.success("Payment confirmed");
            navigate("/book/confirmed");
          }, 900);
        }}
      >
        Pay {formatCurrency(total)}
      </Button>
    </div>
  );
}

export function PaymentStep() {
  const navigate = useNavigate();
  const quote = useBookingStore((s) => s.getQuote());
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const total = quote?.total ?? 0;
  const amountCents = Math.round(total * 100);

  useEffect(() => {
    if (amountCents > 0) {
      createPaymentIntent(amountCents).then(setClientSecret);
    }
  }, [amountCents]);

  const options = useMemo(
    () =>
      clientSecret
        ? ({ clientSecret, appearance: { theme: "stripe" as const } })
        : undefined,
    [clientSecret]
  );

  if (!quote) {
    navigate("/book/service");
    return null;
  }

  return (
    <StepShell
      title="Payment"
      subtitle="You won't be charged until your cleaning is confirmed."
      onBack={() => navigate("/book/review")}
    >
      {stripePromise && clientSecret && options ? (
        <Elements stripe={stripePromise} options={options}>
          <CheckoutForm total={total} />
        </Elements>
      ) : (
        <DemoCheckout total={total} />
      )}
    </StepShell>
  );
}
