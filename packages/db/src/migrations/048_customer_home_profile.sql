-- Migration 048: Customer home profile defaults + address link
-- These columns let the API pre-fill the booking flow for returning customers
-- and track whether first-time onboarding has been completed.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS home_bedrooms    INT,
  ADD COLUMN IF NOT EXISTS home_bathrooms   INT,
  ADD COLUMN IF NOT EXISTS home_sqft        INT,
  ADD COLUMN IF NOT EXISTS home_type        TEXT,
  ADD COLUMN IF NOT EXISTS has_pets         BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_address_id UUID REFERENCES addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarded        BOOLEAN DEFAULT false;
