-- The agency's UPI QR is verified once someone scans it, pays ₹1 and sees it arrive: when, by whom (a user id, with no
-- key, like updated_by: the sign-in tables are not for organization tables to point at) and which UPI id. All three or none.
-- It only adds; undoing it drops the three columns and the check.

-- Altering a table every quote page reads: wait at most 5 s for its lock, rather than queueing every query behind it.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "quote_settings"
  ADD COLUMN "upi_verified_at" TIMESTAMPTZ(6),
  ADD COLUMN "upi_verified_by" UUID,
  ADD COLUMN "upi_verified_upi_id" TEXT,
  ADD CONSTRAINT quote_settings_upi_verified_together CHECK (
    (upi_verified_at IS NULL AND upi_verified_by IS NULL AND upi_verified_upi_id IS NULL)
    OR (upi_verified_at IS NOT NULL AND upi_verified_by IS NOT NULL AND upi_verified_upi_id IS NOT NULL)
  );
