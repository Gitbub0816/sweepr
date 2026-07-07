/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- Public privacy intake: allow DSARs from people without accounts, and give
-- requests a free-text details field for the admin team.
ALTER TABLE privacy_requests ADD COLUMN IF NOT EXISTS requester_email TEXT;
ALTER TABLE privacy_requests ADD COLUMN IF NOT EXISTS details TEXT;
CREATE INDEX IF NOT EXISTS idx_privacy_requests_email ON privacy_requests (requester_email);
