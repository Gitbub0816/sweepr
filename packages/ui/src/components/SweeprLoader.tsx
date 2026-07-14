/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@sweepr/utils";
import { useReducedMotion } from "../hooks/useReducedMotion";

/**
 * Canonical loading indicator: the Sweepr broom Lottie animation, served from
 * R2. The animation JSON is fetched once and cached module-wide; lottie-web's
 * light player is loaded lazily so apps that never hit a loading state don't
 * pay for it. Until the animation is ready (or if the fetch fails, or the
 * user prefers reduced motion) a plain CSS spinner renders instead, so this
 * component is always safe to use.
 */
const BROOM_LOTTIE_URL =
  "https://objects.getsweepr.com/site_assets/public/broom-loading.json";

let lottieDataPromise: Promise<object | null> | null = null;
function loadLottieData(): Promise<object | null> {
  if (!lottieDataPromise) {
    lottieDataPromise = fetch(BROOM_LOTTIE_URL)
      .then((r) => (r.ok ? (r.json() as Promise<object>) : null))
      .catch(() => null);
  }
  return lottieDataPromise;
}

const sizes = {
  sm: "h-10 w-10",
  md: "h-16 w-16",
  lg: "h-24 w-24",
} as const;

export interface SweeprLoaderProps {
  size?: keyof typeof sizes;
  /** Optional short line under the animation, e.g. "Loading your bookings". */
  label?: string;
  className?: string;
}

export function SweeprLoader({ size = "md", label, className }: SweeprLoaderProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    let disposed = false;
    let anim: { destroy(): void } | null = null;
    Promise.all([loadLottieData(), import("lottie-web/build/player/lottie_light")])
      .then(([data, mod]) => {
        if (disposed || !data || !boxRef.current) return;
        anim = mod.default.loadAnimation({
          container: boxRef.current,
          renderer: "svg",
          loop: true,
          autoplay: true,
          animationData: data,
        });
        setPlaying(true);
      })
      .catch(() => null);
    return () => {
      disposed = true;
      anim?.destroy();
    };
  }, [reducedMotion]);

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label ?? "Loading"}
      className={cn("flex flex-col items-center justify-center gap-3", className)}
    >
      <div className={cn("relative", sizes[size])}>
        <div ref={boxRef} className="absolute inset-0" aria-hidden />
        {!playing && (
          <div
            aria-hidden
            className="absolute inset-0 m-auto h-3/5 w-3/5 animate-spin rounded-full border-2 border-slate-200 border-t-seafoam-500 dark:border-slate-700 dark:border-t-seafoam-400"
          />
        )}
      </div>
      {label && <p className="text-sm text-slate-500">{label}</p>}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Full-viewport centered variant for page/splash loading states. */
export function SweeprLoaderScreen({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center">
      <SweeprLoader size="lg" label={label} />
    </div>
  );
}
