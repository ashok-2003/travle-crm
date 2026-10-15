-- DropForeignKey
ALTER TABLE "outbox_event" DROP CONSTRAINT "outbox_event_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "share_link_open" DROP CONSTRAINT "share_link_open_organization_id_share_link_id_fkey";

-- AddForeignKey
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "share_link_open" ADD CONSTRAINT "share_link_open_organization_id_share_link_id_fkey" FOREIGN KEY ("organization_id", "share_link_id") REFERENCES "share_link"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
