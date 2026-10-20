-- A sheet's rows already there at connect keep a fingerprint too (spec 6.5, S23): a column inserted, deleted or moved
-- changes every row's hash, and the row read again is then known by what it holds, not as a new enquiry. The fingerprint
-- of such a row is stored keyed (HMAC), never plain.
ALTER TABLE "sheet_row" DROP CONSTRAINT sheet_row_fingerprint_status;
ALTER TABLE "sheet_row"
  ADD CONSTRAINT sheet_row_fingerprint_status CHECK (
    fingerprint IS NULL OR status IN ('before_connect', 'added', 'merged', 'duplicate', 'erased'));
