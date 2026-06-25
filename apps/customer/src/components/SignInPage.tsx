import { useState } from "react";
import { useSignIn } from "@clerk/clerk-react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { SweeprLogo, ThemeToggle } from "@sweepr/ui";
import { inputCls, ErrorBox, SubmitButton, Divider, MethodTabs, Field, OAuthButton } from "./authHelpers";

type Method = "email" | "phone";

export function SignInPage() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/book";

  const [method, setMethod] = useState<Method>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phoneStage, setPhoneStage] = useState<"form" | "code">("form");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleOAuth(provider: "oauth_google" | "oauth_apple") {
    if (!isLoaded) return;
    setError("");
    try {
      await signIn.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/book",
      });
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
        navigate(redirectTo);
      }
    } catch (err: unknown) {
      setError((err as { errors?: { message: string }[] })?.errors?.[0]?.message ?? "Sign in failed. Check your credentials.");
    } finally { setLoading(false); }
  }

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError(""); setLoading(true);
    try {
      const result = await signIn.create({ identifier: phone });
      const factor = result.supportedFirstFactors?.find((f) => f.strategy === "phone_code");
      if (!factor) { setError("Phone sign-in not enabled for this account."); return; }
      await signIn.prepareFirstFactor({ strategy: "phone_code", phoneNumberId: (factor as { phoneNumberId: string }).phoneNumberId });
      setPhoneStage("code");
    } catch (err: unknown) {
      setError((err as { errors?: { message: string }[] })?.errors?.[0]?.message ?? "Could not send code.");
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
        navigate(redirectTo);
      }
    } catch (err: unknown) {
      setError((err as { errors?: { message: string }[] })?.errors?.[0]?.message ?? "Invalid code.");
    } finally { setLoading(false); }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-seafoam-50 via-offwhite to-seafoam-100 px-4 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="mb-8 flex flex-col items-center text-center">
        <SweeprLogo size="md" />
        <h1 className="mt-4 text-2xl font-bold text-charcoal dark:text-white">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to manage your cleans</p>
      </div>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-3">
          <OAuthButton provider="oauth_google" label="Continue with Google" onClick={() => void handleOAuth("oauth_google")} />
          <OAuthButton provider="oauth_apple" label="Continue with Apple" onClick={() => void handleOAuth("oauth_apple")} />
        </div>
        <Divider />
        <MethodTabs method={method} onChange={(m) => { setMethod(m); setError(""); setPhoneStage("form"); }} />

        {method === "email" && (
          <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-4">
            <Field label="Email">
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className={inputCls} placeholder="you@example.com" />
            </Field>
            <Field label="Password">
              <div className="relative">
                <input type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password}
                  onChange={(e) => setPassword(e.target.value)} className={`${inputCls} pr-11`} placeholder="••••••••" />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {error && <ErrorBox message={error} />}
            <SubmitButton loading={loading} disabled={!isLoaded} label="Sign in" />
          </form>
        )}

        {method === "phone" && phoneStage === "form" && (
          <form onSubmit={(e) => void handlePhoneSubmit(e)} className="space-y-4">
            <Field label="Phone number">
              <input type="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
                className={inputCls} placeholder="+1 (555) 000-0000" />
            </Field>
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
