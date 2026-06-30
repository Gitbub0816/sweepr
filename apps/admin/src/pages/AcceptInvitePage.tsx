import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useSignIn, useSignUp, useAuth } from "@clerk/clerk-react";
import { Loader2, ArrowRight } from "lucide-react";
import { SweeprLogo } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

type Stage = "loading" | "invalid" | "send_code" | "enter_code" | "accepting" | "done" | "error";

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const [stage, setStage] = useState<Stage>("loading");
  const [inviteEmail, setInviteEmail] = useState("");
  const [code, setCode] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Track whether we're doing a sign-up or sign-in flow
  const [flow, setFlow] = useState<"sign-up" | "sign-in" | null>(null);

  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();
  const { isSignedIn, getToken } = useAuth();

  // Step 1 — verify token
  useEffect(() => {
    if (!token) { setStage("invalid"); return; }
    fetch(`${API}/admin/invites/verify?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d: { valid: boolean; email?: string; error?: string }) => {
        if (!d.valid) { setErrMsg(d.error ?? "Invalid or expired invite link."); setStage("invalid"); return; }
        setInviteEmail(d.email ?? "");
        setStage(isSignedIn ? "accepting" : "send_code");
      })
      .catch(() => { setErrMsg("Network error verifying invite."); setStage("invalid"); });
  }, [token, isSignedIn]);

  // Step 3 — accept once signed in
  useEffect(() => {
    if (stage !== "accepting") return;
    (async () => {
      try {
        const bearer = await getToken();
        const resp = await fetch(`${API}/admin/invites/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
          body: JSON.stringify({ token }),
        });
        if (resp.ok) {
          setStage("done");
          setTimeout(() => navigate("/"), 2000);
        } else {
          const d = await resp.json() as { error?: string };
          setErrMsg(d.error ?? "Failed to activate your admin account.");
          setStage("error");
        }
      } catch {
        setErrMsg("Network error while activating account.");
        setStage("error");
      }
    })();
  }, [stage, token, getToken, navigate]);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!signInLoaded || !signUpLoaded) return;
    setLoading(true);
    setErrMsg("");

    // Try sign-in first (existing Clerk account). If the account doesn't exist
    // yet, Clerk returns a "couldn't find your account" error and we fall through
    // to sign-up, which is the right path for a brand-new invited admin.
    try {
      await signIn!.create({ identifier: inviteEmail });
      const emailFactor = signIn!.supportedFirstFactors?.find((f) => f.strategy === "email_code");
      if (emailFactor) {
        await signIn!.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: (emailFactor as { emailAddressId: string }).emailAddressId,
        });
        setFlow("sign-in");
        setStage("enter_code");
        setLoading(false);
        return;
      }
    } catch {
      // Account doesn't exist yet — fall through to sign-up.
    }

    try {
      const su = await signUp!.create({ emailAddress: inviteEmail });
      if (su.status === "missing_requirements") {
        await signUp!.prepareEmailAddressVerification({ strategy: "email_code" });
        setFlow("sign-up");
        setStage("enter_code");
      } else if (su.status === "complete") {
        await setSignUpActive!({ session: su.createdSessionId });
        setStage("accepting");
      }
    } catch (err: unknown) {
      setErrMsg(
        (err as { errors?: { message: string }[] })?.errors?.[0]?.message ??
          "Could not send code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrMsg("");
    try {
      if (flow === "sign-up") {
        const res = await signUp!.attemptEmailAddressVerification({ code });
        if (res.status === "complete") {
          await setSignUpActive!({ session: res.createdSessionId });
          setStage("accepting");
        }
      } else {
        const res = await signIn!.attemptFirstFactor({ strategy: "email_code", code });
        if (res.status === "complete") {
          await setSignInActive!({ session: res.createdSessionId });
          setStage("accepting");
        }
      }
    } catch (err: unknown) {
      setErrMsg(
        (err as { errors?: { message: string }[] })?.errors?.[0]?.message ??
          "Invalid code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-seafoam-50 via-offwhite to-seafoam-100 px-4 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mb-8 flex flex-col items-center text-center">
        <SweeprLogo size="md" />
        <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-seafoam-600 dark:text-seafoam-400">Ops Console</p>
        <h1 className="mt-4 text-2xl font-bold text-charcoal dark:text-white">
          {stage === "enter_code" ? "Check your email" : "Admin Invitation"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {stage === "enter_code"
            ? `We sent a 6-digit code to ${inviteEmail}`
            : stage === "send_code"
              ? "You've been invited to join as an admin"
              : ""}
        </p>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        {stage === "loading" && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-seafoam-500" />
          </div>
        )}

        {stage === "invalid" && (
          <div className="py-4 text-center">
            <p className="font-semibold text-red-600 dark:text-red-400">Invite invalid or expired</p>
            {errMsg && <p className="mt-1 text-sm text-slate-500">{errMsg}</p>}
          </div>
        )}

        {stage === "send_code" && (
          <form onSubmit={(e) => void sendCode(e)} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-white">Email address</label>
              <input
                type="email"
                value={inviteEmail}
                readOnly
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
              />
            </div>
            {/* Required by Clerk bot-protection for custom sign-up flows */}
            <div id="clerk-captcha" />
            {errMsg && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{errMsg}</p>
            )}
            <button
              type="submit"
              disabled={loading || !signInLoaded || !signUpLoaded}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-seafoam-500 py-3 text-sm font-semibold text-white shadow-md shadow-seafoam-500/30 transition hover:bg-seafoam-600 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {loading ? "Sending…" : "Send sign-in code"}
            </button>
          </form>
        )}

        {stage === "enter_code" && (
          <form onSubmit={(e) => void verifyCode(e)} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-2xl tracking-[0.5em] text-charcoal outline-none transition focus:border-seafoam-400 focus:ring-2 focus:ring-seafoam-400/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              placeholder="······"
            />
            {errMsg && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{errMsg}</p>
            )}
            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-seafoam-500 py-3 text-sm font-semibold text-white shadow-md shadow-seafoam-500/30 transition hover:bg-seafoam-600 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Verifying…" : "Activate account"}
            </button>
            <button
              type="button"
              onClick={() => { setStage("send_code"); setCode(""); setErrMsg(""); }}
              className="w-full text-center text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              ← Resend code
            </button>
          </form>
        )}

        {stage === "accepting" && (
          <div className="flex items-center justify-center gap-3 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-seafoam-500" />
            <p className="text-sm text-slate-500">Activating your admin account…</p>
          </div>
        )}

        {stage === "done" && (
          <div className="py-4 text-center">
            <p className="text-lg font-semibold text-seafoam-700 dark:text-seafoam-300">You're in!</p>
            <p className="mt-1 text-sm text-slate-500">Redirecting to the dashboard…</p>
          </div>
        )}

        {stage === "error" && (
          <div className="py-4 text-center">
            <p className="font-semibold text-red-600 dark:text-red-400">Something went wrong</p>
            <p className="mt-1 text-sm text-slate-500">{errMsg}</p>
          </div>
        )}
      </div>
    </div>
  );
}
