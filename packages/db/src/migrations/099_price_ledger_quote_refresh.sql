/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- 099_price_ledger_quote_refresh.sql
-- Admit a 'quote_refresh' event type on booking_price_ledger.
--
-- When a customer double-submits the booking (same slot, possibly new room
-- conditions/add-ons), the losing concurrent request reprices the existing
-- pre-payment draft to the freshly computed total. That total change must be
-- recorded on the append-only ledger like every other price change
-- (convention 5) instead of silently diverging booking.total_price from the
-- ledger's running total.

ALTER TABLE booking_price_ledger DROP CONSTRAINT IF EXISTS booking_price_ledger_event_type_check;
ALTER TABLE booking_price_ledger ADD CONSTRAINT booking_price_ledger_event_type_check
  CHECK (event_type IN (
    'initial_quote', 'addon_purchase', 'level_surcharge', 'additional_attention_fee',
    'refusal_fee', 'admin_adjustment', 'tax_adjustment', 'coupon_discount',
    'smart_entry_fee', 'membership_discount', 'quote_refresh'
  ));
