-- A file sent again is stored once (2026-11-25): a copy names the attachment whose stored object holds its bytes. Only
-- adds a nullable column, its key and its index.
-- AlterTable
ALTER TABLE "attachment" ADD COLUMN     "stored_as_id" UUID;

-- CreateIndex
CREATE INDEX "attachment_organization_id_stored_as_id_idx" ON "attachment"("organization_id", "stored_as_id");

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_organization_id_stored_as_id_fkey" FOREIGN KEY ("organization_id", "stored_as_id") REFERENCES "attachment"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
