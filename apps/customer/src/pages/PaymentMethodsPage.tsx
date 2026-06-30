import { useEffect, useState, useCallback } from "react";
import { CreditCard } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { DashboardShell, Card, Badge, EmptyState } from "@sweepr/ui";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface Method {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
}

export function PaymentMethodsPage() {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const [methods, setMethods] = useState<Method[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!API_URL) { setLoading(false); return; }
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/payments/methods`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setMethods(((await res.json()) as { methods: Method[] }).methods ?? []);
    } catch { /* empty */ } finally { setLoading(false); }
  }, [getToken]);
  useEffect(() => { load(); }, [load]);

  return (
    <DashboardShell title={t("payment.title")} description={t("payment.description")}>
      {loading ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : methods.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-10 w-10 text-slate-300" />}
          title={t("payment.noCardsTitle")}
          description={t("payment.noCardsDesc")}
        />
      ) : (
        <div className="space-y-3">
          {methods.map((pm) => (
            <Card key={pm.id} className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
                <CreditCard className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-medium capitalize text-charcoal dark:text-white">
                  {pm.brand} ···· {pm.last4}
                </p>
                {pm.expMonth && pm.expYear && (
                  <p className="text-sm text-slate-500">
                    {t("payment.expires")} {String(pm.expMonth).padStart(2, "0")}/{pm.expYear}
                  </p>
                )}
              </div>
              {pm.isDefault && <Badge variant="success">Default</Badge>}
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
