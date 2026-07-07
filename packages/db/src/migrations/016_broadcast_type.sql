/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- Add broadcast_type to broadcast_sends for categorising outgoing messages.
ALTER TABLE broadcast_sends
  ADD COLUMN IF NOT EXISTS broadcast_type TEXT NOT NULL DEFAULT 'announcement';
