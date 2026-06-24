/**
 * AES-GCM encryption for sensitive at-rest fields (access codes, key instructions).
 * Key is derived from the ACCESS_CODE_SECRET env var via HKDF / raw import.
 *
 * All operations use the Web Crypto API available in the Cloudflare Workers runtime.
 */

interface EncryptedPayload {
  v: number;
  iv: number[];
  data: number[];
}

async function importKey(secret: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
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
