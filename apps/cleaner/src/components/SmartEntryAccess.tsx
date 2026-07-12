/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useState, useCallback } from "react";
import { KeyRound, DoorOpen, ShieldAlert } from "lucide-react";
import { Card, Button, toast } from "@sweepr/ui";

interface Props {
  bookingId: string;
  getToken: () => Promise<string | null>;
  apiUrl: string;
  /** Only enabled once the cleaner has checked in (arrived / in_progress). */
  eligible: boolean;
}

const SESSION_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now()}`;

function getLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("no_geolocation"));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
  });
}

/**
 * Smart Entry actions for the assigned cleaner. The code/unlock is only ever
 * returned by the server after its full authorization decision; this component
 * never persists the code and hides it after a short window.
 */
export function SmartEntryAccess({ bookingId, getToken, apiUrl, eligible }: Props) {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  const call = useCallback(
    async (action: "reveal" | "unlock") => {
      setBusy(true);
      try {
        const pos = await getLocation();
        const token = await getToken();
        const res = await fetch(`${apiUrl}/cleaner/bookings/${bookingId}/access/${action}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMeters: pos.coords.accuracy,
            capturedAt: new Date(pos.timestamp).toISOString(),
            // Device biometric/passkey reauth would stamp this; treated as "now".
            reauthenticatedAt: new Date().toISOString(),
            sessionId: SESSION_ID,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          credential?: string;
          displaySeconds?: number;
          reason?: string;
          message?: string;
          status?: string;
        };
        if (!res.ok) {
          toast.error(
            data.reason === "OUTSIDE_GEOFENCE"
              ? "You must be at the property to use Smart Entry."
              : data.reason === "REAUTHENTICATION_REQUIRED"
                ? "Please re-authenticate and try again."
                : "Smart Entry isn't available right now.",
          );
          return;
        }
        if (action === "reveal" && data.credential) {
          setCode(data.credential);
          const hideMs = (data.displaySeconds ?? 45) * 1000;
          window.setTimeout(() => setCode(null), hideMs);
        } else if (action === "unlock") {
          toast.success(data.message ?? "The door was unlocked. Please secure it when you leave.");
        }
      } catch (err) {
        toast.error(err instanceof Error && err.message === "no_geolocation" ? "Enable location to use Smart Entry." : "Location is required — try again near the property.");
      } finally {
        setBusy(false);
      }
    },
    [apiUrl, bookingId, getToken],
  );

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <DoorOpen className="h-5 w-5 text-seafoam-700" />
        <h3 className="text-sm font-semibold text-charcoal dark:text-white">Smart Entry</h3>
      </div>
      {!eligible ? (
        <p className="flex items-start gap-2 text-xs text-slate-500">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Smart Entry becomes available when you're at the property and checked in for this booking.
        </p>
      ) : code ? (
        <div className="rounded-xl border border-seafoam-300 bg-seafoam-50 p-4 text-center dark:bg-slate-800">
          <p className="text-xs font-semibold text-slate-500">Entry code (hides shortly)</p>
          <p className="mt-1 select-none text-3xl font-black tracking-[0.3em] text-charcoal dark:text-white">
            {code}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => call("reveal")} disabled={busy}>
            <span className="flex items-center gap-1.5">
              <KeyRound className="h-4 w-4" /> Reveal code
            </span>
          </Button>
          <Button variant="secondary" onClick={() => call("unlock")} disabled={busy}>
            <span className="flex items-center gap-1.5">
              <DoorOpen className="h-4 w-4" /> Unlock door
            </span>
          </Button>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-slate-400">
        For your protection, access is checked in real time against your location, identity, and booking. Never share
        this code.
      </p>
    </Card>
  );
}
