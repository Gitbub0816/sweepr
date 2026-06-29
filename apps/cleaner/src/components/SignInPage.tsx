import { useState, useRef, useCallback } from "react";
import { useSignIn } from "@clerk/clerk-react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { SweeprLogo, ThemeToggle } from "@sweepr/ui";
import { inputCls, isValidEmail, ErrorBox, SubmitButton } from "./authHelpers";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type Method = "email" | "phone";

export function SignInPage() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const navigate = useNavigate();

  const [method, setMethod] = useState<Method>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phoneStage, setPhoneStage] = useState<"form" | "code">("form");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [noAccount, setNoAccount] = useState(false);
  const probeTimer = useRef<ReturnType<typeof setTimeout>>();

  const probeEmail = useCallback((val: string) => {
    clearTimeout(probeTimer.current);
    setNoAccount(false);
    if (!isValidEmail(val)) return;
    probeTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/auth/probe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: val }),
        });
        if (res.ok) {
          const data = await res.json() as { exists: boolean };
          if (!data.exists) setNoAccount(true);
        }
      } catch { /* non-fatal */ }
    }, 600);
  }, []);

  async function handleOAuth(provider: "oauth_google" | "oauth_apple") {
    if (!isLoaded) return;
    setError("");
    try {
      await signIn.authenticateWithRedirect({ strategy: provider, redirectUrl: "/sso-callback", redirectUrlComplete: "/" });
    } catch (err: unknown) {
      setError((err as { errors?: { message: string }[] })?.errors?.[0]?.message ?? "OAuth sign-in failed.");
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError(""); setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        navigate("/");
      }
    } catch (err: unknown) {
      const clerr = (err as { errors?: { message: string; code?: string }[] })?.errors?.[0];
      if (clerr?.code === "form_identifier_not_found") setNoAccount(true);
      setError(clerr?.message ?? "Sign in failed. Check your credentials.");
    } finally { setLoading(false); }
  }

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError(""); setLoading(true);
    try {
      const result = await signIn.create({ identifier: phone });
      const factor = result.supportedFirstFactors?.find((f) => f.strategy === "phone_code");
      if (!factor) { setError("Phone sign-in is not enabled for this account."); return; }
      await signIn.prepareFirstFactor({ strategy: "phone_code", phoneNumberId: (factor as { phoneNumberId: string }).phoneNumberId });
      setPhoneStage("code");
    } catch (err: unknown) {
      setError((err as { errors?: { message: string }[] })?.errors?.[0]?.message ?? "Could not send code. Check your phone number.");
    } finally { setLoading(false); }
  }

  async function handlePhoneVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError(""); setLoading(true);
    try {
      const result = await signIn.attemptFirstFactor({ strategy: "phone_code", code });
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
        <p className="mt-1 text-sm font-medium text-seafoam-600 dark:text-seafoam-400">Sweepr Pro</p>
        <h1 className="mt-4 text-2xl font-bold text-charcoal dark:text-white">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to your Sweepr Pro account</p>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-3">
          {(["oauth_google", "oauth_apple"] as const).map((p) => (
            <button key={p} type="button" onClick={() => void handleOAuth(p)}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-charcoal shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700">
              {p === "oauth_google"
                ? <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              }
              Continue with {p === "oauth_google" ? "Google" : "Apple"}
            </button>
          ))}
        </div>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          <span className="text-xs text-slate-400">or</span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>

        <div className="mb-5 flex rounded-xl border border-slate-200 p-1 dark:border-slate-700">
          {(["email", "phone"] as Method[]).map((m) => (
            <button key={m} type="button" onClick={() => { setMethod(m); setError(""); setNoAccount(false); setPhoneStage("form"); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${method === m ? "bg-seafoam-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-400"}`}>
              {m === "email" ? "Email" : "Phone"}
            </button>
          ))}
        </div>

        {method === "email" && (
          <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-white">Email</label>
              <input type="email" autoComplete="email" required value={email}
                onChange={(e) => { setEmail(e.target.value); setNoAccount(false); setError(""); }}
                onBlur={(e) => probeEmail(e.target.value)}
                className={inputCls} placeholder="you@example.com" />
            </div>
            {noAccount && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/20">
                <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Ready to join the crew?</p>
                  <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                    No Pro account found for that email.{" "}
                    <Link to="/sign-up" state={{ prefillEmail: email }} className="font-semibold underline underline-offset-2">Apply instead →</Link>
                  </p>
                </div>
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-white">Password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} autoComplete="current-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className={`${inputCls} pr-11`} placeholder="••••••••" />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && <ErrorBox message={error} />}
            <SubmitButton loading={loading} disabled={!isLoaded} label="Sign in" />
          </form>
        )}

        {method === "phone" && phoneStage === "form" && (
          <form onSubmit={(e) => void handlePhoneSubmit(e)} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-white">Phone number</label>
              <input type="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
                className={inputCls} placeholder="+1 (555) 000-0000" />
            </div>
            {error && <ErrorBox message={error} />}
            <SubmitButton loading={loading} disabled={!isLoaded} label="Send code" />
          </form>
        )}

        {method === "phone" && phoneStage === "code" && (
          <form onSubmit={(e) => void handlePhoneVerify(e)} className="space-y-4">
            <p className="text-center text-sm text-slate-500">Code sent to <span className="font-medium text-charcoal dark:text-white">{phone}</span></p>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-2xl tracking-[0.5em] text-charcoal outline-none transition focus:border-seafoam-400 focus:ring-2 focus:ring-seafoam-400/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              placeholder="······" />
            {error && <ErrorBox message={error} />}
            <SubmitButton loading={loading} disabled={!isLoaded} label="Verify" />
            <button type="button" onClick={() => setPhoneStage("form")} className="w-full text-center text-sm text-slate-500 hover:text-slate-700">← Change number</button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          Don't have an account?{" "}
          <Link to="/sign-up" className="font-medium text-seafoam-600 hover:underline dark:text-seafoam-400">Create one</Link>
        </p>
      </div>
    </div>
  );
}
