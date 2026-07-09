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
 * Cloudflare R2 presigned URL helper using AWS Signature V4.
 *
 * R2 is S3-compatible, so we mint standard S3 presigned URLs using the
 * R2 token credentials (R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY).
 * The bucket's public URL is via the custom domain configured in wrangler.toml.
 */

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrlBase: string; // e.g. https://media.getsweepr.com
}

const ALGORITHM = "AWS4-HMAC-SHA256";
const SERVICE = "s3";
const REGION = "auto";

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(key: ArrayBuffer | Uint8Array | CryptoKey, data: string): Promise<ArrayBuffer> {
  const k =
    key instanceof CryptoKey
      ? key
      : await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
}

async function sha256hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return toHex(buf);
}

async function signingKey(secretKey: string, date: string): Promise<ArrayBuffer> {
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secretKey}`), date);
  const kRegion = await hmac(kDate, REGION);
  const kService = await hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

export async function createPresignedUploadUrl(
  cfg: R2Config,
  objectKey: string,
  contentType: string,
  expiresInSeconds = 300,
): Promise<{ uploadUrl: string; storageKey: string; contentType: string }> {
  const now = new Date();
  const datestamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzdate = `${datestamp}T${now.toISOString().slice(11, 19).replace(/:/g, "")}Z`;

  const endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com`;
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const credentialScope = `${datestamp}/${REGION}/${SERVICE}/aws4_request`;
  const credential = `${cfg.accessKeyId}/${credentialScope}`;

  // Bind Content-Type into the signature. SigV4 requires signed headers to be
  // listed in the SignedHeaders param AND reproduced in the canonical headers
  // block, both sorted lexicographically (content-type < host). The client's
  // PUT must send EXACTLY this Content-Type or R2 rejects the signature — this
  // stops a caller from reusing a presigned URL to upload arbitrary content
  // types (e.g. text/html served back from our own domain).
  const signedContentType = contentType.toLowerCase();
  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": ALGORITHM,
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzdate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": "content-type;host",
  });

  const canonicalRequest = [
    "PUT",
    `/${cfg.bucket}/${objectKey}`,
    queryParams.toString(),
    `content-type:${signedContentType}\nhost:${host}\n`,
    "content-type;host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    ALGORITHM,
    amzdate,
    credentialScope,
    await sha256hex(canonicalRequest),
  ].join("\n");

  const key = await signingKey(cfg.secretAccessKey, datestamp);
  const sig = toHex(await hmac(key, stringToSign));

  queryParams.set("X-Amz-Signature", sig);

  const uploadUrl = `${endpoint}/${cfg.bucket}/${objectKey}?${queryParams.toString()}`;

  // Echo back the Content-Type the client MUST send on its PUT — it is part of
  // the signature, so any other value fails verification at R2.
  return { uploadUrl, storageKey: objectKey, contentType: signedContentType };
}

export function r2PublicUrl(cfg: R2Config, storageKey: string): string {
  return `${cfg.publicUrlBase}/${storageKey}`;
}

export function parseR2Config(env: {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  R2_PUBLIC_URL: string;
}): R2Config {
  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
    publicUrlBase: env.R2_PUBLIC_URL,
  };
}

export function parseR2LegalConfig(env: {
  R2_ACCOUNT_ID: string;
  R2_LEGAL_ACCESS_KEY_ID: string;
  R2_LEGAL_SECRET_ACCESS_KEY: string;
}): R2Config {
  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_LEGAL_ACCESS_KEY_ID,
    secretAccessKey: env.R2_LEGAL_SECRET_ACCESS_KEY,
    bucket: "sweepr-legal",
    publicUrlBase: "https://legalobjects.getsweepr.com",
  };
}
