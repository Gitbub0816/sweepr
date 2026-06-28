import { useEffect, useState, useCallback } from "react";
import { useAuth, useUser, useClerk } from "@clerk/clerk-react";
import { BadgeCheck, ShieldCheck, Star } from "lucide-react";
import {
  DashboardShell, Card, Badge, Input, Textarea, Button, toast, AccountPrivacy,
} from "@sweepr/ui";
import { ContactSettings } from "../components/ContactSettings";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface Cleaner {
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  rating: number | null;
  total_jobs: number | null;
  status: string | null;
  checkr_status: string | null;
  didit_status: string | null;
}

function statusBadge(ok: boolean, pending: boolean) {
  if (ok) return <Badge variant="success">Verified</Badge>;
  if (pending) return <Badge variant="warning">Pending</Badge>;
  return <Badge variant="warning">Not started</Badge>;
}

export function ProfilePage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const [cleaner, setCleaner] = useState<Cleaner | null>(null);
  const [bio, setBio] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  const load = useCallback(async () => {
    if (!API_URL) return;
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/cleaners/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const { cleaner: c } = (await res.json()) as { cleaner: Cleaner | null };
        if (c) {
          setCleaner(c);
          setBio(c.bio ?? "");
          setName([c.first_name, c.last_name].filter(Boolean).join(" "));
        }
      }
    } catch { /* leave empty */ }
  }, [getToken]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const token = await getToken();
      const [firstName, ...rest] = name.trim().split(" ");
      const res = await fetch(`${API_URL}/cleaners/me`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: firstName || undefined, lastName: rest.join(" ") || undefined, bio }),
      });
      toast[res.ok ? "success" : "error"](res.ok ? "Profile saved" : "Could not save profile");
    } finally { setSaving(false); }
  }

  const initials =
    [cleaner?.first_name?.[0], cleaner?.last_name?.[0]].filter(Boolean).join("") ||
    email[0]?.toUpperCase() || "U";

  return (
    <DashboardShell title="Profile" description="Manage your profile, contact details, and data.">
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-seafoam-500 text-xl font-bold text-white">
              {user?.imageUrl ? <img src={user.imageUrl} alt="" className="h-full w-full object-cover" /> : initials}
            </div>
            <div>
              <p className="font-semibold text-charcoal dark:text-white">{name || "Your profile"}</p>
              <p className="flex items-center gap-1 text-sm text-slate-500">
                <Star className="h-3.5 w-3.5 fill-amberaccent text-amberaccent" />
                {cleaner?.rating != null ? Number(cleaner.rating).toFixed(1) : "—"} · {cleaner?.total_jobs ?? 0} jobs
              </p>
            </div>
          </div>
          <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} />
          <Button onClick={save} loading={saving}>Save changes</Button>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold text-charcoal dark:text-white">Verification status</h2>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-slate-500"><BadgeCheck className="h-4 w-4 text-emerald-500" /> Identity</span>
            {statusBadge(cleaner?.didit_status === "approved", cleaner?.didit_status === "pending" || cleaner?.didit_status === "in_review")}
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Background check</span>
            {statusBadge(cleaner?.checkr_status === "clear", cleaner?.checkr_status === "pending" || cleaner?.checkr_status === "consider")}
          </div>
        </Card>
      </div>

      <div className="mt-6 max-w-lg space-y-6">
        <ContactSettings />
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
