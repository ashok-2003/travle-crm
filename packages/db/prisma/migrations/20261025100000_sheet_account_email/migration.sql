-- The service account a sheet was shared with is named by its address as well as its place in the list (SC9): a list that
-- was reordered or shortened is then caught when the worker starts, not found as sheets that cannot be opened.
ALTER TABLE "sheet_connection" ADD COLUMN "service_account_email" TEXT;
ALTER TABLE "sheet_check_schedule" ADD COLUMN "service_account_email" TEXT;
