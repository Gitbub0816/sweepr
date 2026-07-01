import { useEffect, useState } from "react";
import { useAuth, useUser, useClerk } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { DashboardShell, Card, AccountPrivacy, SMSOptIn, toast } from "@sweepr/ui";
import { ContactSettings } from "../components/ContactSettings";
import { LanguageSelector } from "../i18n/LanguageSelector";

const API_URL = import.meta.env.VITE_API_URL ?? "";

/** SMS consent toggle backed by PATCH /customer-profile (TCPA audit-logged server-side). */
function SmsConsentSettings() {
  const { getToken } = useAuth();
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`${API_URL}/customer-profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { profile?: { smsConsent?: boolean } };
        if (!cancelled) setConsent(data.profile?.smsConsent ?? false);
      } catch { /* leave default */ }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  async function update(next: boolean) {
    const prev = consent;
    setConsent(next);
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/customer-profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ smsConsent: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(next ? "SMS notifications enabled" : "SMS notifications disabled");
    } catch {
      setConsent(prev);
      toast.error("Could not update SMS preference");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-3">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">SMS notifications</p>
      <div className={saving ? "pointer-events-none opacity-60" : undefined}>
        <SMSOptIn value={consent} onChange={(v) => void update(v)} />
      </div>
    </Card>
  );
}

export function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();

  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initials =
    [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("") ||
    email[0]?.toUpperCase() ||
    "U";

  return (
    <DashboardShell title={t("profile.title")} description={t("profile.description")}>
      <div className="max-w-lg space-y-6">
        <Card className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-seafoam-500 text-xl font-bold text-white">
            {user?.imageUrl ? <img src={user.imageUrl} alt="" className="h-full w-full object-cover" /> : initials}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-charcoal dark:text-white">
              {[user?.firstName, user?.lastName].filter(Boolean).join(" ") || t("profile.yourAccount")}
            </p>
            <p className="truncate text-sm text-slate-500">{email || "—"}</p>
          </div>
        </Card>

        <ContactSettings />

        <SmsConsentSettings />

        <Card className="space-y-3">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("settings.language")}</p>
          <LanguageSelector />
        </Card>

        <AccountPrivacy
          apiUrl={API_URL}
          getToken={getToken}
          email={email}
          onAccountDeleted={() => signOut(() => { window.location.href = "/"; })}
        />
      </div>
    </DashboardShell>
  );
}
