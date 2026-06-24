const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

export type DayStatus =
  | "confirmed"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "awaiting_checkout"
  | "completed";

export type DemoAction =
  | "start_route"
  | "simulate_arrival"
  | "start_clean"
  | "add_photo"
  | "finish_clean"
  | "checkout"
  | "reset";

export interface SessionState {
  txId: string;
  dayStatus: DayStatus;
  photoCount: number;
  accessCodeRevealed: boolean;
  createdAt: string;
  updatedAt: string;
  cleaner: { name: string; rating: number; jobs: number };
  customer: { name: string; address: string };
  job: { service_type: string; scheduled_at: string; price: number; access_code: { type: string; value: string; notes: string } };
}

export async function createSession(): Promise<{ txId: string }> {
  const res = await fetch(`${API}/service/seed`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to create session");
  return res.json() as Promise<{ txId: string }>;
}

export async function getSession(txId: string): Promise<SessionState> {
  const res = await fetch(`${API}/service/t/${txId}`);
  if (!res.ok) throw new Error("Session not found");
  return res.json() as Promise<SessionState>;
}

export async function sendAction(txId: string, action: DemoAction): Promise<void> {
  const res = await fetch(`${API}/service/t/${txId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    const err = await res.json() as { error?: string };
    throw new Error(err.error ?? "Action failed");
  }
}
