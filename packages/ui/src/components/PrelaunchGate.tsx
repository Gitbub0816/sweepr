import { useEffect, useState } from "react";
import { WaitlistForm } from "./WaitlistForm";

const BYPASS_KEY = "sweepr_prelaunch_bypass";
const BYPASS_CODE = "0123";

interface PrelaunchGateProps {
  type: "cleaner" | "customer";
  apiUrl: string;
  children: React.ReactNode;
}

interface StatusSettings {
  prelaunch_cleaner: boolean;
  prelaunch_customer: boolean;
}

export function PrelaunchGate({ type, apiUrl, children }: PrelaunchGateProps) {
  const [settings, setSettings] = useState<StatusSettings | null>(null);
  const [bypassed, setBypassed] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(BYPASS_KEY) === "true") {
        setBypassed(true);
      }
    } catch {
      // localStorage unavailable
    }

    fetch(`${apiUrl}/status`)
      .then((r) => r.json() as Promise<{ settings: StatusSettings }>)
      .then((data) => setSettings(data.settings))
      .catch(() => setSettings({ prelaunch_cleaner: false, prelaunch_customer: false }));
  }, [apiUrl]);

  function handleBypassClick() {
    const next = clickCount + 1;
    setClickCount(next);
    if (next >= 3) {
      setClickCount(0);
      setShowCodeModal(true);
    }
  }

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (codeInput === BYPASS_CODE) {
      try {
        localStorage.setItem(BYPASS_KEY, "true");
      } catch {
        // noop
      }
      setBypassed(true);
      setShowCodeModal(false);
    } else {
      setCodeError(true);
    }
  }

  // Still loading
  if (settings === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-seafoam-400 border-t-transparent" />
      </div>
    );
  }

  const isPrelaunch =
    type === "cleaner" ? settings.prelaunch_cleaner : settings.prelaunch_customer;

  if (!isPrelaunch || bypassed) {
    return <>{children}</>;
  }

  const label = type === "cleaner" ? "cleaners" : "customers";

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <img src="/brand/sweepr-logo.png" className="h-14 w-auto" alt="Sweepr" />

        <h1 className="text-2xl font-bold text-charcoal">
          We're not accepting {label} yet
        </h1>

        <p className="text-slate-500">
          Visit our status page or subscribe for updates when we launch.
        </p>

        <div className="flex gap-3">
          <a
            href="https://status.getsweepr.com"
            className="rounded-lg border border-seafoam-500 px-4 py-2 text-sm font-semibold text-seafoam-600 hover:bg-seafoam-50 transition-colors"
          >
            View Status Page
          </a>
          <a
            href="https://status.getsweepr.com#newsletter"
            className="rounded-lg bg-seafoam-500 px-4 py-2 text-sm font-semibold text-white hover:bg-seafoam-600 transition-colors"
          >
            Subscribe for Updates
          </a>
        </div>

        <div className="w-full border-t border-slate-100 pt-6">
          <p className="mb-4 text-sm font-semibold text-slate-700">
            Want to be first?
          </p>
          <WaitlistForm type={type} apiUrl={apiUrl} />
        </div>
      </div>

      {/* Invisible bypass trigger */}
      <button
        onClick={handleBypassClick}
        className="opacity-0 absolute bottom-2 right-2 h-4 w-4"
        aria-hidden="true"
        tabIndex={-1}
      />

      {showCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-xs rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-3 text-base font-semibold text-charcoal">
              Enter bypass code
            </h2>
            <form onSubmit={handleCodeSubmit} className="flex flex-col gap-3">
              <input
                type="text"
                autoFocus
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  setCodeError(false);
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400"
                placeholder="Code"
              />
              {codeError && (
                <p className="text-xs text-red-500">Incorrect code.</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCodeModal(false)}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-seafoam-500 px-3 py-2 text-sm font-semibold text-white hover:bg-seafoam-600"
                >
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
