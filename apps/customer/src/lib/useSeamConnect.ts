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
 * Shared "connect a provider → open hosted consent in a new tab → poll for
 * authorization" flow, used by BOTH the smart-lock brand link and the Airbnb
 * link (identical contract, different endpoints).
 *
 * Flow:
 *  1. POST `startPath` → { url, webviewId }. Open `url` in a NEW TAB (never an
 *     iframe — the provider consent screen is X-Frame-Options blocked and is
 *     the one unavoidable non-Sweepr screen).
 *  2. Poll GET `statusPath(webviewId)` every ~3s (stop after ~2min or when
 *     `connected`). The return page (`/smart-entry/connect/return`) also fires a
 *     same-origin postMessage + localStorage ping so this poll resolves the
 *     instant the user lands back — the interval poll is the reliable fallback.
 *  3. On `{ connected: true }`, call `onConnected` (refresh device/listing list).
 *
 * 403 → disabled state, 503 → unconfigured state (both surfaced friendly).
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectPhase =
  | "idle"
  | "starting"
  | "waiting"
  | "connected"
  | "error"
  | "disabled"
  | "unconfigured";

/** Same-origin cross-tab signal that the consent tab has returned. */
export const CONNECT_RETURN_STORAGE_KEY = "sweepr.smartEntry.connectReturn";
export const CONNECT_RETURN_MESSAGE = "sweepr:smart-entry:connect-return";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 120_000;

type Authed = (path: string, init?: RequestInit) => Promise<Response>;

interface StartResponse {
  url?: string;
  webviewId?: string;
  error?: string;
}
interface StatusResponse {
  connected?: boolean;
  accountId?: string;
  status?: string;
  error?: string;
}

export interface UseSeamConnect {
  phase: ConnectPhase;
  /** Human-readable line for the aria-live region. */
  message: string;
  start: () => Promise<void>;
  /** Return to idle (e.g. after a handled error, to allow retry). */
  reset: () => void;
}

export function useSeamConnect(opts: {
  authed: Authed;
  startPath: string;
  statusPath: (webviewId: string) => string;
  onConnected: () => void;
}): UseSeamConnect {
  const { authed, startPath, statusPath, onConnected } = opts;

  const [phase, setPhase] = useState<ConnectPhase>("idle");
  const [message, setMessage] = useState("");

  // Mutable refs so listeners/timers see current values without re-subscribing.
  const webviewRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingRef = useRef(false);
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  const stopTimers = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    intervalRef.current = null;
    timeoutRef.current = null;
  }, []);

  const reset = useCallback(() => {
    stopTimers();
    webviewRef.current = null;
    pollingRef.current = false;
    setPhase("idle");
    setMessage("");
  }, [stopTimers]);

  // One status check. Guarded so overlapping ticks (interval + return-signal)
  // never double-run.
  const checkStatus = useCallback(async () => {
    const webviewId = webviewRef.current;
    if (!webviewId || pollingRef.current) return;
    pollingRef.current = true;
    try {
      const res = await authed(statusPath(webviewId));
      if (res.status === 503) {
        stopTimers();
        webviewRef.current = null;
        setPhase("unconfigured");
        setMessage("Smart Entry isn't available right now. Please try again later.");
        return;
      }
      if (!res.ok) return; // transient (404 before the row is visible, 502) — keep polling
      const data = (await res.json()) as StatusResponse;
      if (data.connected) {
        stopTimers();
        webviewRef.current = null;
        setPhase("connected");
        setMessage("Linked. Loading what you connected…");
        onConnectedRef.current();
      }
    } catch {
      /* network blip — keep polling */
    } finally {
      pollingRef.current = false;
    }
  }, [authed, statusPath, stopTimers]);

  // Listen for the same-origin return signal (postMessage + storage) to resolve
  // the poll instantly instead of waiting for the next 3s tick.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if ((e.data as { type?: string })?.type === CONNECT_RETURN_MESSAGE) {
        if (webviewRef.current) void checkStatus();
      }
    }
    function onStorage(e: StorageEvent) {
      if (e.key === CONNECT_RETURN_STORAGE_KEY && webviewRef.current) void checkStatus();
    }
    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
    };
  }, [checkStatus]);

  // Cleanup on unmount.
  useEffect(() => () => stopTimers(), [stopTimers]);

  const start = useCallback(async () => {
    stopTimers();
    setPhase("starting");
    setMessage("Preparing your secure link…");

    // Open a placeholder tab synchronously inside the click so the browser
    // doesn't treat the later async open as a blocked popup. We navigate it to
    // the provider URL once we have it (or close it on failure).
    const tab = window.open("about:blank", "_blank", "noopener=false");

    let data: StartResponse;
    try {
      const res = await authed(startPath, { method: "POST", body: JSON.stringify({}) });
      if (res.status === 403) {
        tab?.close();
        setPhase("disabled");
        setMessage("Smart Entry is currently turned off for your account.");
        return;
      }
      if (res.status === 503) {
        tab?.close();
        setPhase("unconfigured");
        setMessage("Smart Entry isn't available right now. Please try again later.");
        return;
      }
      if (!res.ok) {
        tab?.close();
        setPhase("error");
        setMessage("Couldn't start the link. Please try again.");
        return;
      }
      data = (await res.json()) as StartResponse;
    } catch {
      tab?.close();
      setPhase("error");
      setMessage("Couldn't start the link. Please check your connection and try again.");
      return;
    }

    if (!data.url || !data.webviewId) {
      tab?.close();
      setPhase("error");
      setMessage("Couldn't start the link. Please try again.");
      return;
    }

    // Point the pre-opened tab at the hosted consent page. If the popup was
    // blocked (tab is null), fall back to navigating via location assignment in
    // a new tab is not possible without a gesture — so we still record the flow
    // and rely on the poll; but in practice the synchronous open above succeeds.
    if (tab) {
      tab.location.href = data.url;
    } else {
      // Popup blocked: last-ditch attempt (may itself be blocked, that's ok —
      // the user can retry). The poll still starts so a manual completion works.
      window.open(data.url, "_blank");
    }

    webviewRef.current = data.webviewId;
    setPhase("waiting");
    setMessage("Waiting for you to finish linking in the other tab…");

    intervalRef.current = setInterval(() => void checkStatus(), POLL_INTERVAL_MS);
    timeoutRef.current = setTimeout(() => {
      stopTimers();
      // Only time out if we never connected.
      if (webviewRef.current) {
        webviewRef.current = null;
        setPhase("error");
        setMessage(
          "We didn't detect a completed link. If you finished in the other tab, tap Refresh; otherwise try again.",
        );
      }
    }, POLL_TIMEOUT_MS);
  }, [authed, startPath, stopTimers, checkStatus]);

  return { phase, message, start, reset };
}
