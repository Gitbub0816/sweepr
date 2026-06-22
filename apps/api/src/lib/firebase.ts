/**
 * Firebase Storage signed-URL helper.
 *
 * In Workers we avoid the Firebase Admin Node SDK (it relies on Node crypto
 * internals). Instead we mint a V4 signed URL using the service account.
 * This is a minimal stub of that flow — wire up a proper signer before
 * production use.
 */
export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

export function parseServiceAccount(raw: string): ServiceAccount {
  // Accept either a base64-encoded JSON string (GitHub/Cloudflare secret) or
  // a plain JSON string (local dev).
  let json = raw.trim();
  if (!json.startsWith("{")) {
    json = atob(json);
  }
  return JSON.parse(json) as ServiceAccount;
}

export interface SignUploadInput {
  bucket: string;
  objectPath: string;
  contentType: string;
  expiresInSeconds?: number;
}

/**
 * Returns a (stubbed) signed upload URL. Replace the body with a real V4
 * signing implementation (e.g. using Web Crypto) when deploying.
 */
export async function createSignedUploadUrl(
  account: ServiceAccount,
  input: SignUploadInput
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const bucket = input.bucket || `${account.project_id}.appspot.com`;
  const encoded = encodeURIComponent(input.objectPath);
  return {
    uploadUrl: `https://storage.googleapis.com/${bucket}/${input.objectPath}?x-stub-signed=1`,
    publicUrl: `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media`,
  };
}
