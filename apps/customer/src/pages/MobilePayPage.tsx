/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * /pay — the native apps' payment surface.
 *
 * The iOS/Android apps have no Stripe SDK (SKIP dual-platform constraint), so
 * after they create a PaymentIntent through the AUTHENTICATED API
 * (POST /payments/create-intent for a booking, POST /tips for a tip), they
 * open this page in the system browser with the intent's client secret in the
 * URL FRAGMENT (never sent to any server, absent from logs/referrers):
 *
 *   https://app.getsweepr.com/pay#cs=<clientSecret>&kind=booking|tip&amount=<cents>
 *
 * A Stripe client secret is designed for exactly this client-side confirmation
 * role (Stripe's own redirect flows carry it in return URLs). The page renders
 * a PaymentElement (Apple Pay / Google Pay included automatically in the
 * browser), confirms, and tells the person to hop back to the app — which is
 * polling the booking/tip status and advances the moment the webhook lands.
 * No auth here: possession of the client secret only permits paying that one
 * intent, and the page displays only the amount (no booking PII).
 */

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { ShieldCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button, Card, SweeprLogo } from "@sweepr/ui";
import { getStripeAppearance } from "../lib/stripeAppearance";

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;

function isDarkMode() {
  return document.documentElement.classList.contains("dark");
}

interface PayParams {
  clientSecret: string;
  kind: "booking" | "tip";
  amountCents: number | null;
}

function parseFragment(): PayParams | null {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const clientSecret = params.get("cs");
  if (!clientSecret || !/^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/.test(clientSecret)) return null;
  const kind = params.get("kind") === "tip" ? ("tip" as const) : ("booking" as const);
  const amountRaw = params.get("amount");
  const amountCents = amountRaw && /^\d{2,7}$/.test(amountRaw) ? Number(amountRaw) : null;
  return { clientSecret, kind, amountCents };
}

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function PayForm({ params }: { params: PayParams }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        // Redirect-based methods bounce back here; the fragment survives.
        return_url: window.location.href,
      },
    });
    if (confirmError) {
      setError(confirmError.message ?? "Payment didn't go through. Try again.");
      setSubmitting(false);
      return;
    }
    if (
      paymentIntent &&
      ["succeeded", "requires_capture", "processing"].includes(paymentIntent.status)
    ) {
      setDone(true);
    }
    setSubmitting(false);
  };

  if (done) return <SuccessPanel kind={params.kind} />;

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <Button fullWidth loading={submitting} onClick={submit}>
        {params.amountCents != null
          ? `${params.kind === "tip" ? "Send tip" : "Pay"} ${dollars(params.amountCents)}`
          : params.kind === "tip"
            ? "Send tip"
            : "Confirm payment"}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5" />
        Secured by Stripe.
        {params.kind === "booking" && " You're authorized now and charged after your cleaning."}
      </p>
    </div>
  );
}

function SuccessPanel({ kind }: { kind: "booking" | "tip" }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <CheckCircle2 className="h-14 w-14 text-emerald-500" />
      <h2 className="text-xl font-semibold text-charcoal dark:text-white">
        {kind === "tip" ? "Tip sent — thank you!" : "You're all set!"}
      </h2>
      <p className="max-w-xs text-sm text-slate-600 dark:text-slate-300">
        {kind === "tip"
          ? "100% of your tip goes to your cleaner."
          : "Your payment is confirmed. Hop back to the Sweepr app — your booking will update in a moment."}
      </p>
      <a
        href="sweepr://payment-complete"
        className="mt-2 inline-flex items-center justify-center rounded-xl bg-seafoam-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-seafoam-700"
      >
        Open the Sweepr app
      </a>
    </div>
  );
}

export default function MobilePayPage() {
  const [params, setParams] = useState<PayParams | null>(null);
  const [dark, setDark] = useState(() => isDarkMode());

  useEffect(() => {
    setParams(parseFragment());
    const observer = new MutationObserver(() => setDark(isDarkMode()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Redirect-based confirm methods return with Stripe params appended; the
  // presence of redirect_status=succeeded means we can show success directly.
  const redirectSucceeded = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    return q.get("redirect_status") === "succeeded";
  }, []);

  const options = useMemo(
    () =>
      params
        ? { clientSecret: params.clientSecret, appearance: getStripeAppearance(dark) }
        : undefined,
    [params, dark],
  );

  return (
    <div className="flex min-h-screen items-start justify-center bg-offwhite px-4 py-10 dark:bg-charcoal">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <SweeprLogo className="h-8" />
        </div>
        <Card className="p-5">
          {!stripePromise || !params ? (
            <div className="py-8 text-center text-sm text-slate-600 dark:text-slate-300">
              {redirectSucceeded ? (
                <SuccessPanel kind="booking" />
              ) : (
                <>
                  This payment link is incomplete. Head back to the Sweepr app and try
                  again.
                </>
              )}
            </div>
          ) : redirectSucceeded ? (
            <SuccessPanel kind={params.kind} />
          ) : (
            <Elements stripe={stripePromise} options={options}>
              <PayForm params={params} />
            </Elements>
          )}
        </Card>
        <p className="text-center text-xs text-slate-400">
          Sweepr never sees your card details — payment is handled by Stripe.
        </p>
      </div>
    </div>
  );
}
