-- A file is stored once (2026-11-25): a copy names the attachment whose stored object holds its bytes, and a holder whose
-- bytes the server had keeps their SHA-256, so the same bytes stored again are found. Only adds nullable columns, a key
-- and indexes.
-- AlterTable
ALTER TABLE "attachment" ADD COLUMN     "content_sha256" TEXT,
ADD COLUMN     "stored_as_id" UUID;

-- CreateIndex
CREATE INDEX "attachment_organization_id_stored_as_id_idx" ON "attachment"("organization_id", "stored_as_id");

-- CreateIndex
CREATE INDEX "attachment_organization_id_content_sha256_idx" ON "attachment"("organization_id", "content_sha256");

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_organization_id_stored_as_id_fkey" FOREIGN KEY ("organization_id", "stored_as_id") REFERENCES "attachment"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
