import { useClerk, useUser } from "@clerk/clerk-react";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

const CLERK_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

export function NavAuth() {
  const { signOut } = useClerk();
  const { isSignedIn, user } = useUser();
  const navigate = useNavigate();

  if (!CLERK_ENABLED || !isSignedIn) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-xs text-slate-500 sm:block">
        {user?.primaryEmailAddress?.emailAddress}
      </span>
      <button
        onClick={() => void signOut(() => navigate("/sign-in"))}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sign out
      </button>
    </div>
  );
}
