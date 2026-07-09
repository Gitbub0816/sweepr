/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

export interface Box {
  id: string;
  address: string;
  name: string;
  unread?: number;
  inboxCount?: number;
  sentCount?: number;
  /** legacy field kept for backward compat with older API responses */
  total?: number;
}

export type Folder = "inbox" | "sent" | "archive";

export interface Message {
  id: string;
  direction: "inbound" | "outbound";
  sender_email: string;
  sender_name: string | null;
  to_email: string | null;
  cc_email?: string | null;
  subject: string;
  body_text: string;
  body_html?: string | null;
  read_at: string | null;
  archived_at?: string | null;
  in_reply_to: string | null;
  created_at: string;
  sent_by_email?: string | null;
}

export interface Grant {
  id: string;
  user_id: string;
  mailbox: string;
  email: string;
  granted_by_email: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  admin_role: string | null;
}

export interface ComposeState {
  open: boolean;
  mode: "new" | "reply" | "reply-all" | "forward";
  to: string;
  cc: string;
  subject: string;
  body: string;
  inReplyTo?: string;
}

export const EMPTY_COMPOSE: ComposeState = {
  open: false,
  mode: "new",
  to: "",
  cc: "",
  subject: "",
  body: "",
};
