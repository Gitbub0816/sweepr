/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useMemo, useState } from "react";
import { Heart, Check } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Card, Button, toast } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";
import { getStripeAppearance } from "../lib/stripeAppearance";

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;
const API_URL = import.meta.env.VITE_API_URL ?? "";
const TIP_WINDOW_DAYS = 3;

const PRESETS = [500, 1000, 2000]; // cents

function isDarkMode() {
  return document.documentElement.classList.contains("dark");
}

function TipCheckout({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError(null);
    setProcessing(true);
    try {
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });
      if (confirmError) {
        setError(confirmError.message ?? t("bookingDetail.tip.error"));
        setProcessing(false);
        return;
      }
      onDone();
    } catch {
      setError(t("bookingDetail.tip.error"));
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement options={{ layout: { type: "tabs", defaultCollapsed: false } }} />
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}
      <Button type="submit" fullWidth loading={processing}>
        {t("bookingDetail.tip.confirm")}
      </Button>
    </form>
  );
}

export function TipCard({
  bookingId,
  completedAt,
  getToken,
}: {
  bookingId: string;
  completedAt?: string;
  getToken: () => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const [existingTip, setExistingTip] = useState<{ amount_cents: number; status: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [amountCents, setAmountCents] = useState<number>(1000);
  const [customValue, setCustomValue] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sent, setSent] = useState(false);
  const [dark, setDark] = useState(() => isDarkMode());

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDarkMode()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    getToken().then((token) => {
      fetch(`${API_URL}/tips/booking/${bookingId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { tip: { amount_cents: number; status: string } | null } | null) => {
          if (active && data?.tip) setExistingTip(data.tip);
        })
        .catch(() => {})
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [bookingId, getToken]);

  const windowClosed = useMemo(() => {
    if (!completedAt) return false;
    return Date.now() - new Date(completedAt).getTime() > TIP_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  }, [completedAt]);

  const options = useMemo(
    () => (clientSecret ? { clientSecret, appearance: getStripeAppearance(dark) } : undefined),
    [clientSecret, dark],
  );

  if (loading) return null;

  // Already tipped (succeeded/pending) → show the sent state.
  if (sent || (existingTip && existingTip.status !== "failed" && existingTip.status !== "refunded")) {
    const amount = existingTip ? existingTip.amount_cents : amountCents;
    return (
      <Card className="bg-seafoam-50 dark:bg-seafoam-900/20">
        <div className="flex items-center gap-3">
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 14 }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-seafoam-600 text-white"
          >
            <Check className="h-5 w-5" />
          </motion.span>
          <div>
            <h2 className="text-sm font-semibold text-charcoal dark:text-white">
              {t("bookingDetail.tip.sentTitle")}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("bookingDetail.tip.sentBody", { amount: formatCurrency(amount / 100) })}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (windowClosed) {
    return (
      <Card>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-charcoal dark:text-white">
          <Heart className="h-4 w-4 text-seafoam-500" /> {t("bookingDetail.tip.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("bookingDetail.tip.windowClosed")}
        </p>
      </Card>
    );
  }

  const startTip = async () => {
    const value = customValue ? Math.round(parseFloat(customValue) * 100) : amountCents;
    if (!value || value < 100 || value > 50000) {
      toast.error(t("bookingDetail.tip.invalidAmount"));
      return;
    }
    setAmountCents(value);
    setCreating(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/tips`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ bookingId, amountCents: value }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        if (err.error === "tip_window_closed") toast.error(t("bookingDetail.tip.windowClosed"));
        else toast.error(t("bookingDetail.tip.error"));
        return;
      }
      const data = (await res.json()) as { clientSecret: string };
      setClientSecret(data.clientSecret);
    } catch {
      toast.error(t("bookingDetail.tip.error"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-charcoal dark:text-white">
          <Heart className="h-4 w-4 text-seafoam-500" /> {t("bookingDetail.tip.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("bookingDetail.tip.subtitle")}
        </p>
      </div>

      {!clientSecret ? (
        <>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => { setAmountCents(preset); setCustomValue(""); }}
                className={`rounded-xl border px-2 py-2 text-sm font-semibold transition-colors ${
                  !customValue && amountCents === preset
                    ? "border-seafoam-500 bg-seafoam-50 text-seafoam-700 dark:bg-seafoam-900/30 dark:text-seafoam-300"
                    : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                }`}
              >
                {formatCurrency(preset / 100)}
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={500}
              inputMode="decimal"
              placeholder={t("bookingDetail.tip.custom")}
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              className="rounded-xl border border-slate-200 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              aria-label={t("bookingDetail.tip.customAmount")}
            />
          </div>
          <Button fullWidth onClick={startTip} loading={creating}>
            {t("bookingDetail.tip.addTip")}
          </Button>
        </>
      ) : stripePromise && options ? (
        <Elements stripe={stripePromise} options={options}>
          <TipCheckout onDone={() => { setSent(true); toast.success(t("bookingDetail.tip.sentTitle")); }} />
        </Elements>
      ) : (
        <Button fullWidth onClick={() => { setSent(true); toast.success(t("bookingDetail.tip.sentTitle")); }}>
          {t("bookingDetail.tip.confirm")}
        </Button>
      )}
    </Card>
  );
}
