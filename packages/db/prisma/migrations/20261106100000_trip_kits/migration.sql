-- CreateTable
CREATE TABLE "trip_kit" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "auto_send" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "trip_kit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_kit_send" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "trip_kit_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "sent_by" UUID,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_kit_send_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trip_kit_organization_id_id_key" ON "trip_kit"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_kit_live_name" ON "trip_kit"("organization_id", "name") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE INDEX "trip_kit_send_chat" ON "trip_kit_send"("organization_id", "conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_kit_send_organization_id_id_key" ON "trip_kit_send"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_kit_send_keyword_once" ON "trip_kit_send"("organization_id", "trip_kit_id", "conversation_id") WHERE (source = 'keyword'::text);

-- AddForeignKey
ALTER TABLE "trip_kit" ADD CONSTRAINT "trip_kit_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "trip_kit_send" ADD CONSTRAINT "trip_kit_send_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "trip_kit_send" ADD CONSTRAINT "trip_kit_send_organization_id_trip_kit_id_fkey" FOREIGN KEY ("organization_id", "trip_kit_id") REFERENCES "trip_kit"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "trip_kit_send" ADD CONSTRAINT "trip_kit_send_organization_id_conversation_id_fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "whatsapp_conversation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Fixed values and sizes (trip details).
ALTER TABLE "trip_kit"
  ADD CONSTRAINT trip_kit_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
  ADD CONSTRAINT trip_kit_message_length CHECK (char_length(message) <= 4096),
  ADD CONSTRAINT trip_kit_keywords CHECK (keywords IS NOT NULL AND cardinality(keywords) <= 20);
ALTER TABLE "trip_kit_send"
  ADD CONSTRAINT trip_kit_send_source_value CHECK (source IN ('manual', 'keyword')),
  ADD CONSTRAINT trip_kit_send_messages CHECK (messages >= 0);

-- A trip's details are soft-deleted (ADR 0004), and a send is the record of what went to a chat: the runtime role removes
-- neither; erasure and purge, the platform's, do.
REVOKE DELETE ON TABLE "trip_kit", "trip_kit_send" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('trip_kit');
SELECT app_enable_org_rls('trip_kit_send');
