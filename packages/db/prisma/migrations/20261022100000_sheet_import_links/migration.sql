-- The Google Sheets sync's links into imports: an import made from a sheet's rows names its connection, and its preview
-- may plan a row in_crm (someone who already has a lead), which the add takes only when the importer ticks it. A file's
-- import keeps both off, as before.

-- AlterTable
ALTER TABLE "import_batch" ADD COLUMN     "add_in_crm" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source_sheet_id" UUID;

-- CreateIndex
CREATE INDEX "import_batch_by_sheet" ON "import_batch"("organization_id", "source_sheet_id") WHERE (source_sheet_id IS NOT NULL);

ALTER TABLE "import_row"
  DROP CONSTRAINT import_row_plan_value,
  ADD CONSTRAINT import_row_plan_value CHECK (
    plan IN ('new', 'returning', 'enquiry', 'blocked', 'already_imported', 'in_crm', 'not_added'));
