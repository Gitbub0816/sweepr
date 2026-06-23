/**
 * Firebase Cloud Messaging (FCM) v1 REST API helper.
 *
 * Uses the same service-account JWT flow as firestore.ts so no Node-only
 * dependencies are needed in the Cloudflare Worker runtime.
 */
import { getAccessToken } from "./firestore";

export interface FcmMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  /** iOS badge count */
  badge?: number;
}

/**
 * Send a single push notification via FCM v1.
 * Returns true on success, false if the token is no longer valid (caller
 * should remove it from the DB), throws on transient errors.
 */
export async function sendPush(saJson: string, msg: FcmMessage): Promise<boolean> {
  const project = (JSON.parse(saJson) as { project_id: string }).project_id;
  const token = await getAccessToken(saJson);

  const body = {
    message: {
      token: msg.token,
      notification: { title: msg.title, body: msg.body },
      data: msg.data ?? {},
      android: { priority: "high" },
      apns: {
        payload: {
          aps: {
            alert: { title: msg.title, body: msg.body },
            badge: msg.badge ?? 1,
            sound: "default",
          },
        },
      },
    },
  };

  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${project}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (resp.status === 404 || resp.status === 410) {
    // UNREGISTERED or NOT_FOUND — token is stale, caller should delete it
    return false;
  }
  if (!resp.ok) {
    throw new Error(`FCM send failed ${resp.status}: ${await resp.text()}`);
  }
  return true;
}

/**
 * Fan out a notification to multiple device tokens.
 * Invalid tokens are returned so the caller can purge them.
 */
export async function sendPushMulti(
  saJson: string,
  tokens: string[],
  msg: Omit<FcmMessage, "token">
): Promise<{ staleTokens: string[] }> {
  const staleTokens: string[] = [];
  await Promise.all(
    tokens.map(async (t) => {
      try {
        const valid = await sendPush(saJson, { ...msg, token: t });
        if (!valid) staleTokens.push(t);
      } catch {
        // Transient error — keep the token for next time
      }
    })
  );
  return { staleTokens };
}
