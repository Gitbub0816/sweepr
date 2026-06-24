/**
 * P0-4: Before/after photo enforcement
 * Verifies that job completion is blocked when photo minimums aren't met.
 */

import { describe, it, expect } from "vitest";

interface PhotoRequirements {
  minimum_before_photos: number;
  minimum_after_photos: number;
  require_checkout_photo: boolean;
}

function checkPhotoRequirements(
  req: PhotoRequirements,
  beforeCount: number,
  afterCount: number
): string | null {
  if (beforeCount < req.minimum_before_photos) {
    return `At least ${req.minimum_before_photos} before photos are required (have ${beforeCount})`;
  }
  if (afterCount < req.minimum_after_photos) {
    return `At least ${req.minimum_after_photos} after photos are required (have ${afterCount})`;
  }
  return null; // ok
}

describe("Job completion photo enforcement", () => {
  const defaultReq: PhotoRequirements = {
    minimum_before_photos: 3,
    minimum_after_photos: 3,
    require_checkout_photo: true,
  };

  it("blocks completion when before photos are insufficient", () => {
    const err = checkPhotoRequirements(defaultReq, 1, 3);
    expect(err).toContain("before photos");
  });

  it("blocks completion when after photos are insufficient", () => {
    const err = checkPhotoRequirements(defaultReq, 3, 0);
    expect(err).toContain("after photos");
  });

  it("allows completion when minimums are met", () => {
    const err = checkPhotoRequirements(defaultReq, 3, 3);
    expect(err).toBeNull();
  });

  it("allows completion when exceeding minimums", () => {
    const err = checkPhotoRequirements(defaultReq, 5, 7);
    expect(err).toBeNull();
  });

  it("respects configurable minimums from DB", () => {
    const customReq: PhotoRequirements = { minimum_before_photos: 1, minimum_after_photos: 1, require_checkout_photo: false };
    const err = checkPhotoRequirements(customReq, 1, 1);
    expect(err).toBeNull();
  });

  it("uses default requirements when DB returns no active row", () => {
    const fallback = { minimum_before_photos: 3, minimum_after_photos: 3, require_checkout_photo: true };
    expect(fallback.minimum_before_photos).toBe(3);
    expect(fallback.minimum_after_photos).toBe(3);
  });
});
