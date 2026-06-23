import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useSignIn, useSignUp, useAuth } from "@clerk/clerk-react";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

type Stage = "loading" | "invalid" | "auth" | "accepting" | "done" | "error";

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const [stage, setStage] = useState<Stage>("loading");
  const [inviteEmail, setInviteEmail] = useState("");
  const [errMsg, setErrMsg] = useState("");

  // Auth form state
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [password, setPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);

  const { signIn, setActive: setSignInActive } = useSignIn();
  const { signUp, setActive: setSignUpActive } = useSignUp();
  const { isSignedIn, getToken } = useAuth();

  // Step 1 — verify token
  useEffect(() => {
    if (!token) { setStage("invalid"); return; }
    fetch(`${API}/admin/invites/verify?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d: { valid: boolean; email?: string; error?: string }) => {
        if (!d.valid) { setErrMsg(d.error ?? "Invalid token"); setStage("invalid"); return; }
        setInviteEmail(d.email ?? "");
        if (isSignedIn) {
          setStage("accepting");
        } else {
          setStage("auth");
        }
      })
      .catch(() => { setErrMsg("Network error"); setStage("invalid"); });
  }, [token, isSignedIn]);

  // Step 3 — accept once signed in
  useEffect(() => {
    if (stage !== "accepting") return;
    (async () => {
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
        setErrMsg(d.error ?? "Failed to accept invite");
        setStage("error");
      }
    })();
  }, [stage, token, getToken, navigate]);

  // Auth submit
  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (mode === "sign-up" && signUp) {
        const res = await signUp.create({ emailAddress: inviteEmail, password });
        if (res.status === "missing_requirements") {
          await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
          setNeedsCode(true);
          return;
        }
        if (res.status === "complete") {
          await setSignUpActive!({ session: res.createdSessionId });
          setStage("accepting");
        }
      } else if (mode === "sign-in" && signIn) {
        const res = await signIn.create({ identifier: inviteEmail, password });
        if (res.status === "complete") {
          await setSignInActive!({ session: res.createdSessionId });
          setStage("accepting");
        }
      }
    } catch (err: unknown) {
      setErrMsg((err as { errors?: Array<{ message: string }> })?.errors?.[0]?.message ?? "Auth failed");
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await signUp!.attemptEmailAddressVerification({ code: verifyCode });
      if (res.status === "complete") {
        await setSignUpActive!({ session: res.createdSessionId });
        setStage("accepting");
      }
    } catch (err: unknown) {
      setErrMsg((err as { errors?: Array<{ message: string }> })?.errors?.[0]?.message ?? "Invalid code");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Sweepr Admin</h1>

        {stage === "loading" && (
          <p className="text-gray-500 mt-4">Verifying your invitation…</p>
        )}

        {stage === "invalid" && (
          <div className="mt-4">
            <p className="text-red-600 font-medium">This invite link is invalid or has expired.</p>
            {errMsg && <p className="text-sm text-gray-500 mt-1">{errMsg}</p>}
          </div>
        )}

        {stage === "auth" && (
          <>
            <p className="text-gray-500 mb-6">
              You've been invited to join as an admin.{" "}
              {mode === "sign-up" ? "Create your account" : "Sign in"} to continue.
            </p>

            {errMsg && (
              <p className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errMsg}</p>
            )}

            {!needsCode ? (
              <form onSubmit={handleAuth} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    readOnly
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-50 text-gray-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-teal-600 text-white rounded-lg py-2 font-medium hover:bg-teal-700 transition"
                >
                  {mode === "sign-up" ? "Create account" : "Sign in"}
                </button>
                <p className="text-center text-sm text-gray-500">
                  {mode === "sign-up" ? "Already have an account?" : "Don't have an account?"}{" "}
                  <button
                    type="button"
                    className="text-teal-600 hover:underline"
                    onClick={() => { setMode(mode === "sign-up" ? "sign-in" : "sign-up"); setErrMsg(""); }}
                  >
                    {mode === "sign-up" ? "Sign in" : "Create one"}
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <p className="text-sm text-gray-600">
                  We sent a verification code to <strong>{inviteEmail}</strong>. Enter it below.
                </p>
                <input
                  type="text"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder="6-digit code"
                  maxLength={6}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button
                  type="submit"
                  className="w-full bg-teal-600 text-white rounded-lg py-2 font-medium hover:bg-teal-700 transition"
                >
                  Verify
                </button>
              </form>
            )}
          </>
        )}

        {stage === "accepting" && (
          <p className="text-gray-500 mt-4">Activating your admin account…</p>
        )}

        {stage === "done" && (
          <div className="mt-4 text-center">
            <p className="text-teal-700 font-semibold text-lg">You're in!</p>
            <p className="text-gray-500 text-sm mt-1">Redirecting to the dashboard…</p>
          </div>
        )}

        {stage === "error" && (
          <div className="mt-4">
            <p className="text-red-600 font-medium">Something went wrong.</p>
            <p className="text-sm text-gray-500 mt-1">{errMsg}</p>
          </div>
        )}
      </div>
    </div>
  );
}
