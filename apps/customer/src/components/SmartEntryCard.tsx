/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Home, Lock, DoorOpen, Check, Wifi, WifiOff, Plus } from "lucide-react";
import { Card, Button, Badge, toast } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";

interface Props {
  bookingId: string;
  token: string | null;
  apiUrl: string;
}

interface Status {
  enabled: boolean;
  feeCents: number;
  includedWithMembership: boolean;
}

type Method = "home" | "keypad_code" | "smart_entry" | "lockbox";

const OPTIONS: Array<{ key: Method; label: string; hint: string; icon: typeof Home }> = [
  { key: "home", label: "I'll be home", hint: "You'll let your cleaner in.", icon: Home },
  { key: "smart_entry", label: "Sweepr Smart Entry", hint: "Secure temporary smart-lock access.", icon: DoorOpen },
  { key: "keypad_code", label: "Temporary keypad code", hint: "Provide a temporary code (not your master code).", icon: KeyRound },
  { key: "lockbox", label: "Lockbox / hidden key", hint: "Give secure access instructions.", icon: Lock },
];

interface Device {
  id: string;
  name: string;
  type: string | null;
  online: boolean;
  supportsRemoteUnlock: boolean;
  supportsTemporaryCodes: boolean;
}

export function SmartEntryCard({ bookingId, token, apiUrl }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [method, setMethod] = useState<Method>("home");
  const [secret, setSecret] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  // Whether Smart Entry is the PERSISTED method (customer already saved/consented)
  // — gates the device picker so it only appears once consent is on record.
  const [persistedSmartEntry, setPersistedSmartEntry] = useState(false);
  const [attachedDeviceId, setAttachedDeviceId] = useState<string | null>(null);

  const headers = useCallback(
    (json = false): Record<string, string> => ({
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [s, b] = await Promise.all([
          fetch(`${apiUrl}/smart-entry/status`, { headers: headers() }),
          fetch(`${apiUrl}/smart-entry/booking/${bookingId}`, { headers: headers() }),
        ]);
        if (!active) return;
        if (s.ok) setStatus((await s.json()) as Status);
        if (b.ok) {
          const data = (await b.json()) as {
            authorization: { access_method?: Method; lock_device_id?: string | null } | null;
          };
          const auth = data.authorization;
          if (auth?.access_method) setMethod(auth.access_method);
          setPersistedSmartEntry(auth?.access_method === "smart_entry");
          setAttachedDeviceId(auth?.lock_device_id ?? null);
        }
      } catch {
        /* silent */
      }
    })();
    return () => {
      active = false;
    };
  }, [apiUrl, bookingId, headers]);

  if (!status?.enabled) return null;

  async function save() {
    if (method === "smart_entry" && !consent) {
      toast.error("Please authorize Smart Entry to continue");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiUrl}/smart-entry/booking/${bookingId}`, {
        method: "PUT",
        headers: headers(true),
        body: JSON.stringify({
          method,
          secretValue: ["keypad_code", "lockbox"].includes(method) ? secret || null : null,
          authorize: method === "smart_entry" ? consent : undefined,
        }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error);
      }
      setSaved(true);
      setPersistedSmartEntry(method === "smart_entry");
      toast.success("Access preference saved");
    } catch {
      toast.error("Couldn't save access preference");
    } finally {
      setBusy(false);
    }
  }

  const showFee = method === "smart_entry" && !status.includedWithMembership && status.feeCents > 0;

  return (
    <Card>
      <div className="flex items-center gap-2">
        <DoorOpen className="h-5 w-5 text-seafoam-700" />
        <h2 className="text-sm font-semibold text-charcoal dark:text-white">How your cleaner gets in</h2>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Choose how your assigned cleaner will access your home. You can change this until check-in.
      </p>

      <div className="mt-4 grid gap-2">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const active = method === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                setMethod(o.key);
                setSaved(false);
              }}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                active
                  ? "border-seafoam-400 bg-seafoam-50 dark:bg-slate-800"
                  : "border-slate-200 hover:border-seafoam-300 dark:border-slate-700"
              }`}
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-seafoam-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-600">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold text-charcoal dark:text-white">
                  {o.label}
                  {o.key === "smart_entry" &&
                    (status.includedWithMembership ? (
                      <span className="rounded-full bg-seafoam-100 px-2 py-0.5 text-[10px] font-bold text-seafoam-800">
                        Included with Sweepr+
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                        +{formatCurrency(status.feeCents)}
                      </span>
                    ))}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{o.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {["keypad_code", "lockbox"].includes(method) && (
        <input
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={method === "keypad_code" ? "Temporary code (not your master code)" : "Access instructions"}
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      )}

      {method === "smart_entry" && (
        <div className="mt-3 space-y-3">
          {!status.includedWithMembership && (
            <p className="text-xs text-slate-500">
              Smart Entry is a {formatCurrency(status.feeCents)} add-on for this cleaning, or{" "}
              <Link to="/membership" className="font-semibold text-seafoam-700 underline">
                free with Sweepr+
              </Link>
              .
            </p>
          )}
          <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I authorize Sweepr to give my assigned, verified cleaner temporary access to my selected lock for this
              booking only, during the authorized window and near my address, revoked after the job. See the{" "}
              <a
                href="https://legal.getsweepr.com/smart-entry-membership"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Smart Entry Terms
              </a>
              .
            </span>
          </label>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={save} disabled={busy || saved}>
          {saved ? (
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4" /> Saved
            </span>
          ) : (
            "Save access preference"
          )}
        </Button>
      </div>

      {/* Device picker: only once Smart Entry is the chosen + consented method
          for this booking (the backend requires the smart_entry authorization to
          exist before a device can be attached — otherwise PUT .../device 409s). */}
      {persistedSmartEntry && method === "smart_entry" && (
        <SmartEntryDevicePicker
          bookingId={bookingId}
          apiUrl={apiUrl}
          headers={headers}
          attachedDeviceId={attachedDeviceId}
          onAttached={setAttachedDeviceId}
        />
      )}
    </Card>
  );
}

/**
 * Lets the customer pick WHICH of their connected locks to use for this
 * cleaning. Appears under the access-method chooser once Smart Entry is the
 * saved method. Selecting a lock calls PUT /smart-entry/booking/:id/device,
 * which provisions the Seam grant. A 409 (no_smart_entry_authorization) means
 * the method/consent wasn't saved first — we guide the customer back to that.
 */
function SmartEntryDevicePicker({
  bookingId,
  apiUrl,
  headers,
  attachedDeviceId,
  onAttached,
}: {
  bookingId: string;
  apiUrl: string;
  headers: (json?: boolean) => Record<string, string>;
  attachedDeviceId: string | null;
  onAttached: (id: string) => void;
}) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch(`${apiUrl}/smart-entry/devices`, { headers: headers() });
      if (!res.ok) throw new Error("devices");
      const d = (await res.json()) as { devices: Device[] };
      setDevices(d.devices ?? []);
    } catch {
      setError(true);
      setDevices([]);
    }
  }, [apiUrl, headers]);

  useEffect(() => {
    void load();
  }, [load]);

  async function attach(deviceId: string) {
    setSavingId(deviceId);
    try {
      const res = await fetch(`${apiUrl}/smart-entry/booking/${bookingId}/device`, {
        method: "PUT",
        headers: headers(true),
        body: JSON.stringify({ deviceId }),
      });
      if (res.status === 409) {
        toast.error("Save Smart Entry as your access method first, then pick a lock");
        return;
      }
      if (!res.ok) throw new Error("attach");
      onAttached(deviceId);
      toast.success("Lock selected for this cleaning");
    } catch {
      toast.error("Couldn't set that lock. Please try again.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
      <p className="text-xs font-semibold text-charcoal dark:text-white">Which lock should we use?</p>

      {devices === null ? (
        <div className="mt-3 h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : error ? (
        <p className="mt-2 text-xs text-slate-500">
          Couldn&apos;t load your locks.{" "}
          <button type="button" onClick={() => void load()} className="font-semibold text-seafoam-700 underline">
            Retry
          </button>
        </p>
      ) : devices.length === 0 ? (
        <div className="mt-2 rounded-xl border border-dashed border-slate-200 p-4 text-center dark:border-slate-700">
          <p className="text-xs text-slate-500">You don&apos;t have a connected lock yet.</p>
          <Link
            to="/smart-locks"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-seafoam-700 underline"
          >
            <Plus className="h-3.5 w-3.5" /> Connect a lock
          </Link>
        </div>
      ) : (
        <div className="mt-2 grid gap-2">
          {devices.map((d) => {
            const active = d.id === attachedDeviceId;
            const savingThis = savingId === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => void attach(d.id)}
                disabled={savingThis}
                aria-pressed={active}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${
                  active
                    ? "border-seafoam-400 bg-seafoam-50 dark:bg-slate-800"
                    : "border-slate-200 hover:border-seafoam-300 dark:border-slate-700"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Lock className="h-4 w-4 shrink-0 text-seafoam-700" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-charcoal dark:text-white">
                      {d.name}
                    </span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
                      {d.online ? (
                        <>
                          <Wifi className="h-3 w-3" /> Online
                        </>
                      ) : (
                        <>
                          <WifiOff className="h-3 w-3" /> Offline
                        </>
                      )}
                    </span>
                  </span>
                </span>
                {active ? (
                  <Badge variant="success" className="gap-1">
                    <Check className="h-3 w-3" /> Selected
                  </Badge>
                ) : savingThis ? (
                  <span className="text-xs text-slate-400">Saving…</span>
                ) : (
                  <span className="text-xs font-semibold text-seafoam-700">Use this</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
