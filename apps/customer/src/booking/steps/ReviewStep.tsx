import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Home, CalendarClock, Sparkles, Zap, Repeat, Check } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { Card, Textarea, toast } from "@sweepr/ui";
import {
  formatDateTime,
  formatCurrency,
  getAddOn,
  getCleaningLevelInfo,
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
      <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-seafoam-50 text-seafoam-700 dark:bg-slate-800">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-xs text-slate-600">{label}</p>
        <p className="text-sm font-medium text-charcoal dark:text-white">
          {value}
        </p>
      </div>
    </div>
  );
}

function LineRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <span className="font-medium text-charcoal dark:text-white">
        {formatCurrency(amount)}
      </span>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wide text-seafoam-700 first:mt-0 dark:text-seafoam-300">
      {children}
    </p>
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
    cleaningLevel,
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
  const [acknowledged, setAcknowledged] = useState(false);

  const missingRequiredFields = !address || !serviceType || !scheduledFor || !cleaningLevel;
  useEffect(() => {
    if (!address || !serviceType || !scheduledFor) navigate("/book/address");
    else if (!cleaningLevel) navigate("/book/condition");
  }, [address, serviceType, scheduledFor, cleaningLevel, navigate]);

  if (missingRequiredFields) return null;

  const quote = getQuote();
  const total = quote?.total ?? 0;
  const subPrice =
    isSubscription && subscriptionCadence
      ? recurringDisplayPrice(total, subscriptionCadence)
      : null;

  // Split the itemized line items into three logical sections.
  const addOnNames = new Set(addOnKeys.map((k) => getAddOn(k)?.name).filter(Boolean));
  const packageItems = (quote?.lineItems ?? []).filter(
    (li) => li.label !== "Cleaning level surcharge" && !addOnNames.has(li.label),
  );
  const levelItems = (quote?.lineItems ?? []).filter((li) => li.label === "Cleaning level surcharge");
  const addOnItems = (quote?.lineItems ?? []).filter((li) => addOnNames.has(li.label));
  const levelInfo = cleaningLevel ? getCleaningLevelInfo(cleaningLevel) : undefined;

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
          cleaningLevel,
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
      nextDisabled={submitting || !acknowledged}
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
      </Card>

      {/* Itemized breakdown — three clearly separated sections. */}
      <Card className="mt-4">
        <SectionHeading>{t("booking.review.sectionPackage")}</SectionHeading>
        <p className="mb-2 text-xs text-slate-500">{t("booking.review.sectionPackageDesc")}</p>
        {packageItems.map((li) => (
          <LineRow key={li.label} label={li.label} amount={li.amount} />
        ))}

        <SectionHeading>{t("booking.review.sectionLevel")}</SectionHeading>
        <p className="mb-2 text-xs text-slate-500">{t("booking.review.sectionLevelDesc")}</p>
        {levelInfo && (
          <p className="py-1 text-sm font-medium text-charcoal dark:text-white">{levelInfo.title}</p>
        )}
        {levelItems.length > 0 ? (
          levelItems.map((li) => <LineRow key={li.label} label={li.label} amount={li.amount} />)
        ) : (
          <div className="flex items-center justify-between py-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">{t("booking.review.levelSurcharge")}</span>
            <span className="font-medium text-charcoal dark:text-white">{t("booking.review.noExtraCharge")}</span>
          </div>
        )}

        <SectionHeading>{t("booking.review.sectionAddOns")}</SectionHeading>
        <p className="mb-2 text-xs text-slate-500">{t("booking.review.sectionAddOnsDesc")}</p>
        {addOnItems.length > 0 ? (
          addOnItems.map((li) => <LineRow key={li.label} label={li.label} amount={li.amount} />)
        ) : (
          <p className="py-1 text-sm text-slate-500">{t("booking.review.noAddOns")}</p>
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
            <p className="mt-1 text-xs text-slate-600">
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

      {/* Required scope acknowledgement — blocks payment until checked. */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
        <label className="flex cursor-pointer items-start gap-3">
          <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-slate-300 bg-white checked:border-seafoam-600 checked:bg-seafoam-600 dark:border-slate-600 dark:bg-slate-900"
              aria-describedby="ack-details"
            />
            <Check className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100" />
          </span>
          <span className="text-sm font-medium text-charcoal dark:text-white">
            {t("booking.review.ackTitle")}
          </span>
        </label>
        <ul id="ack-details" className="mt-3 space-y-1.5 pl-8 text-xs text-slate-600 dark:text-slate-400">
          <li>{t("booking.review.ackScope")}</li>
          <li>{t("booking.review.ackDirty")}</li>
          <li>{t("booking.review.ackExcluded")}</li>
          <li>{t("booking.review.ackAddOns")}</li>
          <li>{t("booking.review.ackDecline")}</li>
          <li>{t("booking.review.ackRefusalFee")}</li>
          <li className="font-medium text-charcoal dark:text-slate-200">{t("booking.review.ackDisclosure")}</li>
        </ul>
      </div>
    </StepShell>
  );
}
