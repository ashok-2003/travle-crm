-- The review's two indexes (M6, M7): the console's sweep finds exports still making a day after they were asked for
-- on their own, and an erasure finds a removed member's import rows without reading the whole table.

-- CreateIndex
CREATE INDEX "data_export_making" ON "data_export"("created_at") WHERE (status = 'making'::text);

-- CreateIndex
CREATE INDEX "import_row_member" ON "import_row"("organization_id", "member_id") WHERE (member_id IS NOT NULL);
