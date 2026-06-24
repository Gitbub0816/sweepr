/**
 * AES-GCM encryption for sensitive at-rest fields (access codes, key instructions).
 *
 * Key derivation: SHA-256 of the raw secret bytes — produces a deterministic
 * 256-bit key without padding/truncation artifacts.
 *
 * All operations use the Web Crypto API (available in Cloudflare Workers runtime).
 */

interface EncryptedPayload {
  v: number;
  iv: number[];
  data: number[];
}

async function importKey(secret: string): Promise<CryptoKey> {
  const encoded = new TextEncoder().encode(secret);
  // Derive a 256-bit key via SHA-256 — avoids pad/truncate key-length artifacts.
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSecret(plaintext: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const payload: EncryptedPayload = {
    v: 1,
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(payload);
}

export async function decryptSecret(ciphertext: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const payload = JSON.parse(ciphertext) as EncryptedPayload;
  const iv = new Uint8Array(payload.iv);
  const data = new Uint8Array(payload.data);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(plaintext);
}

/**
 * Validate that the encryption key is available for the current environment.
 * In production, a missing key is a hard error — we never fall back to plaintext.
 * In development, a missing key emits a loud warning but continues.
 */
export function requireEncryptionKey(
  key: string | undefined,
  environment: string | undefined
): string {
  if (key) return key;
  if (environment === "development" || environment === "test") {
    console.warn(
      "[WARN] ACCESS_CODE_ENCRYPTION_KEY is not set. " +
      "Access codes will be stored as plaintext. " +
      "This is only acceptable in development."
    );
    return "";
  }
  throw new Error(
    "ACCESS_CODE_ENCRYPTION_KEY is required in production. " +
    "Set it with: wrangler secret put ACCESS_CODE_ENCRYPTION_KEY"
  );
}
