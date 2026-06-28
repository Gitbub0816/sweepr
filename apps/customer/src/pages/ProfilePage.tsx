import { useAuth, useUser, useClerk } from "@clerk/clerk-react";
import { DashboardShell, Card, AccountPrivacy } from "@sweepr/ui";
import { ContactSettings } from "../components/ContactSettings";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export function ProfilePage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();

  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initials =
    [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("") ||
    email[0]?.toUpperCase() ||
    "U";

  return (
    <DashboardShell title="Profile" description="Manage your account, contact details, and data.">
      <div className="max-w-lg space-y-6">
        <Card className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-seafoam-500 text-xl font-bold text-white">
            {user?.imageUrl ? <img src={user.imageUrl} alt="" className="h-full w-full object-cover" /> : initials}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-charcoal dark:text-white">
              {[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Your account"}
            </p>
            <p className="truncate text-sm text-slate-500">{email || "—"}</p>
          </div>
        </Card>

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
