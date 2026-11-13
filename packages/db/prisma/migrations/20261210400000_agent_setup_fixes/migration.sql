-- Fixes after the agent setup page's final review: a chat's latest ad (the AI opens with the package of the ad it came
-- from last, while ad_id stays the first, which the ads list counts), the UPI ID's format held by the database as the
-- contract holds it, and the runtime role's update on an ad narrowed to the columns the code changes.
ALTER TABLE "whatsapp_conversation" ADD COLUMN "last_ad_id" UUID;
UPDATE "whatsapp_conversation" SET "last_ad_id" = "ad_id" WHERE "ad_id" IS NOT NULL;
ALTER TABLE "whatsapp_conversation" ADD CONSTRAINT "whatsapp_conversation_organization_id_last_ad_id_fkey" FOREIGN KEY ("organization_id", "last_ad_id") REFERENCES "whatsapp_ad"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "organization_profile"
  ADD CONSTRAINT organization_profile_upi_id_format CHECK (upi_id IS NULL OR upi_id ~ '^[a-zA-Z0-9._-]{2,100}@[a-zA-Z][a-zA-Z0-9]{1,64}$');

REVOKE UPDATE ON TABLE "whatsapp_ad" FROM app_runtime;
GRANT UPDATE ("headline", "source_url", "package_id", "last_seen_at") ON TABLE "whatsapp_ad" TO app_runtime;
