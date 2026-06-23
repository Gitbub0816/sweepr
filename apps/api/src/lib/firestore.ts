/**
 * Minimal Firestore REST client for Cloudflare Workers.
 *
 * Uses WebCrypto (available in Workers) to sign RS256 JWTs from the service
 * account, then exchanges them for short-lived OAuth2 access tokens.
 * Tokens are cached in module-level memory (valid 1 h, refreshed automatically).
 */

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

// Module-level token cache — survives across requests within the same isolate.
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeBase64url(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function importRsaKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function makeJwt(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = encodeBase64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const sigInput = `${header}.${payload}`;
  const key = await importRsaKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(sigInput)
  );
  return `${sigInput}.${base64url(sig)}`;
}

export async function getAccessToken(saJson: string): Promise<string> {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiresAt) return _cachedToken;

  const sa: ServiceAccount = JSON.parse(saJson);
  const jwt = await makeJwt(sa);

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Token exchange failed: ${await resp.text()}`);
  }

  const data = (await resp.json()) as { access_token: string; expires_in: number };
  _cachedToken = data.access_token;
  // Refresh 5 min before expiry
  _tokenExpiresAt = now + (data.expires_in - 300) * 1000;
  return _cachedToken;
}

// ---------------------------------------------------------------------------
// Firestore document helpers
// ---------------------------------------------------------------------------

type FirestoreValue =
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string };

interface FirestoreDocument {
  name?: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

function fsInt(n: number): { integerValue: string } {
  return { integerValue: String(n) };
}

function fsTimestamp(ms: number): { timestampValue: string } {
  return { timestampValue: new Date(ms).toISOString() };
}

function readInt(doc: FirestoreDocument, field: string): number {
  const v = doc.fields?.[field];
  if (!v || !("integerValue" in v)) return 0;
  return parseInt(v.integerValue, 10);
}

function readTimestamp(doc: FirestoreDocument, field: string): number {
  const v = doc.fields?.[field];
  if (!v || !("timestampValue" in v)) return 0;
  return new Date(v.timestampValue).getTime();
}

function docPath(project: string, collection: string, docId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${collection}/${encodeURIComponent(docId)}`;
}

export async function firestoreGet(
  saJson: string,
  project: string,
  collection: string,
  id: string
): Promise<FirestoreDocument | null> {
  const token = await getAccessToken(saJson);
  const resp = await fetch(docPath(project, collection, id), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Firestore GET failed: ${await resp.text()}`);
  return resp.json() as Promise<FirestoreDocument>;
}

export async function firestoreSet(
  saJson: string,
  project: string,
  collection: string,
  id: string,
  fields: Record<string, FirestoreValue>
): Promise<void> {
  const token = await getAccessToken(saJson);
  const resp = await fetch(
    `${docPath(project, collection, id)}?currentDocument.exists=false`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    }
  ).catch(() => null);

  // If document already exists (precondition failed), do a PATCH instead
  if (!resp || resp.status === 412 || resp.status === 409) {
    const patchResp = await fetch(docPath(project, collection, id), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });
    if (!patchResp.ok) throw new Error(`Firestore PATCH failed: ${await patchResp.text()}`);
    return;
  }
  if (!resp.ok) throw new Error(`Firestore SET failed: ${await resp.text()}`);
}

export { readInt, readTimestamp, fsInt, fsTimestamp };
export type { FirestoreDocument };
