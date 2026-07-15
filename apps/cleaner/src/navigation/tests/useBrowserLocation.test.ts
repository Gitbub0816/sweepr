/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { useBrowserLocation } from "../hooks/useBrowserLocation";

describe("useBrowserLocation", () => {
  it("reports unsupported when navigator.geolocation is absent", async () => {
    // @ts-expect-error deliberately removing geolocation for this test
    delete navigator.geolocation;

    const { result } = renderHook(() => useBrowserLocation(true));
    await waitFor(() => expect(result.current.permissionState).toBe("unsupported"));
    expect(result.current.location).toBeNull();
    cleanup();
  });

  it("surfaces permission-denied via the geolocation error callback", async () => {
    const clearWatch = vi.fn();
    const watchPosition = vi.fn((_success, error) => {
      error?.({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);
      return 1;
    });
    Object.defineProperty(navigator, "geolocation", {
      value: { watchPosition, clearWatch },
      configurable: true,
    });

    const { result } = renderHook(() => useBrowserLocation(true));
    await waitFor(() => expect(result.current.permissionState).toBe("denied"));
    expect(result.current.error).not.toBeNull();
    cleanup();
  });

  it("does not start watching when disabled", () => {
    const watchPosition = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      value: { watchPosition, clearWatch: vi.fn() },
      configurable: true,
    });

    renderHook(() => useBrowserLocation(false));
    expect(watchPosition).not.toHaveBeenCalled();
    cleanup();
  });

  it("clears the watch on unmount", () => {
    const clearWatch = vi.fn();
    const watchPosition = vi.fn(() => 42);
    Object.defineProperty(navigator, "geolocation", {
      value: { watchPosition, clearWatch },
      configurable: true,
    });

    const { unmount } = renderHook(() => useBrowserLocation(true));
    unmount();
    expect(clearWatch).toHaveBeenCalledWith(42);
  });
});
