-- Migration 050: Add unique constraints so ON CONFLICT (user_id) works
-- for lazy-provisioning in the API routes.
ALTER TABLE customers ADD CONSTRAINT customers_user_id_unique UNIQUE (user_id);
ALTER TABLE cleaners  ADD CONSTRAINT cleaners_user_id_unique  UNIQUE (user_id);
