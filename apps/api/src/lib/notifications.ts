import type { Sql } from "@sweepr/db";

export interface NotificationPayload {
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Persist a notification for a user and trigger any real-time delivery.
 *
 * Today this writes a row to the `notifications` table which the in-app
 * NotificationBell polls. The same entry point is where web-push / FCM
 * delivery would be fanned out once device tokens are stored.
 */
export async function sendNotification(
  db: Sql,
  userId: string,
  payload: NotificationPayload
): Promise<void> {
  await db`
    INSERT INTO notifications (user_id, type, title, body, read, data)
    VALUES (
      ${userId},
      ${payload.type},
      ${payload.title},
      ${payload.body},
      false,
      ${JSON.stringify(payload.data ?? {})}::jsonb
    )
  `;

  // Real-time delivery hook (web-push / FCM) would go here. We intentionally
  // swallow delivery failures so a missed push never blocks the core flow.
}
