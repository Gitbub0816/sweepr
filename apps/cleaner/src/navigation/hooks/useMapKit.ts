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
import { createMapKitMap, type MapKitMapHandle } from "../map/createMapKitMap";
import type { Coordinate } from "../types/navigation";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

export type UseMapKitStatus = "loading" | "ready" | "error";

export interface UseMapKitResult {
  containerRef: React.RefObject<HTMLDivElement>;
  status: UseMapKitStatus;
  /** The live map/mapkit handle — stable across re-renders, only null before
   *  the map is ready or after unmount. Read via ref, not React state, so
   *  callers driving per-frame updates don't need to re-subscribe. */
  handleRef: React.RefObject<MapKitMapHandle | null>;
}

/**
 * Thin hook wrapping createMapKitMap + cleanup. The map instance itself lives
 * in a ref and is created exactly once per mount (keyed only by the initial
 * center) — it is never recreated on unrelated re-renders.
 */
export function useMapKit(initialCenter: Coordinate): UseMapKitResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MapKitMapHandle | null>(null);
  const [status, setStatus] = useState<UseMapKitStatus>("loading");

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    createMapKitMap({
      apiBase: API,
      container: containerRef.current,
      center: initialCenter,
    })
      .then((handle) => {
        if (cancelled) {
          handle.destroy();
          return;
        }
        handleRef.current = handle;
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // Intentionally NOT depending on initialCenter's identity beyond mount —
    // the map should not be torn down and recreated just because the caller
    // passed a new object with the same conceptual starting point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { containerRef, status, handleRef };
}
