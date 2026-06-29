import { useState, useEffect } from "react";
import { useSignUp } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { SweeprLogo, ThemeToggle } from "@sweepr/ui";
import { inputCls, ErrorBox, SubmitButton, Field } from "./authHelpers";

type Stage = "fields" | "verify_phone";

export function ContinueSignUp() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>("fields");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect away if there's nothing to continue (no pending sign-up)
  useEffect(() => {
    if (!isLoaded) return;
    if (!signUp || signUp.status === "complete") {
      navigate("/", { replace: true });
    }
  }, [isLoaded, signUp, navigate]);

  if (!isLoaded || !signUp) return null;

  const missing = signUp.missingFields ?? [];
  const needsUsername = missing.includes("username");
  const needsPhone = missing.includes("phone_number");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    setError(""); setLoading(true);
    try {
      await signUp.update({
        ...(needsUsername ? { username } : {}),
        ...(needsPhone ? { phoneNumber: phone } : {}),
      });

      if (needsPhone) {
        await signUp.preparePhoneNumberVerification({ strategy: "phone_code" });
        setStage("verify_phone");
      } else if (signUp.status === "complete") {
        await setActive({ session: signUp.createdSessionId });
        navigate("/", { replace: true });
      }
    } catch (err: unknown) {
      setError((err as { errors?: { message: string }[] })?.errors?.[0]?.message ?? "Could not update profile.");
    } finally { setLoading(false); }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    setError(""); setLoading(true);
    try {
      const result = await signUp.attemptPhoneNumberVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        navigate("/", { replace: true });
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
        <h1 className="mt-4 text-2xl font-bold text-charcoal dark:text-white">
          {stage === "fields" ? "Almost there" : "Verify your phone"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {stage === "fields"
            ? "Fill in the remaining details to finish creating your account"
            : `We sent a code to ${phone}`}
        </p>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        {stage === "fields" ? (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {needsUsername && (
              <Field label="Username">
                <input
                  type="text" autoComplete="username" required
                  value={username} onChange={(e) => setUsername(e.target.value)}
                  className={inputCls} placeholder="Choose a username"
                />
              </Field>
            )}
            {needsPhone && (
              <Field label="Phone number">
                <input
                  type="tel" autoComplete="tel" required
                  value={phone} onChange={(e) => setPhone(e.target.value)}
                  className={inputCls} placeholder="+1 (555) 000-0000"
                />
              </Field>
            )}
            {error && <ErrorBox message={error} />}
            <SubmitButton loading={loading} disabled={!isLoaded} label="Continue" />
          </form>
        ) : (
          <form onSubmit={(e) => void handleVerify(e)} className="space-y-5">
            <p className="text-center text-sm text-slate-500">
              Code sent to <span className="font-medium text-charcoal dark:text-white">{phone}</span>
            </p>
            <input
              type="text" inputMode="numeric" autoComplete="one-time-code"
              required maxLength={6} value={code} onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-2xl tracking-[0.5em] text-charcoal outline-none transition focus:border-seafoam-400 focus:ring-2 focus:ring-seafoam-400/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              placeholder="······"
            />
            {error && <ErrorBox message={error} />}
            <SubmitButton loading={loading} disabled={!isLoaded} label="Verify & finish" />
            <button type="button" onClick={() => { setStage("fields"); setCode(""); setError(""); }}
              className="w-full text-center text-sm text-slate-500 hover:text-slate-700">← Back</button>
          </form>
        )}
      </div>
    </div>
  );
}
