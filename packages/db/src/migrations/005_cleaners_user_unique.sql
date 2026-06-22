-- Add missing unique constraint on cleaners.user_id
-- Required for ON CONFLICT upsert patterns across the codebase.
ALTER TABLE cleaners ADD CONSTRAINT cleaners_user_id_unique UNIQUE (user_id);
ALTER TABLE customers ADD CONSTRAINT IF NOT EXISTS customers_user_id_unique UNIQUE (user_id);
