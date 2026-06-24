import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FlaskConical, Truck, User } from "lucide-react";
import { createSession } from "../api";

export function LandingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<{ txId: string } | null>(null);

  async function handleCreate() {
    setLoading(true);
    setError("");
    try {
      const s = await createSession();
      setSession(s);
    } catch {
      setError("Failed to create session. Is the API running with SEED_BOOL=true?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-seafoam-100 px-4 py-1.5 text-sm font-semibold text-seafoam-700 mb-4">
            <FlaskConical className="h-4 w-4" /> Day-of-Service Demo
          </div>
          <h1 className="text-2xl font-bold text-charcoal">Test the service flow</h1>
          <p className="mt-2 text-sm text-slate-500">
            Creates a sandboxed session with fake personas. Open the cleaner and
            customer links in separate tabs to watch them sync in real time.
          </p>
        </div>

        {/* Create button */}
        {!session && (
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full rounded-xl bg-seafoam-500 py-3 text-sm font-semibold text-white hover:bg-seafoam-600 disabled:opacity-50 transition-colors"
          >
            {loading ? "Creating session…" : "Create new session"}
          </button>
        )}

        {error && <p className="text-center text-sm text-red-500">{error}</p>}

        {/* Session links */}
        {session && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-500 font-mono">{session.txId}</p>
            </div>

            <div className="divide-y divide-slate-100">
              <SessionLink
                icon={Truck}
                role="Cleaner view"
                subtitle="Jordan Smith — advances the state machine"
                color="seafoam"
                href={`/u1/t/${session.txId}`}
                onClick={() => navigate(`/u1/t/${session.txId}`)}
              />
              <SessionLink
                icon={User}
                role="Customer view"
                subtitle="Alex Rivera — watches live status"
                color="violet"
                href={`/u2/t/${session.txId}`}
                onClick={() => navigate(`/u2/t/${session.txId}`)}
              />
            </div>

            <div className="px-5 py-3 bg-amber-50 border-t border-amber-100">
              <p className="text-xs text-amber-700 font-medium">
                Open both links in separate tabs to test real-time sync (2 s poll).
              </p>
            </div>
          </div>
        )}

        {session && (
          <button
            onClick={() => { setSession(null); }}
            className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Create another session
          </button>
        )}
      </div>
    </div>
  );
}

function SessionLink({
  icon: Icon, role, subtitle, color, href, onClick,
}: {
  icon: typeof Truck;
  role: string;
  subtitle: string;
  color: "seafoam" | "violet";
  href: string;
  onClick: () => void;
}) {
  const cls = color === "seafoam"
    ? "bg-seafoam-50 text-seafoam-600"
    : "bg-violet-50 text-violet-600";
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${cls}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-charcoal">{role}</p>
        <p className="text-xs text-slate-400 truncate">{subtitle}</p>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-seafoam-600 hover:underline font-mono"
          onClick={(e) => e.stopPropagation()}
        >
          {href}
        </a>
      </div>
      <button
        onClick={onClick}
        className="text-xs font-semibold text-seafoam-600 hover:text-seafoam-700 whitespace-nowrap"
      >
        Open →
      </button>
    </div>
  );
}
