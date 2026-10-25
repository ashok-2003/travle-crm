-- AlterTable
ALTER TABLE "whatsapp_conversation" ADD COLUMN     "snoozed_by" UUID,
ADD COLUMN     "snoozed_until" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "whatsapp_message" ADD COLUMN     "broadcast_id" UUID,
ADD COLUMN     "starred_at" TIMESTAMPTZ(6),
ADD COLUMN     "starred_by" UUID;

-- CreateTable
CREATE TABLE "conversation_note" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_message" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "send_at" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failure_code" TEXT,
    "message_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_automation" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "away_enabled" BOOLEAN NOT NULL DEFAULT false,
    "away_message" TEXT NOT NULL DEFAULT '',
    "open_from" INTEGER NOT NULL DEFAULT 600,
    "open_until" INTEGER NOT NULL DEFAULT 1140,
    "open_days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "welcome_enabled" BOOLEAN NOT NULL DEFAULT false,
    "welcome_message" TEXT NOT NULL DEFAULT '',
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inbox_automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_keyword_reply" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "keyword" TEXT NOT NULL,
    "reply" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "inbox_keyword_reply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_broadcast" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "params" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'queued',
    "total" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_note_chat" ON "conversation_note"("organization_id", "conversation_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_note_organization_id_id_key" ON "conversation_note"("organization_id", "id");

-- CreateIndex
CREATE INDEX "scheduled_message_chat" ON "scheduled_message"("organization_id", "conversation_id");

-- CreateIndex
CREATE INDEX "scheduled_message_due" ON "scheduled_message"("organization_id", "send_at") WHERE (status = 'pending'::text);

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_message_organization_id_id_key" ON "scheduled_message"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_automation_organization_id_id_key" ON "inbox_automation"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_automation_one" ON "inbox_automation"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_keyword_reply_organization_id_id_key" ON "inbox_keyword_reply"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_keyword_reply_live" ON "inbox_keyword_reply"("organization_id", "keyword") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE INDEX "whatsapp_broadcast_recent" ON "whatsapp_broadcast"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_broadcast_organization_id_id_key" ON "whatsapp_broadcast"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "conversation_note" ADD CONSTRAINT "conversation_note_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "conversation_note" ADD CONSTRAINT "conversation_note_organization_id_conversation_id_fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "whatsapp_conversation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "scheduled_message" ADD CONSTRAINT "scheduled_message_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "scheduled_message" ADD CONSTRAINT "scheduled_message_organization_id_conversation_id_fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "whatsapp_conversation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inbox_automation" ADD CONSTRAINT "inbox_automation_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inbox_keyword_reply" ADD CONSTRAINT "inbox_keyword_reply_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_broadcast" ADD CONSTRAINT "whatsapp_broadcast_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Fixed values and sizes (sales inbox spec, section 6).
ALTER TABLE "conversation_note"
  ADD CONSTRAINT conversation_note_body_length CHECK (char_length(body) BETWEEN 1 AND 2000),
  ADD CONSTRAINT conversation_note_mentions CHECK (cardinality(mentions) <= 20);
ALTER TABLE "scheduled_message"
  ADD CONSTRAINT scheduled_message_status_value CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  ADD CONSTRAINT scheduled_message_body_length CHECK (char_length(body) BETWEEN 1 AND 4096),
  ADD CONSTRAINT scheduled_message_failure_length CHECK (char_length(coalesce(failure_code, '')) <= 100);
ALTER TABLE "inbox_automation"
  ADD CONSTRAINT inbox_automation_hours CHECK (
    open_from BETWEEN 0 AND 1439 AND open_until BETWEEN 1 AND 1440 AND open_from < open_until
    AND open_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]),
  ADD CONSTRAINT inbox_automation_text_lengths CHECK (
    char_length(away_message) <= 1000 AND char_length(welcome_message) <= 1000);
ALTER TABLE "inbox_keyword_reply"
  ADD CONSTRAINT inbox_keyword_reply_keyword_format CHECK (keyword = lower(keyword) AND char_length(keyword) BETWEEN 2 AND 40),
  ADD CONSTRAINT inbox_keyword_reply_length CHECK (char_length(reply) BETWEEN 1 AND 1000);
ALTER TABLE "whatsapp_broadcast"
  ADD CONSTRAINT whatsapp_broadcast_status_value CHECK (status IN ('queued', 'sending', 'done')),
  ADD CONSTRAINT whatsapp_broadcast_counts CHECK (total >= 0 AND sent >= 0 AND skipped >= 0),
  ADD CONSTRAINT whatsapp_broadcast_params CHECK (cardinality(params) <= 10);

-- A team note is never changed or removed by the runtime role (it is the record of what the team said); keyword replies
-- are soft-deleted (ADR 0004); scheduled sends and broadcasts end in a status, never a delete.
REVOKE UPDATE, DELETE ON TABLE "conversation_note" FROM app_runtime;
REVOKE DELETE ON TABLE "scheduled_message", "inbox_automation", "inbox_keyword_reply", "whatsapp_broadcast" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('conversation_note');
SELECT app_enable_org_rls('scheduled_message');
SELECT app_enable_org_rls('inbox_automation');
SELECT app_enable_org_rls('inbox_keyword_reply');
SELECT app_enable_org_rls('whatsapp_broadcast');
