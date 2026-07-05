-- Persist the customer-selected 2-hour arrival window on the booking.
-- scheduled_at continues to be the authoritative "cleaner arrives at" instant
-- (set to the window start when a window is chosen); these columns let the
-- cleaner and customer apps show the window itself.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS arrival_window_start TIME;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS arrival_window_end TIME;
