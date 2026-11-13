-- Ads that bring chats (WhatsApp agent setup, task 4): a click-to-WhatsApp ad is noted while its first message is
-- processed (the raw webhook is blanked after 7 days), linked to the chat, and the agency links it to a package.
CREATE TABLE "whatsapp_ad" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "ad_key" TEXT NOT NULL,
    "headline" TEXT,
    "source_url" TEXT,
    "package_id" UUID,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "whatsapp_ad_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "whatsapp_conversation" ADD COLUMN "ad_id" UUID;

CREATE UNIQUE INDEX "whatsapp_ad_organization_id_id_key" ON "whatsapp_ad"("organization_id", "id");
CREATE UNIQUE INDEX "whatsapp_ad_key" ON "whatsapp_ad"("organization_id", "ad_key");
CREATE INDEX "whatsapp_conversation_ad" ON "whatsapp_conversation"("organization_id", "ad_id") WHERE "ad_id" IS NOT NULL;

ALTER TABLE "whatsapp_ad" ADD CONSTRAINT "whatsapp_ad_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "whatsapp_ad" ADD CONSTRAINT "whatsapp_ad_organization_id_package_id_fkey" FOREIGN KEY ("organization_id", "package_id") REFERENCES "quote_template"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "whatsapp_conversation" ADD CONSTRAINT "whatsapp_conversation_organization_id_ad_id_fkey" FOREIGN KEY ("organization_id", "ad_id") REFERENCES "whatsapp_ad"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "whatsapp_ad"
  ADD CONSTRAINT whatsapp_ad_key_length CHECK (char_length(ad_key) BETWEEN 1 AND 300),
  ADD CONSTRAINT whatsapp_ad_headline_length CHECK (headline IS NULL OR char_length(headline) <= 300),
  ADD CONSTRAINT whatsapp_ad_source_url_length CHECK (source_url IS NULL OR char_length(source_url) <= 2000);

-- An ad is noted and linked, never removed by the runtime role; the platform's purge does.
REVOKE DELETE ON TABLE "whatsapp_ad" FROM app_runtime;

SELECT app_enable_org_rls('whatsapp_ad');
