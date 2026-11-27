-- The Bookings and Quotes lists export as files too (bookings revamp, 2026-11-27): an export's kind may now be bookings or
-- quotes besides leads and staff. It only widens the check; undoing it narrows the check again once no export of either
-- kind is left.

-- data_export is small and seldom written: wait at most 5 s for its lock, rather than queueing anything behind it.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "data_export" DROP CONSTRAINT data_export_kind_value;
ALTER TABLE "data_export"
  ADD CONSTRAINT data_export_kind_value CHECK (kind IN ('leads', 'staff', 'bookings', 'quotes'));
