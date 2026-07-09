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
 * Presigned R2 upload URLs must bind Content-Type into the signature so a
 * client cannot reuse the URL to PUT an arbitrary content type (e.g. text/html
 * served back from our own object domain). Previously only `host` was signed.
 */

import { describe, it, expect } from "vitest";
import { createPresignedUploadUrl, type R2Config } from "../../src/lib/r2";

const cfg: R2Config = {
  accountId: "acct123",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "secretExampleKey",
  bucket: "sweepr",
  publicUrlBase: "https://objects.getsweepr.com",
};

describe("createPresignedUploadUrl content-type binding", () => {
  it("signs content-type;host, not just host", async () => {
    const { uploadUrl } = await createPresignedUploadUrl(cfg, "bookings/a/1.png", "image/png");
    const signed = new URL(uploadUrl).searchParams.get("X-Amz-SignedHeaders");
    expect(signed).toBe("content-type;host");
  });

  it("returns the exact Content-Type the client must send", async () => {
    const res = await createPresignedUploadUrl(cfg, "bookings/a/1.jpg", "image/jpeg");
    expect(res.contentType).toBe("image/jpeg");
  });

  it("produces a different signature for a different content type (binding is real)", async () => {
    const png = await createPresignedUploadUrl(cfg, "bookings/a/1.bin", "image/png");
    const html = await createPresignedUploadUrl(cfg, "bookings/a/1.bin", "text/html");
    const sigPng = new URL(png.uploadUrl).searchParams.get("X-Amz-Signature");
    const sigHtml = new URL(html.uploadUrl).searchParams.get("X-Amz-Signature");
    expect(sigPng).not.toBe(sigHtml);
  });
});
