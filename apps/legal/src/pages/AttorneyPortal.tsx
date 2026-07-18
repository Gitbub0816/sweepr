/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * External reviewing-attorney portal (legal.getsweepr.com/attorney). Outside
 * counsel signs in with a single-use magic link emailed to them, then views,
 * edits, and approves the archived legal document snapshots. Isolated from the
 * staff admin app — this is one reviewer, not a platform operator.
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Input, Textarea } from "@sweepr/ui";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api.getsweepr.com";
const SESSION_KEY = "sweepr_attorney_session";

interface Attorney {
  id: string;
  email: string;
  fullName: string;
  barNumber: string | null;
  barState: string | null;
  firmName: string | null;
  title: string | null;
}

interface DocRow {
  slug: string;
  version: string;
  title: string;
  category: string;
  attorney_approved_at: string | null;
  attorney_name: string | null;
  edited_html_at: string | null;
}

function getSession(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function AttorneyPortal() {
  const path = window.location.pathname;
  const [session, setSession] = useState<string | null>(getSession());
  const [attorney, setAttorney] = useState<Attorney | null>(null);
  const [checking, setChecking] = useState(true);

  // Handle /attorney/verify?token=... — exchange for a session.
  useEffect(() => {
    if (path === "/attorney/verify") {
      const token = new URLSearchParams(window.location.search).get("token");
      if (token) {
        fetch(`${API_URL}/legal-attorney/verify?token=${encodeURIComponent(token)}`)
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((d: { session: string }) => {
            localStorage.setItem(SESSION_KEY, d.session);
            window.history.replaceState({}, "", "/attorney");
            setSession(d.session);
          })
          .catch(() => {
            window.history.replaceState({}, "", "/attorney");
            setSession(null);
          });
      }
    }
  }, [path]);

  // Resolve current session -> attorney profile.
  useEffect(() => {
    if (!session) {
      setChecking(false);
      return;
    }
    fetch(`${API_URL}/legal-attorney/me`, { headers: { Authorization: `Bearer ${session}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { attorney: Attorney }) => setAttorney(d.attorney))
      .catch(() => {
        localStorage.removeItem(SESSION_KEY);
        setSession(null);
        setAttorney(null);
      })
      .finally(() => setChecking(false));
  }, [session]);

  const signOut = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setAttorney(null);
  };

  if (checking) return <Centered>Loading…</Centered>;
  if (!attorney) return <LoginView />;
  return <PortalView attorney={attorney} session={session!} onSignOut={signOut} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen justify-center bg-slate-50 px-5 py-12">
      <Card className="h-fit w-full max-w-[480px] p-7">{children}</Card>
    </div>
  );
}

function LoginView() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const request = async () => {
    setBusy(true);
    try {
      await fetch(`${API_URL}/legal-attorney/request-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Centered>
      <h1 className="mb-2 text-xl font-bold text-charcoal">Legal Review Portal</h1>
      <p className="mb-4 text-sm leading-relaxed text-slate-500">
        Sign in to view, edit, and approve Sweepr legal documents. Enter your registered email
        and we'll send you a secure single-use link.
      </p>
      {sent ? (
        <p className="text-sm text-seafoam-700">
          If that email is registered, a sign-in link is on its way. It expires in 30 minutes.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <Input
            type="email"
            placeholder="you@lawfirm.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button fullWidth disabled={busy || !email} loading={busy} onClick={request}>
            {busy ? "Sending…" : "Send sign-in link"}
          </Button>
        </div>
      )}
    </Centered>
  );
}

function PortalView({
  attorney,
  session,
  onSignOut,
}: {
  attorney: Attorney;
  session: string;
  onSignOut: () => void;
}) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string | null>(null);

  const auth = { Authorization: `Bearer ${session}` };

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API_URL}/legal-attorney/documents`, { headers: auth })
      .then((r) => r.json())
      .then((d: { documents: DocRow[] }) => setDocs(d.documents ?? []))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  if (active) {
    return (
      <DocEditor
        slug={active}
        session={session}
        onBack={() => {
          setActive(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen justify-center bg-slate-50 px-5 py-12">
      <Card className="h-fit w-full max-w-[860px] p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="mb-2 text-xl font-bold text-charcoal">Legal Review Portal</h1>
            <p className="text-sm leading-relaxed text-slate-500">
              {attorney.fullName}
              {attorney.title ? `, ${attorney.title}` : ""}
              {attorney.firmName ? ` · ${attorney.firmName}` : ""}
              {attorney.barNumber ? ` · Bar #${attorney.barNumber}` : ""}
              {attorney.barState ? ` (${attorney.barState})` : ""}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onSignOut}>
            Sign out
          </Button>
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Loading documents…</p>
        ) : docs.length === 0 ? (
          <p className="mt-6 text-sm leading-relaxed text-slate-500">
            No archived documents are available yet. Once a document version is published to the
            archive it will appear here for review.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border-b-2 border-slate-200 px-2.5 py-2 text-left font-medium text-slate-500">Document</th>
                  <th className="border-b-2 border-slate-200 px-2.5 py-2 text-left font-medium text-slate-500">Category</th>
                  <th className="border-b-2 border-slate-200 px-2.5 py-2 text-left font-medium text-slate-500">Version</th>
                  <th className="border-b-2 border-slate-200 px-2.5 py-2 text-left font-medium text-slate-500">Status</th>
                  <th className="border-b-2 border-slate-200 px-2.5 py-2 text-left font-medium text-slate-500"></th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.slug}>
                    <td className="border-b border-slate-100 px-2.5 py-2.5 text-charcoal">{d.title}</td>
                    <td className="border-b border-slate-100 px-2.5 py-2.5 text-slate-600">{d.category}</td>
                    <td className="border-b border-slate-100 px-2.5 py-2.5 text-slate-600">{d.version}</td>
                    <td className="border-b border-slate-100 px-2.5 py-2.5">
                      {d.attorney_approved_at ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-seafoam-700">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Approved
                        </span>
                      ) : d.edited_html_at ? (
                        <span className="font-medium text-amber-700">Edited, pending approval</span>
                      ) : (
                        <span className="text-slate-500">Not reviewed</span>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-2.5 py-2.5">
                      <button
                        onClick={() => setActive(d.slug)}
                        className="text-sm font-medium text-seafoam-700 underline hover:text-seafoam-800"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function DocEditor({ slug, session, onBack }: { slug: string; session: string; onBack: () => void }) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const auth = { Authorization: `Bearer ${session}` };

  useEffect(() => {
    fetch(`${API_URL}/legal-attorney/documents/${encodeURIComponent(slug)}`, { headers: auth })
      .then((r) => r.json())
      .then((d: { html: string }) => setHtml(d.html ?? ""))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_URL}/legal-attorney/documents/${encodeURIComponent(slug)}`, {
        method: "PUT",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      });
      setMsg(res.ok ? "Saved." : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        `${API_URL}/legal-attorney/documents/${encodeURIComponent(slug)}/approve`,
        { method: "POST", headers: auth },
      );
      setMsg(res.ok ? "Approved." : "Approve failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen justify-center bg-slate-50 px-5 py-12">
      <Card className="h-fit w-full max-w-[980px] p-7">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-bold text-charcoal">Review: {slug}</h1>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
          </Button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Edit the archived document's HTML below. Saving stores your edited snapshot; approving
          records your name and bar number against this version.
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading document…</p>
        ) : (
          <>
            <Textarea
              className="mt-4 min-h-[460px] font-mono text-[13px] leading-relaxed"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              spellCheck={false}
            />
            <div className="mt-3 flex items-center gap-3">
              <Button variant="secondary" disabled={busy} onClick={save}>
                Save edits
              </Button>
              <Button disabled={busy} onClick={approve}>
                Approve document
              </Button>
              {msg && <span className="text-sm text-seafoam-700">{msg}</span>}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
