import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Repeat, Pause, Play, SkipForward, X, Sparkles, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, Button, Badge, toast } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";
import { useAuth } from "@clerk/clerk-react";

const API = import.meta.env.VITE_API_URL ?? "";

interface SubRow {
  id: string;
  service_type: string;
  cadence: "weekly" | "biweekly" | "monthly";
  display_price: number; // cents
  status: "active" | "paused" | "cancelled";
  next_cleaning_date: string | null;
}

export function SubscriptionsPage() {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/subscriptions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { subscriptions: SubRow[] };
      setSubs(data.subscriptions ?? []);
    } catch {
      toast.error(t("subscriptions.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  async function callApi(path: string, method = "PATCH") {
    const token = await getToken();
    const res = await fetch(`${API}/subscriptions/${path}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error();
  }

  async function pause(id: string) {
    try {
      await callApi(`${id}/pause`);
      setSubs((s) => s.map((x) => (x.id === id ? { ...x, status: "paused" } : x)));
      toast.success(t("subscriptions.pauseSuccess"));
    } catch { toast.error(t("subscriptions.couldNotPause")); }
  }

  async function resume(id: string) {
    try {
      await callApi(`${id}/resume`);
      setSubs((s) => s.map((x) => (x.id === id ? { ...x, status: "active" } : x)));
      toast.success(t("subscriptions.resumeSuccess"));
    } catch { toast.error(t("subscriptions.couldNotResume")); }
  }

  async function skipNext(id: string) {
    try {
      await callApi(`${id}/skip-next`);
      toast.success(t("subscriptions.skipSuccess"));
      load();
    } catch { toast.error(t("subscriptions.couldNotSkip")); }
  }

  async function cancel(id: string) {
    try {
      await callApi(id, "DELETE");
      setSubs((s) => s.filter((x) => x.id !== id));
      toast.success(t("subscriptions.cancelSuccess"));
    } catch { toast.error(t("subscriptions.couldNotCancel")); }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-seafoam-500" />
      </div>
    );
  }

  if (subs.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Sparkles className="mx-auto h-10 w-10 text-seafoam-400" />
        <h1 className="mt-4 text-xl font-bold text-charcoal dark:text-white">
          {t("subscriptions.noSubsTitle")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("subscriptions.noSubsDesc")}
        </p>
        <Link to="/book" className="mt-6 inline-block">
          <Button>{t("subscriptions.bookRecurring")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-charcoal dark:text-white">{t("subscriptions.title")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("subscriptions.description")}</p>

      <div className="mt-6 space-y-4">
        {subs.map((sub) => (
          <Card key={sub.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
                  <Repeat className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold capitalize text-charcoal dark:text-white">
                    {t(`serviceTypes.${sub.service_type}`, { defaultValue: sub.service_type.replace(/_/g, " ") })}
                  </p>
                  <p className="text-sm text-slate-500">
                    {t(`subscriptions.cadence.${sub.cadence}`)} · {formatCurrency(sub.display_price / 100)}/visit
                  </p>
                  {sub.next_cleaning_date && (
                    <p className="mt-1 text-xs text-slate-400">
                      {t("subscriptions.nextCleaning")}:{" "}
                      {new Date(sub.next_cleaning_date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant={sub.status === "active" ? "success" : "default"}>
                {sub.status === "active" ? t("subscriptions.statusActive") : t("subscriptions.statusPaused")}
              </Badge>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {sub.status === "active" ? (
                <Button variant="secondary" onClick={() => pause(sub.id)}>
                  <Pause className="mr-1 h-4 w-4" /> {t("subscriptions.pause")}
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => resume(sub.id)}>
                  <Play className="mr-1 h-4 w-4" /> {t("subscriptions.resume")}
                </Button>
              )}
              <Button variant="ghost" onClick={() => skipNext(sub.id)}>
                <SkipForward className="mr-1 h-4 w-4" /> {t("subscriptions.skipNext")}
              </Button>
              <Button variant="ghost" onClick={() => cancel(sub.id)}>
                <X className="mr-1 h-4 w-4" /> {t("subscriptions.cancel")}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
