import { useState, useEffect } from "react";
import { useSignIn, useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowRight, ShieldX } from "lucide-react";
import { ThemeToggle, SweeprLogo } from "@sweepr/ui";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type Stage = "email" | "code";

function ErrorBox({ message }: { message: string }) {
  return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{message}</p>;
}

export function SignInPage() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isSignedIn) navigate("/", { replace: true });
  }, [isSignedIn, navigate]);

  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notAuthorized, setNotAuthorized] = useState(false);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError(""); setLoading(true); setNotAuthorized(false);
    try {
      // Pre-check: verify this email belongs to an authorized admin before asking Clerk to send a code.
      const check = await fetch(`${API_URL}/admin/check-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (check.ok) {
        const { authorized } = await check.json() as { authorized: boolean };
        if (!authorized) {
          setNotAuthorized(true);
          setLoading(false);
          return;
        }
      }

      await signIn.create({ identifier: email });
      const emailFactor = signIn.supportedFirstFactors?.find((f) => f.strategy === "email_code");
      if (!emailFactor) {
        setError("Email code sign-in is not enabled. Contact your administrator.");
        return;
      }
      await signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId: (emailFactor as { emailAddressId: string }).emailAddressId });
      setStage("code");
    } catch (err: unknown) {
      setError((err as { errors?: { message: string }[] })?.errors?.[0]?.message ?? "Could not send code. Check your email address.");
    } finally { setLoading(false); }
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError(""); setLoading(true);
    try {
      const result = await signIn.attemptFirstFactor({ strategy: "email_code", code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        navigate("/");
      }
    } catch (err: unknown) {
      setError((err as { errors?: { message: string }[] })?.errors?.[0]?.message ?? "Invalid code. Please try again.");
    } finally { setLoading(false); }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-seafoam-50 via-offwhite to-seafoam-100 px-4 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="mb-8 flex flex-col items-center text-center">
        <SweeprLogo size="md" />
        <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-seafoam-600 dark:text-seafoam-400">Ops Console</p>
        <h1 className="mt-4 text-2xl font-bold text-charcoal dark:text-white">
          {stage === "email" ? "Sign in to Admin" : "Check your email"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {stage === "email" ? "Enter your admin email to receive a sign-in code" : `We sent a 6-digit code to ${email}`}
        </p>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        {stage === "email" ? (
          <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-white">Email address</label>
              <input
                type="email" autoComplete="email" required autoFocus
                value={email}
                onChange={(e) => { setEmail(e.target.value); setNotAuthorized(false); setError(""); }}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-charcoal outline-none transition focus:border-seafoam-400 focus:ring-2 focus:ring-seafoam-400/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                placeholder="you@getsweepr.com"
              />
            </div>

            {notAuthorized && (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800/40 dark:bg-red-900/20">
                <ShieldX className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-300">Not authorized</p>
                  <p className="mt-0.5 text-xs text-red-700 dark:text-red-400">
                    This email doesn't have admin access. Contact your administrator if you believe this is an error.
                  </p>
                </div>
              </div>
            )}

            {error && <ErrorBox message={error} />}
            <button
              type="submit" disabled={loading || !isLoaded}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-seafoam-500 py-3 text-sm font-semibold text-white shadow-md shadow-seafoam-500/30 transition hover:bg-seafoam-600 disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {loading ? "Checking…" : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void handleCodeSubmit(e)} className="space-y-4">
            <input
              type="text" inputMode="numeric" autoComplete="one-time-code" required autoFocus maxLength={6}
              value={code} onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-2xl tracking-[0.5em] text-charcoal outline-none transition focus:border-seafoam-400 focus:ring-2 focus:ring-seafoam-400/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              placeholder="······" />
            {error && <ErrorBox message={error} />}
            <button
              type="submit" disabled={loading || !isLoaded}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-seafoam-500 py-3 text-sm font-semibold text-white shadow-md shadow-seafoam-500/30 transition hover:bg-seafoam-600 disabled:opacity-60">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Verifying…" : "Sign in"}
            </button>
            <button type="button" onClick={() => { setStage("email"); setCode(""); setError(""); }}
              className="w-full text-center text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
              ← Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
