-- Migration 051: Add preferred_language to users table
-- Stores the user's selected UI language code.
-- Valid values match the SUPPORTED_CODES in apps/*/src/i18n/languages.ts.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_language TEXT
    CHECK (preferred_language IN ('en','es','vi','zh-Hans','zh-Hant','fil','ko','ar','pt','hi'))
    DEFAULT 'en';
