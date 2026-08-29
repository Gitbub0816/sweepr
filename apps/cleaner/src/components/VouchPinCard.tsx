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
import { useTranslation } from "react-i18next";
import { Card, Button, toast } from "@sweepr/ui";
import { KeyRound, MapPin, RefreshCw, UserCheck, UserX } from "lucide-react";
import type { CrewSeat } from "../lib/crew";

type Fetcher = (path: string, opts?: RequestInit) => Promise<Response>;

function secondsUntil(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
}

/**
 * MEMBER view: shows this cleaner's own rotating check-in PIN (to read out to the
 * lead) and a GPS self-check-in. The PIN is short-lived and refreshes on its own.
 */
export function MemberPinCard({
  bookingId,
  authFetch,
  onCheckedIn,
}: {
  bookingId: string;
  authFetch: Fetcher;
  onCheckedIn: () => void;
}) {
  const { t } = useTranslation();
  const [pin, setPin] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [loadingPin, setLoadingPin] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  const loadPin = useCallback(async () => {
    setLoadingPin(true);
    try {
      const res = await authFetch(`/jobs/bookings/${bookingId}/crew/pin`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { pin: string; expires_at: string };
      setPin(data.pin);
      setExpiresAt(data.expires_at);
      setRemaining(secondsUntil(data.expires_at));
    } catch {
      toast.error(t("cleaner.team.pinError"));
    } finally {
      setLoadingPin(false);
    }
  }, [authFetch, bookingId, t]);

  useEffect(() => {
    loadPin();
  }, [loadPin]);

  // Countdown + auto-refresh a couple seconds before the PIN lapses.
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => {
      const left = secondsUntil(expiresAt);
      setRemaining(left);
      if (left <= 2) loadPin();
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, loadPin]);

  async function gpsCheckIn() {
    if (!navigator.geolocation) {
      toast.error(t("cleaner.team.gpsUnavailable"));
      return;
    }
    setCheckingIn(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await authFetch(`/jobs/bookings/${bookingId}/crew/checkin`, {
            method: "POST",
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string };
            toast.error(err.error ?? t("cleaner.team.checkInError"));
            return;
          }
          toast.success(t("cleaner.team.checkedIn"));
          onCheckedIn();
        } catch {
          toast.error(t("cleaner.team.checkInError"));
        } finally {
          setCheckingIn(false);
        }
      },
      () => {
        setCheckingIn(false);
        toast.error(t("cleaner.team.gpsUnavailable"));
      },
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-seafoam-50 text-seafoam-700 dark:bg-slate-800">
          <KeyRound className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-charcoal dark:text-white">
            {t("cleaner.team.myPinTitle")}
          </p>
          <p className="text-sm text-slate-500">{t("cleaner.team.myPinDesc")}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-4 text-center dark:border-slate-800 dark:bg-slate-900/40">
        <p
          className="font-mono text-4xl font-bold tracking-[0.3em] text-charcoal dark:text-white"
          aria-live="polite"
          aria-label={pin ? t("cleaner.team.pinAria", { pin: pin.split("").join(" ") }) : undefined}
        >
          {pin ?? "••••"}
        </p>
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
          <span aria-live="polite">
            {remaining > 0 ? t("cleaner.team.pinExpiresIn", { seconds: remaining }) : t("cleaner.team.pinRefreshing")}
          </span>
          <button
            type="button"
            onClick={loadPin}
            disabled={loadingPin}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-seafoam-700 hover:bg-seafoam-50 disabled:opacity-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3 w-3 ${loadingPin ? "animate-spin" : ""}`} aria-hidden />
            {t("cleaner.team.refreshPin")}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-slate-500">{t("cleaner.team.checkInGpsDesc")}</p>
        <Button fullWidth variant="secondary" onClick={gpsCheckIn} loading={checkingIn}>
          <MapPin className="mr-2 h-4 w-4" /> {t("cleaner.team.checkInGps")}
        </Button>
      </div>
    </Card>
  );
}

/**
 * LEAD view: confirm each helper on-site by entering the PIN their app shows,
 * or mark a helper who never arrived as a no-show. One row per member seat that
 * is confirmed for the job and not yet checked in.
 */
export function LeadVouchCard({
  bookingId,
  authFetch,
  memberSeats,
  onChanged,
}: {
  bookingId: string;
  authFetch: Fetcher;
  memberSeats: CrewSeat[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const pending = memberSeats.filter(
    (s) => s.role === "MEMBER" && s.status === "ACCEPTED" && !s.checkInAt,
  );

  if (pending.length === 0) return null;

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-seafoam-50 text-seafoam-700 dark:bg-slate-800">
          <UserCheck className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-charcoal dark:text-white">
            {t("cleaner.team.confirmHelper")}
          </p>
          <p className="text-sm text-slate-500">{t("cleaner.team.confirmHelperDesc")}</p>
        </div>
      </div>
      <ul className="space-y-3">
        {pending.map((seat) => (
          <VouchRow
            key={seat.id}
            bookingId={bookingId}
            authFetch={authFetch}
            seat={seat}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </Card>
  );
}

function VouchRow({
  bookingId,
  authFetch,
  seat,
  onChanged,
}: {
  bookingId: string;
  authFetch: Fetcher;
  seat: CrewSeat;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const inputId = useRef(`vouch-${seat.id}`).current;

  async function confirm() {
    if (pin.trim().length === 0) return;
    setBusy(true);
    try {
      const res = await authFetch(`/jobs/bookings/${bookingId}/crew/vouch`, {
        method: "POST",
        body: JSON.stringify({ assignmentId: seat.id, pin: pin.trim() }),
      });
      if (!res.ok) {
        toast.error(t("cleaner.team.vouchError"));
        return;
      }
      toast.success(t("cleaner.team.vouchSuccess"));
      setPin("");
      onChanged();
    } catch {
      toast.error(t("cleaner.team.vouchError"));
    } finally {
      setBusy(false);
    }
  }

  async function noShow() {
    setBusy(true);
    try {
      const res = await authFetch(`/jobs/bookings/${bookingId}/crew/no-show`, {
        method: "POST",
        body: JSON.stringify({ assignmentId: seat.id }),
      });
      if (!res.ok) {
        toast.error(t("cleaner.team.noShowError"));
        return;
      }
      toast.success(t("cleaner.team.noShowDone"));
      onChanged();
    } catch {
      toast.error(t("cleaner.team.noShowError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-2 rounded-xl border border-slate-100 px-3 py-3 dark:border-slate-800">
      <p className="text-sm font-semibold text-charcoal dark:text-white">
        {t("cleaner.team.roleMember")} {seat.seatIndex + 1}
      </p>
      <label htmlFor={inputId} className="sr-only">
        {t("cleaner.team.helperPin")}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={t("cleaner.team.helperPin")}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-lg tracking-widest text-charcoal focus:border-seafoam-500 focus:outline-none focus:ring-2 focus:ring-seafoam-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
        <Button onClick={confirm} loading={busy} disabled={pin.trim().length === 0}>
          {t("cleaner.team.confirm")}
        </Button>
      </div>
      <button
        type="button"
        onClick={noShow}
        disabled={busy}
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600 disabled:opacity-50"
      >
        <UserX className="h-3.5 w-3.5" aria-hidden /> {t("cleaner.team.markNoShow")}
      </button>
    </li>
  );
}
