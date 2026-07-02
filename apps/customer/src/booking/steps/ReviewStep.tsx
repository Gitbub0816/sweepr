import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Home, CalendarClock, Sparkles, Zap, Repeat } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { Card, Textarea, toast } from "@sweepr/ui";
import {
  formatDateTime,
  formatCurrency,
  getAddOn,
  recurringDisplayPrice,
} from "@sweepr/utils";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-medium text-charcoal dark:text-white">
          {value}
        </p>
      </div>
    </div>
  );
}

export function ReviewStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const state = useBookingStore();
  const {
    address,
    home,
    serviceType,
    addOnKeys,
    scheduledFor,
    notes,
    isEmergency,
    isSubscription,
    subscriptionCadence,
    getQuote,
    setBookingId,
  } = state;
  const [submitting, setSubmitting] = useState(false);

  const missingRequiredFields = !address || !serviceType || !scheduledFor;
  useEffect(() => {
    if (missingRequiredFields) navigate("/book/address");
  }, [missingRequiredFields, navigate]);

  if (missingRequiredFields) return null;

  const quote = getQuote();
  const total = quote?.total ?? 0;
  const subPrice =
    isSubscription && subscriptionCadence
      ? recurringDisplayPrice(total, subscriptionCadence)
      : null;

  async function handleContinueToPayment() {
    setSubmitting(true);
    try {
      const token = await getToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // Save address to DB first, get addressId back.
      let addressId: string | undefined;
      try {
        const addrRes = await fetch(`${API_URL}/customer-profile/addresses`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            street: address!.line1,
            city: address!.city,
            state: address!.state,
            zip: address!.zip,
            lat: address!.lat,
            lng: address!.lng,
            makeDefault: !address?.id,
          }),
        });
        if (addrRes.ok) {
          const data = (await addrRes.json()) as { id: string };
          addressId = data.id;
        }
      } catch {
        // Non-fatal: booking can be created without an addressId.
      }

      // Create the booking in the database.
      const res = await fetch(`${API_URL}/bookings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          serviceType,
          bedrooms: home.bedrooms,
          bathrooms: home.bathrooms,
          sqft: home.sqft,
          homeType: home.homeType,
          hasPets: home.pets,
          addOnKeys,
          scheduledAt: scheduledFor,
          notes: notes || undefined,
          ...(addressId ? { addressId } : {}),
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Failed to create booking");
      }

      const data = (await res.json()) as { booking: { id: string } };
      setBookingId(data.booking.id);

      // Also update the customer's home profile defaults for future pre-fills.
      try {
        await fetch(`${API_URL}/customer-profile`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            homeBedrooms: home.bedrooms,
            homeBathrooms: home.bathrooms,
            homeSqft: home.sqft,
            homeType: home.homeType,
            hasPets: home.pets,
          }),
        });
      } catch {
        // Non-fatal.
      }

      navigate("/book/payment");
    } catch (err) {
      toast.error((err as Error).message || t("errors.couldNotCreateBooking"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StepShell
      title={t("booking.review.title")}
      subtitle={t("booking.review.subtitle")}
      onBack={() => navigate("/book/schedule")}
      onNext={handleContinueToPayment}
      nextLabel={submitting ? t("booking.review.creatingBooking") : t("booking.review.continueToPayment")}
      nextDisabled={submitting}
    >
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        <Row
          icon={MapPin}
          label={t("booking.review.address")}
          value={`${address.line1}, ${address.city}, ${address.state} ${address.zip}`}
        />
        <Row
          icon={Home}
          label={t("booking.review.home")}
          value={`${home.bedrooms} bd · ${home.bathrooms} ba · ${home.sqft} sqft · ${home.homeType}`}
        />
        <Row
          icon={Sparkles}
          label={t("booking.review.service")}
          value={t(`serviceTypes.${serviceType}`)}
        />
        <Row
          icon={CalendarClock}
          label={t("booking.review.scheduledFor")}
          value={formatDateTime(scheduledFor)}
        />
        {addOnKeys.length > 0 && (
          <div className="py-2">
            <p className="text-xs text-slate-400">{t("booking.review.addOns")}</p>
            <p className="text-sm font-medium text-charcoal dark:text-white">
              {addOnKeys.map((k) => getAddOn(k)?.name).join(", ")}
            </p>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        {isEmergency && (
          <span className="mb-3 inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            <Zap className="h-3 w-3" /> {t("booking.review.rushBooking")}
          </span>
        )}
        {subPrice != null ? (
          <div>
            <p className="text-sm text-slate-500">{t("booking.review.firstClean")}</p>
            <p className="text-3xl font-bold text-charcoal dark:text-white">
              {formatCurrency(total)}
            </p>
            <p className="mt-2 flex items-center gap-1 text-sm font-medium text-seafoam-700">
              <Repeat className="h-4 w-4" />
              {t("booking.review.then")} {formatCurrency(subPrice)} {t("booking.review.every")} {subscriptionCadence}
            </p>
            {total - subPrice > 0 && (
              <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                {t("booking.review.savePerVisit", { amount: formatCurrency(total - subPrice) })}
              </span>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-500">{t("booking.review.yourClean")}</p>
            <p className="text-3xl font-bold text-charcoal dark:text-white">
              {formatCurrency(total)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {t("booking.review.includesEverything")}
            </p>
          </div>
        )}
      </Card>

      <div className="mt-4">
        <Textarea
          label={t("booking.review.notesLabel")}
          placeholder={t("booking.review.notesPlaceholder")}
          value={notes}
          onChange={(e) => state.setNotes(e.target.value)}
        />
      </div>
    </StepShell>
  );
}
