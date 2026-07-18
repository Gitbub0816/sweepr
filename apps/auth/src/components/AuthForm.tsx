/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useRef, useState } from "react";
import { useSignIn, useSignUp, useClerk } from "@clerk/clerk-react";
import { Loader2 } from "lucide-react";
import {
  AUTH_ERROR_COPY,
  BackButton,
  clerkErrorCode,
  Divider,
  ErrorBox,
  Field,
  friendlyAuthError,
  inputCls,
  OAuthButton,
  OtpInput,
  PasswordField,
  SegmentedControl,
  SubmitButton,
  TextLinkButton,
} from "./authHelpers";
import type { TransactionContext } from "../broker";

type View = "signIn" | "signUp" | "reset";
type Stage = "form" | "code" | "second_factor";
type CodeKind = "email_code" | "signup" | "reset";
type SecondStrategy = "totp" | "phone_code";

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

/** The Sweepr-native headless auth form. Owns the view/stage machine and every
 * Clerk call; on any successful setActive it hands control back to the parent
 * ceremony with a full-page load to authedUrl (?authed=1) — never a SPA nav. */
export function AuthForm({
  context,
  ssoCallbackUrl,
  authedUrl,
}: {
  context: TransactionContext;
  ssoCallbackUrl: string;
  authedUrl: string;
}) {
  const { signIn, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();
  const clerk = useClerk();
  const ready = signInLoaded && signUpLoaded;

  const [view, setView] = useState<View>("signIn");
  const [stage, setStage] = useState<Stage>("form");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");

  const [codeKind, setCodeKind] = useState<CodeKind>("email_code");
  const [secondStrategy, setSecondStrategy] = useState<SecondStrategy>("totp");

  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [otpError, setOtpError] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const emailFactorId = useRef<string | null>(null);

  const clearMessages = () => {
    setError("");
    setErrorCode(undefined);
    setOtpError(false);
    setNotice("");
  };

  const applyError = (err: unknown, opts?: { code?: boolean }) => {
    setErrorCode(clerkErrorCode(err));
    setError(friendlyAuthError(err));
    if (opts?.code) {
      setOtpError(true);
      setCode("");
    }
  };

  const goto = (nextView: View, nextStage: Stage) => {
    clearMessages();
    setCode("");
    setView(nextView);
    setStage(nextStage);
  };

  const startResendCooldown = () => {
    setResendIn(30);
    const id = setInterval(() => {
      setResendIn((s) => {
        if (s <= 1) {
          clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  // On any completed authentication, hand back to the ceremony: setActive then
  // a full-page load to authedUrl so the parent's ?authed=1 completion effect
  // runs against a still-pending transaction. Never a react-router navigate.
  const finish = async (sessionId: string | null | undefined) => {
    if (!sessionId) {
      setError(AUTH_ERROR_COPY.fallback);
      return;
    }
    setRedirecting(true);
    try {
      await clerk.setActive({ session: sessionId });
    } catch {
      /* Session is already active in-SPA; the reload re-reads it. */
    }
    window.location.assign(authedUrl);
  };

  async function handleOAuth(provider: "oauth_google" | "oauth_apple") {
    if (!ready) return;
    clearMessages();
    try {
      const opts = { strategy: provider, redirectUrl: ssoCallbackUrl, redirectUrlComplete: authedUrl } as const;
      if (view === "signUp") {
        await signUp.authenticateWithRedirect(opts);
      } else {
        await signIn.authenticateWithRedirect(opts);
      }
    } catch (err) {
      applyError(err);
    }
  }

  async function prepareSecondFactor(res: Awaited<ReturnType<NonNullable<typeof signIn>["create"]>>) {
    const factors = res.supportedSecondFactors ?? [];
    if (factors.some((f) => f.strategy === "totp")) {
      setSecondStrategy("totp");
      setCode("");
      setStage("second_factor");
      return;
    }
    const phone = factors.find((f) => f.strategy === "phone_code") as { phoneNumberId?: string } | undefined;
    if (phone && signIn) {
      await signIn.prepareSecondFactor({ strategy: "phone_code", phoneNumberId: phone.phoneNumberId });
      setSecondStrategy("phone_code");
      setCode("");
      setStage("second_factor");
      return;
    }
    setError("Two-step verification is required, but no method is available. Contact support.");
  }

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    clearMessages();
    setLoading(true);
    try {
      const res = await signIn.create({ identifier: email, password });
      if (res.status === "complete") {
        await finish(res.createdSessionId);
        return;
      }
      if (res.status === "needs_second_factor") {
        await prepareSecondFactor(res);
        return;
      }
      setError(AUTH_ERROR_COPY.fallback);
    } catch (err) {
      applyError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailCodeStart() {
    if (!signIn) return;
    if (!isValidEmail(email)) {
      setError("Enter your email address first.");
      return;
    }
    clearMessages();
    setLoading(true);
    try {
      const res = await signIn.create({ identifier: email });
      const factor = (res.supportedFirstFactors ?? []).find((f) => f.strategy === "email_code") as
        | { emailAddressId?: string }
        | undefined;
      if (!factor?.emailAddressId) {
        setError("Email codes aren't available for this account. Use your password instead.");
        return;
      }
      emailFactorId.current = factor.emailAddressId;
      await signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId: factor.emailAddressId });
      setCodeKind("email_code");
      setCode("");
      setStage("code");
      startResendCooldown();
    } catch (err) {
      applyError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!signUp) return;
    clearMessages();
    setLoading(true);
    try {
      await signUp.create({ emailAddress: email, password, firstName, lastName });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setCodeKind("signup");
      setCode("");
      setStage("code");
      startResendCooldown();
    } catch (err) {
      applyError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotStart(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    clearMessages();
    setLoading(true);
    try {
      await signIn.create({ strategy: "reset_password_email_code", identifier: email });
      setCodeKind("reset");
      setNewPassword("");
      setCode("");
      setStage("code");
      startResendCooldown();
    } catch (err) {
      applyError(err);
    } finally {
      setLoading(false);
    }
  }

  async function verifyEmailCode(submitCode: string) {
    if (!signIn) return;
    clearMessages();
    setLoading(true);
    try {
      const res = await signIn.attemptFirstFactor({ strategy: "email_code", code: submitCode });
      if (res.status === "complete") {
        await finish(res.createdSessionId);
        return;
      }
      if (res.status === "needs_second_factor") {
        await prepareSecondFactor(res);
        return;
      }
      applyError({ errors: [{ code: "form_code_incorrect" }] }, { code: true });
    } catch (err) {
      applyError(err, { code: true });
    } finally {
      setLoading(false);
    }
  }

  async function verifySignupCode(submitCode: string) {
    if (!signUp) return;
    clearMessages();
    setLoading(true);
    try {
      let res = await signUp.attemptEmailAddressVerification({ code: submitCode });
      if (res.status !== "complete") {
        // The code verified but the instance still wants profile fields. Fill
        // whatever we already collected, then re-check — never hang the screen.
        const missing = res.missingFields ?? [];
        const patch: { firstName?: string; lastName?: string } = {};
        if (missing.includes("first_name") && firstName) patch.firstName = firstName;
        if (missing.includes("last_name") && lastName) patch.lastName = lastName;
        if (Object.keys(patch).length > 0) res = await signUp.update(patch);
      }
      if (res.status === "complete") {
        await finish(res.createdSessionId);
        return;
      }
      setError("We need a little more information to finish. Please contact support.");
    } catch (err) {
      applyError(err, { code: true });
    } finally {
      setLoading(false);
    }
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    if (newPassword.length < 8) {
      setError("Choose a password of at least 8 characters.");
      return;
    }
    if (code.length !== 6) {
      setError("Enter the 6-digit code we sent you.");
      return;
    }
    clearMessages();
    setLoading(true);
    try {
      const res = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password: newPassword,
      });
      if (res.status === "complete") {
        await finish(res.createdSessionId);
        return;
      }
      if (res.status === "needs_new_password") {
        const done = await signIn.resetPassword({ password: newPassword });
        if (done.status === "complete") {
          await finish(done.createdSessionId);
          return;
        }
      }
      if (res.status === "needs_second_factor") {
        await prepareSecondFactor(res);
        return;
      }
      applyError({ errors: [{ code: "form_code_incorrect" }] }, { code: true });
    } catch (err) {
      applyError(err, { code: true });
    } finally {
      setLoading(false);
    }
  }

  async function verifySecondFactor(submitCode: string) {
    if (!signIn) return;
    clearMessages();
    setLoading(true);
    try {
      const res = await signIn.attemptSecondFactor(
        secondStrategy === "totp"
          ? { strategy: "totp", code: submitCode }
          : { strategy: "phone_code", code: submitCode }
      );
      if (res.status === "complete") {
        await finish(res.createdSessionId);
        return;
      }
      applyError({ errors: [{ code: "form_code_incorrect" }] }, { code: true });
    } catch (err) {
      applyError(err, { code: true });
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendIn > 0 || loading) return;
    clearMessages();
    try {
      if (codeKind === "signup" && signUp) {
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      } else if (codeKind === "reset" && signIn) {
        await signIn.create({ strategy: "reset_password_email_code", identifier: email });
      } else if (signIn) {
        if (emailFactorId.current) {
          await signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId: emailFactorId.current });
        } else {
          await handleEmailCodeStart();
          return;
        }
      }
      setNotice("A new code is on its way.");
      startResendCooldown();
    } catch (err) {
      applyError(err);
    }
  }

  if (redirecting) {
    return (
      <div className="mt-6 flex flex-col items-center py-10 text-slate-600 dark:text-slate-300">
        <Loader2 className="h-6 w-6 animate-spin text-seafoam-700 dark:text-seafoam-400" />
        <span className="mt-3 text-sm">Signing you in to {context.display_name}…</span>
      </div>
    );
  }

  // Focused sub-view for code entry (email code, sign-up verification, 2FA).
  const isCodeView = stage === "code" || stage === "second_factor";
  const stepKey = `${view}:${stage}:${codeKind}:${secondStrategy}`;

  return (
    <div className="auth-enter mt-6">
      <div key={stepKey} className="auth-step-in">
        {stage === "form" && (view === "signIn" || view === "signUp") && (
          <>
            <div className="auth-stagger space-y-5">
              <div className="space-y-2.5">
                <OAuthButton
                  provider="oauth_google"
                  label="Continue with Google"
                  disabled={!ready}
                  onClick={() => void handleOAuth("oauth_google")}
                />
                <OAuthButton
                  provider="oauth_apple"
                  label="Continue with Apple"
                  disabled={!ready}
                  onClick={() => void handleOAuth("oauth_apple")}
                />
              </div>

              <Divider label="or" />

              <SegmentedControl<View>
                value={view}
                onChange={(v) => goto(v, "form")}
                options={[
                  { value: "signIn", label: "Sign in" },
                  { value: "signUp", label: "Create account" },
                ]}
              />

              {view === "signIn" ? (
                <form onSubmit={handlePasswordSignIn} className="space-y-4">
                  <Field label="Email">
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearMessages();
                      }}
                      className={inputCls}
                      placeholder="you@example.com"
                    />
                  </Field>
                  <PasswordField
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    autoComplete="current-password"
                    placeholder="Your password"
                  />
                  {error && (
                    <ErrorBox
                      message={error}
                      action={
                        errorCode === "form_identifier_not_found" ? (
                          <TextLinkButton onClick={() => goto("signUp", "form")}>Create an account</TextLinkButton>
                        ) : undefined
                      }
                    />
                  )}
                  <SubmitButton loading={loading} disabled={!ready} label="Sign in" />
                  <div className="flex items-center justify-between text-sm">
                    <TextLinkButton onClick={() => void handleEmailCodeStart()}>Email me a code</TextLinkButton>
                    <TextLinkButton onClick={() => goto("reset", "form")}>Forgot password?</TextLinkButton>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First name">
                      <input
                        type="text"
                        autoComplete="given-name"
                        required
                        value={firstName}
                        onChange={(e) => {
                          setFirstName(e.target.value);
                          clearMessages();
                        }}
                        className={inputCls}
                        placeholder="Jane"
                      />
                    </Field>
                    <Field label="Last name">
                      <input
                        type="text"
                        autoComplete="family-name"
                        required
                        value={lastName}
                        onChange={(e) => {
                          setLastName(e.target.value);
                          clearMessages();
                        }}
                        className={inputCls}
                        placeholder="Doe"
                      />
                    </Field>
                  </div>
                  <Field label="Email">
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearMessages();
                      }}
                      className={inputCls}
                      placeholder="you@example.com"
                    />
                  </Field>
                  <PasswordField
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    autoComplete="new-password"
                    placeholder="Min. 8 characters"
                    minLength={8}
                  />
                  {error && (
                    <ErrorBox
                      message={error}
                      action={
                        errorCode === "form_identifier_exists" ? (
                          <TextLinkButton onClick={() => goto("signIn", "form")}>Sign in instead</TextLinkButton>
                        ) : undefined
                      }
                    />
                  )}
                  <SubmitButton loading={loading} disabled={!ready} label="Create account" />
                </form>
              )}
            </div>

            {/* Clerk Smart CAPTCHA renders here for bot protection. */}
            <div id="clerk-captcha" className="mt-4 empty:hidden" />
          </>
        )}

        {view === "reset" && stage === "form" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-charcoal dark:text-white">Reset your password</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Enter your email and we'll send a code to set a new password.
              </p>
            </div>
            <form onSubmit={handleForgotStart} className="space-y-4">
              <Field label="Email">
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearMessages();
                  }}
                  className={inputCls}
                  placeholder="you@example.com"
                />
              </Field>
              {error && <ErrorBox message={error} />}
              <SubmitButton loading={loading} disabled={!ready} label="Send reset code" />
            </form>
            <BackButton label="Back to sign in" onClick={() => goto("signIn", "form")} />
          </div>
        )}

        {isCodeView && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-charcoal dark:text-white">
                {stage === "second_factor"
                  ? "Two-step verification"
                  : view === "reset"
                    ? "Reset your password"
                    : "Check your email"}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {stage === "second_factor"
                  ? secondStrategy === "totp"
                    ? "Enter the 6-digit code from your authenticator app."
                    : "Enter the code we texted to your phone."
                  : view === "reset"
                    ? "Enter the code we emailed you, then choose a new password."
                    : "We sent a 6-digit code to "}
                {stage === "code" && view !== "reset" && (
                  <span className="font-medium text-charcoal dark:text-white">{email}</span>
                )}
                {stage === "code" && view !== "reset" ? "." : ""}
              </p>
            </div>

            {view === "reset" ? (
              <form onSubmit={handleResetSubmit} className="space-y-4">
                <OtpInput
                  value={code}
                  onChange={(v) => {
                    setCode(v);
                    setOtpError(false);
                    setError("");
                  }}
                  onComplete={() => {
                    /* Reset also needs the new password, so submit is explicit. */
                  }}
                  error={otpError}
                  autoFocus
                  disabled={loading}
                />
                <PasswordField
                  label="New password"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  minLength={8}
                />
                {error && <ErrorBox message={error} />}
                <SubmitButton loading={loading} disabled={!ready} label="Reset password" />
              </form>
            ) : (
              <div className="space-y-4">
                <OtpInput
                  value={code}
                  onChange={(v) => {
                    setCode(v);
                    setOtpError(false);
                    setError("");
                  }}
                  onComplete={(v) => {
                    if (loading) return;
                    if (stage === "second_factor") void verifySecondFactor(v);
                    else if (codeKind === "signup") void verifySignupCode(v);
                    else void verifyEmailCode(v);
                  }}
                  error={otpError}
                  autoFocus
                  disabled={loading}
                />
                {error && <ErrorBox message={error} />}
                <button
                  type="button"
                  disabled={loading || code.length !== 6}
                  onClick={() => {
                    if (stage === "second_factor") void verifySecondFactor(code);
                    else if (codeKind === "signup") void verifySignupCode(code);
                    else void verifyEmailCode(code);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-seafoam-700 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-seafoam-900/25 transition-[transform,background-color] duration-150 ease-out hover:bg-seafoam-800 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Verify
                </button>
              </div>
            )}

            {notice && <p className="text-sm text-seafoam-700 dark:text-seafoam-400">{notice}</p>}

            <div className="flex items-center justify-between">
              <BackButton
                label="Back"
                onClick={() => {
                  if (stage === "second_factor") goto("signIn", "form");
                  else if (view === "reset") goto("reset", "form");
                  else goto(view, "form");
                }}
              />
              {stage === "code" && (
                <button
                  type="button"
                  onClick={() => void handleResend()}
                  disabled={resendIn > 0 || loading}
                  className="text-sm font-medium text-seafoam-700 transition-colors hover:text-seafoam-800 disabled:text-slate-400 disabled:hover:text-slate-400 dark:text-seafoam-400 dark:disabled:text-slate-500"
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
