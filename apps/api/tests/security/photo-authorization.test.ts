/**
 * P0-3: Photo upload authorization
 * Verifies that only the assigned cleaner/customer can upload photos,
 * and only during active job states.
 */

import { describe, it, expect } from "vitest";
import { canUploadPhotos } from "../../src/lib/bookingAuthorization";
import type { } from "../../src/lib/bookingAuthorization";

// Re-create the ctx shape for testing
function makeCtx(overrides: Partial<Parameters<typeof canUploadPhotos>[0]> = {}) {
  return {
    bookingId: "booking-uuid",
    isAdmin: false,
    isCleaner: false,
    isCustomer: false,
    bookingStatus: "confirmed",
    dayStatus: "in_progress",
    arrivalVerifiedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("canUploadPhotos", () => {
  it("allows admin always", () => {
    expect(canUploadPhotos(makeCtx({ isAdmin: true, dayStatus: null }))).toBe(true);
    expect(canUploadPhotos(makeCtx({ isAdmin: true, dayStatus: "en_route" }))).toBe(true);
  });

  it("allows cleaner during active states", () => {
    const activeStates = ["in_progress", "awaiting_checkout", "arrived", "en_route"];
    for (const state of activeStates) {
      expect(canUploadPhotos(makeCtx({ isCleaner: true, dayStatus: state }))).toBe(true);
    }
  });

  it("blocks cleaner before job starts", () => {
    expect(canUploadPhotos(makeCtx({ isCleaner: true, dayStatus: null }))).toBe(false);
    expect(canUploadPhotos(makeCtx({ isCleaner: true, dayStatus: "completed" }))).toBe(false);
  });

  it("allows customer during active states", () => {
    expect(canUploadPhotos(makeCtx({ isCustomer: true, dayStatus: "in_progress" }))).toBe(true);
  });

  it("blocks strangers regardless of job state", () => {
    expect(canUploadPhotos(makeCtx({ isAdmin: false, isCleaner: false, isCustomer: false, dayStatus: "in_progress" }))).toBe(false);
  });
});
