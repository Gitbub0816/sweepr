import { useState } from "react";
import { useSignUp } from "@clerk/clerk-react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { SweeprLogo, ThemeToggle, SMSOptIn } from "@sweepr/ui";
import { inputCls, ErrorBox, SubmitButton, Divider, MethodTabs, Field, OAuthButton } from "./authHelpers";

type Method = "email" | "phone";
type Stage = "form" | "code";

export function SignUpPage() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/book";

  const [method, setMethod] = useState<Method>("email");
  const [stage, setStage] = useState<Stage>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [smsOpted, setSmsOpted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleOAuth(provider: "oauth_google" | "oauth_apple") {
    if (!isLoaded) return;
    setError("");
    try {
      await signUp.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/book",
      });
    } catch (err: unknown) {
      setError((err as { errors?: { message: string }[] })?.errors?.[0]?.message ?? "OAuth sign-up failed.");
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError(""); setLoading(true);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStage("code");
    } catch (err: unknown) {
      setError((err as { errors?: { message: string }[] })?.errors?.[0]?.message ?? "Sign up failed.");
    } finally { setLoading(false); }
  }

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError(""); setLoading(true);
    try {
      await signUp.create({ phoneNumber: phone });
      await signUp.preparePhoneNumberVerification({ strategy: "phone_code" });
      setStage("code");
    } catch (err: unknown) {
      setError((err as { errors?: { message: string }[] })?.errors?.[0]?.message ?? "Could not send code.");
    } finally { setLoading(false); }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError(""); setLoading(true);
    try {
      const result = method === "email"
        ? await signUp.attemptEmailAddressVerification({ code })
        : await signUp.attemptPhoneNumberVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        navigate(redirectTo);
      }
    } catch (err: unknown) {
      setError((err as { errors?: { message: string }[] })?.errors?.[0]?.message ?? "Invalid code.");
    } finally { setLoading(false); }
  }

  const identifier = method === "email" ? email : phone;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-seafoam-50 via-offwhite to-seafoam-100 px-4 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="mb-8 flex flex-col items-center text-center">
        <SweeprLogo size="md" />
        <h1 className="mt-4 text-2xl font-bold text-charcoal dark:text-white">
          {stage === "form" ? "Create your account" : `Verify your ${method}`}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {stage === "form" ? "Book your first clean in minutes" : `We sent a code to ${identifier}`}
        </p>
      </div>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        {stage === "form" ? (
          <>
            <div className="space-y-3">
              <OAuthButton provider="oauth_google" label="Continue with Google" onClick={() => void handleOAuth("oauth_google")} />
              <OAuthButton provider="oauth_apple" label="Continue with Apple" onClick={() => void handleOAuth("oauth_apple")} />
            </div>
            <Divider />
            <MethodTabs method={method} onChange={(m) => { setMethod(m); setError(""); }} />

            {method === "email" ? (
              <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-4">
                <Field label="Email">
                  <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    className={inputCls} placeholder="you@example.com" />
                </Field>
                <Field label="Password">
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={8}
                      value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} pr-11`} placeholder="Min. 8 characters" />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>
                {error && <ErrorBox message={error} />}
                <div id="clerk-captcha" />
                <SubmitButton loading={loading} disabled={!isLoaded} label="Create account" />
              </form>
            ) : (
              <form onSubmit={(e) => void handlePhoneSubmit(e)} className="space-y-4">
                <Field label="Phone number">
                  <input type="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
                    className={inputCls} placeholder="+1 (555) 000-0000" />
                </Field>
                {error && <ErrorBox message={error} />}
                <div id="clerk-captcha" />
                <SubmitButton loading={loading} disabled={!isLoaded} label="Send code" />
              </form>
            )}

            <div className="mt-4">
              <SMSOptIn value={smsOpted} onChange={setSmsOpted} />
            </div>

            <p className="mt-4 text-center text-sm text-slate-500">
              Already have an account?{" "}
              <Link to="/sign-in" className="font-medium text-seafoam-600 hover:underline dark:text-seafoam-400">Sign in</Link>
            </p>
          </>
        ) : (
          <form onSubmit={(e) => void handleVerify(e)} className="space-y-5">
            <p className="text-center text-sm text-slate-500">
              Code sent to <span className="font-medium text-charcoal dark:text-white">{identifier}</span>
            </p>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-2xl tracking-[0.5em] text-charcoal outline-none transition focus:border-seafoam-400 focus:ring-2 focus:ring-seafoam-400/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              placeholder="······" />
            {error && <ErrorBox message={error} />}
            <SubmitButton loading={loading} disabled={!isLoaded} label="Verify & create account" />
            <button type="button" onClick={() => { setStage("form"); setCode(""); setError(""); }}
              className="w-full text-center text-sm text-slate-500 hover:text-slate-700">← Back</button>
          </form>
        )}
      </div>
    </div>
  );
}
