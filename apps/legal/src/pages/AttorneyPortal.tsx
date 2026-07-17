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
    <div style={styles.page}>
      <div style={styles.card}>{children}</div>
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
      <h1 style={styles.h1}>Legal Review Portal</h1>
      <p style={styles.muted}>
        Sign in to view, edit, and approve Sweepr legal documents. Enter your registered email
        and we'll send you a secure single-use link.
      </p>
      {sent ? (
        <p style={styles.notice}>
          If that email is registered, a sign-in link is on its way. It expires in 30 minutes.
        </p>
      ) : (
        <>
          <input
            style={styles.input}
            type="email"
            placeholder="you@lawfirm.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button style={styles.button} disabled={busy || !email} onClick={request}>
            {busy ? "Sending…" : "Send sign-in link"}
          </button>
        </>
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
    <div style={styles.page}>
      <div style={{ ...styles.card, maxWidth: 860 }}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.h1}>Legal Review Portal</h1>
            <p style={styles.muted}>
              {attorney.fullName}
              {attorney.title ? `, ${attorney.title}` : ""}
              {attorney.firmName ? ` · ${attorney.firmName}` : ""}
              {attorney.barNumber ? ` · Bar #${attorney.barNumber}` : ""}
              {attorney.barState ? ` (${attorney.barState})` : ""}
            </p>
          </div>
          <button style={styles.linkBtn} onClick={onSignOut}>
            Sign out
          </button>
        </div>

        {loading ? (
          <p style={styles.muted}>Loading documents…</p>
        ) : docs.length === 0 ? (
          <p style={styles.muted}>
            No archived documents are available yet. Once a document version is published to the
            archive it will appear here for review.
          </p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Document</th>
                <th style={styles.th}>Category</th>
                <th style={styles.th}>Version</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.slug}>
                  <td style={styles.td}>{d.title}</td>
                  <td style={styles.td}>{d.category}</td>
                  <td style={styles.td}>{d.version}</td>
                  <td style={styles.td}>
                    {d.attorney_approved_at ? (
                      <span style={styles.approved}>✓ Approved</span>
                    ) : d.edited_html_at ? (
                      <span style={styles.edited}>Edited, pending approval</span>
                    ) : (
                      <span style={styles.muted}>Not reviewed</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <button style={styles.linkBtn} onClick={() => setActive(d.slug)}>
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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
    <div style={styles.page}>
      <div style={{ ...styles.card, maxWidth: 980 }}>
        <div style={styles.headerRow}>
          <h1 style={styles.h1}>Review: {slug}</h1>
          <button style={styles.linkBtn} onClick={onBack}>
            ← Back
          </button>
        </div>
        <p style={styles.muted}>
          Edit the archived document's HTML below. Saving stores your edited snapshot; approving
          records your name and bar number against this version.
        </p>
        {loading ? (
          <p style={styles.muted}>Loading document…</p>
        ) : (
          <>
            <textarea
              style={styles.textarea}
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              spellCheck={false}
            />
            <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center" }}>
              <button style={styles.button} disabled={busy} onClick={save}>
                Save edits
              </button>
              <button style={{ ...styles.button, background: "#0f766e" }} disabled={busy} onClick={approve}>
                Approve document
              </button>
              {msg && <span style={styles.notice}>{msg}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    padding: "48px 20px",
    fontFamily: "'Ubuntu Mono', ui-monospace, monospace",
    color: "#1c1a17",
  },
  card: {
    width: "100%",
    maxWidth: 480,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: 28,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 },
  h1: { fontSize: 22, fontWeight: 700, margin: "0 0 8px" },
  muted: { color: "#64748b", fontSize: 14, lineHeight: 1.6, margin: "0 0 16px" },
  notice: { color: "#0f766e", fontSize: 14 },
  input: {
    width: "100%",
    padding: "12px 14px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    fontSize: 15,
    marginBottom: 12,
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  textarea: {
    width: "100%",
    minHeight: 460,
    padding: 14,
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    fontSize: 13,
    lineHeight: 1.5,
    boxSizing: "border-box",
    fontFamily: "ui-monospace, monospace",
  },
  button: {
    padding: "11px 22px",
    background: "#14b8a6",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: "#0f766e",
    fontSize: 14,
    cursor: "pointer",
    textDecoration: "underline",
    fontFamily: "inherit",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #e2e8f0", color: "#64748b" },
  td: { padding: "10px", borderBottom: "1px solid #f1f5f9" },
  approved: { color: "#0f766e", fontWeight: 600 },
  edited: { color: "#b45309" },
};
