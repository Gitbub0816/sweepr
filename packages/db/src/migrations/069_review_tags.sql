/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- Migration 069: review quality tags.
--
-- The customer review UI collects quality tags ("Arrived on time", "Very
-- thorough", …) and the public cleaner-reviews endpoint already SELECTs a
-- `tags` column — but it never existed, so that read would 500 and the
-- submitted tags were silently dropped. Add the column (text array).
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
