// Client-side upload helpers. We never embed Firebase credentials in the
// browser — instead we ask the API for a short-lived signed upload URL and
// PUT the file straight to storage.

const API_URL =
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL) ||
  "http://localhost:8787";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

interface SignResponse {
  uploadUrl: string;
  publicUrl: string;
}

function validate(file: File): void {
  if (!ALLOWED.includes(file.type)) {
    throw new Error("Only image files are allowed");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("File must be 10MB or smaller");
  }
}

async function signAndUpload(
  file: File,
  scope: "booking" | "avatar",
  refId: string,
  purpose: "booking_photo" | "cleaner_avatar",
  getToken: () => Promise<string | null>
): Promise<string> {
  validate(file);
  const token = await getToken();

  const signRes = await fetch(`${API_URL}/storage/sign-upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      scope,
      purpose,
      refId,
      ...(scope === "booking" ? { bookingId: refId } : { cleanerId: refId }),
    }),
  });
  if (!signRes.ok) throw new Error("Failed to get upload URL");
  const { uploadUrl, publicUrl } = (await signRes.json()) as SignResponse;

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error("Upload failed");

  return publicUrl;
}

export function uploadBookingPhoto(
  file: File,
  bookingId: string,
  getToken: () => Promise<string | null> = async () => null
): Promise<string> {
  return signAndUpload(file, "booking", bookingId, "booking_photo", getToken);
}

export function uploadCleanerAvatar(
  file: File,
  cleanerId: string,
  getToken: () => Promise<string | null> = async () => null
): Promise<string> {
  return signAndUpload(file, "avatar", cleanerId, "cleaner_avatar", getToken);
}
