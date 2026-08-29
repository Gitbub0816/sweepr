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
 * Smart Locks — customer management surface. Connect a smart-lock brand (Seam
 * Connect Webview) and/or link an Airbnb account, then see what came back. All
 * traffic goes through our own API (/smart-entry/*); the ONLY non-Sweepr screen
 * is the provider's hosted consent page, opened in a new tab by useSeamConnect.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DoorOpen,
  Lock,
  RefreshCw,
  Plus,
  Wifi,
  WifiOff,
  KeyRound,
  Unlock,
  Home,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { DashboardShell, Card, Button, Badge, EmptyState, toast } from "@sweepr/ui";
import { useAppToken } from "@/lib/appToken";
import { useSeamConnect, type ConnectPhase } from "@/lib/useSeamConnect";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface Status {
  enabled: boolean;
  remoteUnlockEnabled?: boolean;
  manualCodeEnabled?: boolean;
  feeCents: number;
  includedWithMembership: boolean;
}
interface Device {
  id: string;
  name: string;
  type: string | null;
  online: boolean;
  supportsRemoteUnlock: boolean;
  supportsTemporaryCodes: boolean;
}
interface Listing {
  id: string;
  name: string;
  type: string | null;
  online: boolean;
}

/** Inline aria-live progress for a connect flow. Renders nothing when idle. */
function ConnectProgress({
  phase,
  message,
  onRetry,
}: {
  phase: ConnectPhase;
  message: string;
  onRetry: () => void;
}) {
  if (phase === "idle" || phase === "connected") return null;
  const busy = phase === "starting" || phase === "waiting";
  const isError = phase === "error" || phase === "disabled" || phase === "unconfigured";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-3 flex items-start gap-3 rounded-xl border p-3 text-sm ${
        isError
          ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
          : "border-seafoam-200 bg-seafoam-50 text-seafoam-800 dark:border-seafoam-900/40 dark:bg-seafoam-950/20 dark:text-seafoam-200"
      }`}
    >
      {busy ? (
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0">
        <p>{message}</p>
        {isError && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 font-semibold underline underline-offset-2"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

function DeviceRow({ device }: { device: Device }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-seafoam-50 text-seafoam-700 dark:bg-slate-800 dark:text-seafoam-300">
          <Lock className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-charcoal dark:text-white">{device.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {device.online ? (
              <Badge variant="success" className="gap-1">
                <Wifi className="h-3 w-3" aria-hidden="true" /> Online
              </Badge>
            ) : (
              <Badge variant="default" className="gap-1">
                <WifiOff className="h-3 w-3" aria-hidden="true" /> Offline
              </Badge>
            )}
            {device.supportsTemporaryCodes && (
              <Badge variant="info" className="gap-1">
                <KeyRound className="h-3 w-3" aria-hidden="true" /> Codes
              </Badge>
            )}
            {device.supportsRemoteUnlock && (
              <Badge variant="info" className="gap-1">
                <Unlock className="h-3 w-3" aria-hidden="true" /> Remote unlock
              </Badge>
            )}
            {device.type && (
              <span className="text-xs capitalize text-slate-400">{device.type.replace(/_/g, " ")}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SmartLocksPage() {
  const { getToken } = useAppToken();

  const [status, setStatus] = useState<Status | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const mounted = useRef(true);

  const authed = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init?.headers as Record<string, string>),
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      return fetch(`${API_URL}${path}`, { ...init, headers });
    },
    [getToken],
  );

  const loadDevices = useCallback(async () => {
    const res = await authed("/smart-entry/devices");
    if (res.ok) {
      const d = (await res.json()) as { devices: Device[] };
      if (mounted.current) setDevices(d.devices ?? []);
    }
  }, [authed]);

  const loadListings = useCallback(async () => {
    const res = await authed("/smart-entry/airbnb/listings");
    if (res.ok) {
      const d = (await res.json()) as { listings: Listing[] };
      if (mounted.current) setListings(d.listings ?? []);
    }
  }, [authed]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const s = await authed("/smart-entry/status");
      if (!s.ok) throw new Error("status");
      const statusData = (await s.json()) as Status;
      if (!mounted.current) return;
      setStatus(statusData);
      if (statusData.enabled) {
        await Promise.all([loadDevices(), loadListings()]);
      }
    } catch {
      if (mounted.current) setLoadError(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [authed, loadDevices, loadListings]);

  useEffect(() => {
    mounted.current = true;
    void loadAll();
    return () => {
      mounted.current = false;
    };
  }, [loadAll]);

  const lockConnect = useSeamConnect({
    authed,
    startPath: "/smart-entry/connect/start",
    statusPath: (id) => `/smart-entry/connect/status?webviewId=${encodeURIComponent(id)}`,
    onConnected: () => {
      toast.success("Lock connected");
      void loadDevices();
    },
  });

  const airbnbConnect = useSeamConnect({
    authed,
    startPath: "/smart-entry/airbnb/connect/start",
    statusPath: (id) => `/smart-entry/airbnb/connect/status?webviewId=${encodeURIComponent(id)}`,
    onConnected: () => {
      toast.success("Airbnb linked");
      void loadListings();
    },
  });

  const refreshDevices = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await authed("/smart-entry/devices/sync", { method: "POST", body: JSON.stringify({}) });
      if (!res.ok) throw new Error("sync");
      await loadDevices();
      toast.success("Devices refreshed");
    } catch {
      toast.error("Couldn't refresh devices");
    } finally {
      setSyncing(false);
    }
  }, [authed, loadDevices]);

  return (
    <DashboardShell
      title="Smart locks"
      description="Connect your smart lock so your verified cleaner can be let in automatically for each cleaning — no keys, no waiting around."
    >
      {loading ? (
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          <div className="h-40 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : loadError ? (
        <EmptyState
          icon={<AlertCircle className="h-10 w-10" />}
          title="Couldn't load your smart locks"
          description="Something went wrong reaching our servers."
          action={
            <Button variant="secondary" onClick={() => void loadAll()}>
              Try again
            </Button>
          }
        />
      ) : !status?.enabled ? (
        <EmptyState
          icon={<DoorOpen className="h-10 w-10" />}
          title="Smart Entry isn't available yet"
          description="Smart lock connections aren't turned on for your account right now. Check back soon — we're rolling this out."
        />
      ) : (
        <div className="space-y-6">
          {/* ── Connected locks ─────────────────────────────────────────── */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <DoorOpen className="h-5 w-5 text-seafoam-700" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-charcoal dark:text-white">Your locks</h2>
              </div>
              {devices.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void refreshDevices()}
                    loading={syncing}
                    aria-label="Refresh devices"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void lockConnect.start()}
                    loading={lockConnect.phase === "starting"}
                    disabled={lockConnect.phase === "waiting"}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" /> Connect another
                  </Button>
                </div>
              )}
            </div>

            {devices.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={<Lock className="h-10 w-10" />}
                  title="No locks connected"
                  body="Connect a supported smart lock (August, Yale, Schlage, Kwikset, SmartThings and more) to enable secure, temporary cleaner access."
                  action={
                    <Button
                      onClick={() => void lockConnect.start()}
                      loading={lockConnect.phase === "starting"}
                      disabled={lockConnect.phase === "waiting"}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" /> Connect a lock
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {devices.map((d) => (
                  <DeviceRow key={d.id} device={d} />
                ))}
              </div>
            )}

            <ConnectProgress
              phase={lockConnect.phase}
              message={lockConnect.message}
              onRetry={lockConnect.start}
            />
          </Card>

          {/* ── Airbnb ──────────────────────────────────────────────────── */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Home className="h-5 w-5 text-seafoam-700" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-charcoal dark:text-white">Airbnb</h2>
              </div>
              {listings.length > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void airbnbConnect.start()}
                  loading={airbnbConnect.phase === "starting"}
                  disabled={airbnbConnect.phase === "waiting"}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" /> Link another
                </Button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Link your Airbnb account so Sweepr can read your reservations and program the listing&apos;s
              smart lock for each guest turnover. This complements your calendar import with live
              reservation and lock control.
            </p>

            {listings.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={<Home className="h-10 w-10" />}
                  title="No Airbnb account linked"
                  body="Link Airbnb to let Sweepr turn over your listing automatically after each checkout."
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => void airbnbConnect.start()}
                      loading={airbnbConnect.phase === "starting"}
                      disabled={airbnbConnect.phase === "waiting"}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" /> Link Airbnb
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {listings.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-seafoam-50 text-seafoam-700 dark:bg-slate-800 dark:text-seafoam-300">
                        <Home className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <p className="truncate text-sm font-semibold text-charcoal dark:text-white">{l.name}</p>
                    </div>
                    {l.online ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="default">Offline</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}

            <ConnectProgress
              phase={airbnbConnect.phase}
              message={airbnbConnect.message}
              onRetry={airbnbConnect.start}
            />
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}
