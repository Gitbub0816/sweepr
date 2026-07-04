import { useState } from "react";
import { Check, Plus, PlusCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, Button, Modal, toast } from "@sweepr/ui";
import { ADD_ONS, getAddOn, isAddOnIncludedInPackage, formatCurrency, cn } from "@sweepr/utils";
import type { ServiceType } from "@sweepr/types";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export function AddServicesCard({
  bookingId,
  serviceType,
  existingAddOnKeys,
  currentTotal,
  getToken,
  onUpdated,
}: {
  bookingId: string;
  serviceType: ServiceType;
  existingAddOnKeys: string[];
  currentTotal: number; // dollars
  getToken: () => Promise<string | null>;
  onUpdated: () => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const existing = new Set(existingAddOnKeys);
  const additionalTotal = selected.reduce((sum, k) => sum + (getAddOn(k)?.price ?? 0), 0);
  const newTotal = currentTotal + additionalTotal;

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const confirm = async () => {
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/bookings/${bookingId}/addons`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ addOnKeys: selected }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        if (err.error === "booking_already_started") toast.error(t("bookingDetail.addServices.alreadyStarted"));
        else toast.error(err.message ?? t("bookingDetail.addServices.error"));
        return;
      }
      toast.success(t("bookingDetail.addServices.added"));
      setSelected([]);
      setConfirmOpen(false);
      onUpdated();
    } catch {
      toast.error(t("bookingDetail.addServices.error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-charcoal dark:text-white">
          <PlusCircle className="h-4 w-4 text-seafoam-500" /> {t("bookingDetail.addServices.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("bookingDetail.addServices.subtitle")}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {ADD_ONS.map((addOn) => {
          const included = isAddOnIncludedInPackage(addOn.key, serviceType);
          const purchased = existing.has(addOn.key);
          const disabled = included || purchased;
          const isSelected = selected.includes(addOn.key);
          return (
            <button
              key={addOn.key}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && toggle(addOn.key)}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                disabled
                  ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-80 dark:border-slate-700 dark:bg-slate-800/40"
                  : isSelected
                    ? "border-seafoam-400 bg-seafoam-50 ring-1 ring-seafoam-400 dark:bg-seafoam-900/20"
                    : "border-slate-200 bg-white hover:border-seafoam-300 dark:border-slate-700 dark:bg-slate-900"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  isSelected || purchased ? "bg-seafoam-700 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                )}
              >
                {isSelected || purchased ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium text-charcoal dark:text-white">{addOn.name}</span>
                {purchased ? (
                  <span className="text-xs font-medium text-seafoam-700 dark:text-seafoam-300">
                    {t("bookingDetail.addServices.alreadyAdded")}
                  </span>
                ) : included ? (
                  <span className="text-xs text-slate-500">{t("bookingDetail.addServices.includedInPackage")}</span>
                ) : (
                  <span className="text-xs text-slate-500">+{formatCurrency(addOn.price)}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <Button fullWidth onClick={() => setConfirmOpen(true)}>
          {t("bookingDetail.addServices.review", { amount: formatCurrency(additionalTotal) })}
        </Button>
      )}

      <Modal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("bookingDetail.addServices.confirmTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={confirm} loading={submitting}>
              {t("bookingDetail.addServices.confirmButton")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <ul className="space-y-1">
            {selected.map((k) => {
              const a = getAddOn(k);
              return (
                <li key={k} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-300">{a?.name}</span>
                  <span className="font-medium text-charcoal dark:text-white">{formatCurrency(a?.price ?? 0)}</span>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">{t("bookingDetail.addServices.additional")}</span>
              <span className="font-medium text-charcoal dark:text-white">{formatCurrency(additionalTotal)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-base font-semibold">
              <span className="text-charcoal dark:text-white">{t("bookingDetail.addServices.newTotal")}</span>
              <span className="text-charcoal dark:text-white">{formatCurrency(newTotal)}</span>
            </div>
          </div>
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/40 dark:text-slate-400">
            {t("bookingDetail.addServices.consent")}
          </p>
        </div>
      </Modal>
    </Card>
  );
}
