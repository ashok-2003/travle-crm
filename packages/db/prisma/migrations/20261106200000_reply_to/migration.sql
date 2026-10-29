-- AlterTable
ALTER TABLE "whatsapp_message" ADD COLUMN     "quote_dropped" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quoted_message_id" UUID;

-- AddForeignKey
ALTER TABLE "whatsapp_message" ADD CONSTRAINT "whatsapp_message_organization_id_quoted_message_id_fkey" FOREIGN KEY ("organization_id", "quoted_message_id") REFERENCES "whatsapp_message"("organization_id", "id") ON DELETE NO ACTION ON UPDATE RESTRICT;
