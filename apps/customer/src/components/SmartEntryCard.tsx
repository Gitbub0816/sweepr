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
import { KeyRound, Home, Lock, DoorOpen, Check } from "lucide-react";
import { Card, Button, toast } from "@sweepr/ui";
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

export function SmartEntryCard({ bookingId, token, apiUrl }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [method, setMethod] = useState<Method>("home");
  const [secret, setSecret] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

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
          const data = (await b.json()) as { authorization: { access_method?: Method } | null };
          if (data.authorization?.access_method) setMethod(data.authorization.access_method);
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
    </Card>
  );
}
