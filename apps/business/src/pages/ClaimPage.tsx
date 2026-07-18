/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { useAppToken } from "@/lib/appToken";
import { KeyRound, CheckCircle2 } from "lucide-react";
import { Button, LoadingState, ErrorState } from "@sweepr/ui";
import { AuthLayout } from "../components/AuthLayout";
import { apiFetch } from "../lib/api";

type ClaimStatus = "idle" | "claiming" | "done" | "error";

/**
 * Workspace claim/transition landing page. Users arrive from an emailed link
 * (/claim?token=…); once signed in we complete the transition and route to
 * the dashboard.
 */
export function ClaimPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useAuth();
  const { getToken } = useAppToken();
  const [status, setStatus] = useState<ClaimStatus>("idle");
  const [error, setError] = useState("");
  const started = useRef(false);

  const claim = useCallback(async () => {
    setStatus("claiming");
    setError("");
    const res = await apiFetch<unknown>(getToken, "/business/transitions/complete", {
      method: "POST",
      json: { token },
    });
    if (res.ok) {
      setStatus("done");
      setTimeout(() => navigate("/dashboard", { replace: true }), 1200);
    } else {
      setStatus("error");
      setError(
        res.error ??
          "This link may have expired or already been used. Ask your workspace admin to send a new one."
      );
    }
  }, [getToken, navigate, token]);

  // Auto-claim once auth has loaded and the user is signed in.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !token || started.current) return;
    started.current = true;
    void claim();
  }, [isLoaded, isSignedIn, token, claim]);

  if (!token) {
    return (
      <AuthLayout title="Invalid link" subtitle="This claim link is missing its token.">
        <ErrorState
          title="Nothing to claim"
          description="Please use the link from your email, or ask your workspace admin to send a new one."
          action={<Link to="/dashboard" className="text-sm font-medium text-platinum-700 hover:underline dark:text-platinum-400">Go to dashboard</Link>}
        />
      </AuthLayout>
    );
  }

  if (!isLoaded) {
    return (
      <AuthLayout title="Claim your workspace" subtitle="One moment…">
        <div className="w-full max-w-sm"><LoadingState rows={2} /></div>
      </AuthLayout>
    );
  }

  if (!isSignedIn) {
    return (
      <AuthLayout
        title="Claim your workspace"
        subtitle="Sign in (or create an account) to finish setting up your Sweepr Business workspace."
      >
        <div className="flex w-full max-w-sm flex-col gap-3">
          <Link to={`/sign-in?redirect_url=${encodeURIComponent(`/claim?token=${token}`)}`}>
            <Button fullWidth>
              <KeyRound className="h-4 w-4" />
              Sign in to continue
            </Button>
          </Link>
          <Link to={`/sign-up?redirect_url=${encodeURIComponent(`/claim?token=${token}`)}`}>
            <Button fullWidth variant="secondary">Create an account</Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Claim your workspace" subtitle="Finishing setup…">
      <div className="w-full max-w-sm">
        {status === "claiming" && <LoadingState rows={2} />}
        {status === "done" && (
          <div className="flex flex-col items-center rounded-2xl border border-platinum-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <CheckCircle2 className="h-10 w-10 text-platinum-600" />
            <p className="mt-3 font-semibold text-charcoal dark:text-white">Workspace claimed</p>
            <p className="mt-1 text-sm text-slate-500">Taking you to your dashboard…</p>
          </div>
        )}
        {status === "error" && (
          <ErrorState
            title="Couldn't complete the claim"
            description={error}
            action={<Button variant="secondary" onClick={() => void claim()}>Try again</Button>}
          />
        )}
      </div>
    </AuthLayout>
  );
}
