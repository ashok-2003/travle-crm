-- AlterTable
ALTER TABLE "whatsapp_conversation" ADD COLUMN     "archived_at" TIMESTAMPTZ(6),
ADD COLUMN     "pinned_at" TIMESTAMPTZ(6),
ADD COLUMN     "snoozed_by" UUID,
ADD COLUMN     "snoozed_until" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "whatsapp_message" ADD COLUMN     "broadcast_id" UUID,
ADD COLUMN     "starred_at" TIMESTAMPTZ(6),
ADD COLUMN     "starred_by" UUID;

-- CreateTable
CREATE TABLE "inbox_tag" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "inbox_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_tag" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_quick_reply" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "shortcut" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "inbox_quick_reply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_read" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversation_read_pkey" PRIMARY KEY ("id")
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
    "request_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "params" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'sending',
    "paused_reason" TEXT,
    "paused_at" TIMESTAMPTZ(6),
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_broadcast_tag" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "broadcast_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "whatsapp_broadcast_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_broadcast_recipient" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "broadcast_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'waiting',
    "reason" TEXT,
    "not_before" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_broadcast_recipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inbox_tag_organization_id_id_key" ON "inbox_tag"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_tag_live_name" ON "inbox_tag"("organization_id", "name") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE INDEX "conversation_tag_by_tag" ON "conversation_tag"("organization_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_tag_organization_id_id_key" ON "conversation_tag"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_tag_once" ON "conversation_tag"("organization_id", "conversation_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_quick_reply_organization_id_id_key" ON "inbox_quick_reply"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_quick_reply_live_shortcut" ON "inbox_quick_reply"("organization_id", "shortcut") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE INDEX "conversation_read_by_user" ON "conversation_read"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_read_organization_id_id_key" ON "conversation_read"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_read_once" ON "conversation_read"("organization_id", "conversation_id", "user_id");

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

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_broadcast_request" ON "whatsapp_broadcast"("organization_id", "request_id");

-- CreateIndex
CREATE INDEX "whatsapp_broadcast_tag_by_tag" ON "whatsapp_broadcast_tag"("organization_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_broadcast_tag_organization_id_id_key" ON "whatsapp_broadcast_tag"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_broadcast_tag_once" ON "whatsapp_broadcast_tag"("organization_id", "broadcast_id", "tag_id");

-- CreateIndex
CREATE INDEX "whatsapp_broadcast_recipient_state" ON "whatsapp_broadcast_recipient"("organization_id", "broadcast_id", "state");

-- CreateIndex
CREATE INDEX "whatsapp_broadcast_recipient_due" ON "whatsapp_broadcast_recipient"("organization_id", "not_before") WHERE (state = 'waiting'::text);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_broadcast_recipient_organization_id_id_key" ON "whatsapp_broadcast_recipient"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_broadcast_recipient_once" ON "whatsapp_broadcast_recipient"("organization_id", "broadcast_id", "conversation_id");

-- CreateIndex
CREATE INDEX "whatsapp_conversation_snoozed" ON "whatsapp_conversation"("organization_id", "snoozed_until") WHERE (snoozed_until IS NOT NULL);

-- CreateIndex
CREATE INDEX "whatsapp_message_broadcast" ON "whatsapp_message"("organization_id", "broadcast_id") WHERE (broadcast_id IS NOT NULL);

-- AddForeignKey
ALTER TABLE "inbox_tag" ADD CONSTRAINT "inbox_tag_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "conversation_tag" ADD CONSTRAINT "conversation_tag_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "conversation_tag" ADD CONSTRAINT "conversation_tag_organization_id_conversation_id_fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "whatsapp_conversation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "conversation_tag" ADD CONSTRAINT "conversation_tag_organization_id_tag_id_fkey" FOREIGN KEY ("organization_id", "tag_id") REFERENCES "inbox_tag"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inbox_quick_reply" ADD CONSTRAINT "inbox_quick_reply_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "conversation_read" ADD CONSTRAINT "conversation_read_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "conversation_read" ADD CONSTRAINT "conversation_read_organization_id_conversation_id_fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "whatsapp_conversation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "scheduled_message" ADD CONSTRAINT "scheduled_message_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "scheduled_message" ADD CONSTRAINT "scheduled_message_organization_id_conversation_id_fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "whatsapp_conversation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "scheduled_message" ADD CONSTRAINT "scheduled_message_organization_id_message_id_fkey" FOREIGN KEY ("organization_id", "message_id") REFERENCES "whatsapp_message"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inbox_automation" ADD CONSTRAINT "inbox_automation_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inbox_keyword_reply" ADD CONSTRAINT "inbox_keyword_reply_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_broadcast" ADD CONSTRAINT "whatsapp_broadcast_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_broadcast" ADD CONSTRAINT "whatsapp_broadcast_organization_id_template_id_fkey" FOREIGN KEY ("organization_id", "template_id") REFERENCES "whatsapp_template"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_broadcast_tag" ADD CONSTRAINT "whatsapp_broadcast_tag_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_broadcast_tag" ADD CONSTRAINT "whatsapp_broadcast_tag_organization_id_broadcast_id_fkey" FOREIGN KEY ("organization_id", "broadcast_id") REFERENCES "whatsapp_broadcast"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_broadcast_tag" ADD CONSTRAINT "whatsapp_broadcast_tag_organization_id_tag_id_fkey" FOREIGN KEY ("organization_id", "tag_id") REFERENCES "inbox_tag"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_broadcast_recipient" ADD CONSTRAINT "whatsapp_broadcast_recipient_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_broadcast_recipient" ADD CONSTRAINT "whatsapp_broadcast_recipient_organization_id_broadcast_id_fkey" FOREIGN KEY ("organization_id", "broadcast_id") REFERENCES "whatsapp_broadcast"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_broadcast_recipient" ADD CONSTRAINT "whatsapp_broadcast_recipient_organization_id_conversation__fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "whatsapp_conversation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_broadcast_recipient" ADD CONSTRAINT "whatsapp_broadcast_recipient_organization_id_message_id_fkey" FOREIGN KEY ("organization_id", "message_id") REFERENCES "whatsapp_message"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_message" ADD CONSTRAINT "whatsapp_message_organization_id_broadcast_id_fkey" FOREIGN KEY ("organization_id", "broadcast_id") REFERENCES "whatsapp_broadcast"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- A message's origin gains "automation": an away, welcome or keyword answer the system wrote (never "staff_crm").
ALTER TABLE "whatsapp_message"
  DROP CONSTRAINT whatsapp_message_origin_value,
  ADD CONSTRAINT whatsapp_message_origin_value CHECK (origin IN ('customer', 'staff_crm', 'staff_phone', 'history', 'automation'));

-- Fixed values and sizes (sales inbox spec, sections 5 and 6).
ALTER TABLE "inbox_tag"
  ADD CONSTRAINT inbox_tag_name_length CHECK (char_length(name) BETWEEN 1 AND 40);
ALTER TABLE "inbox_quick_reply"
  ADD CONSTRAINT inbox_quick_reply_shortcut_format CHECK (shortcut ~ '^[a-z0-9][a-z0-9-]{0,29}$'),
  ADD CONSTRAINT inbox_quick_reply_text_lengths CHECK (
    char_length(title) BETWEEN 1 AND 80 AND char_length(body) BETWEEN 1 AND 4096);
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
  ADD CONSTRAINT whatsapp_broadcast_status_value CHECK (status IN ('sending', 'paused', 'cancelled', 'done')),
  ADD CONSTRAINT whatsapp_broadcast_paused_reason_value CHECK (
    paused_reason IS NULL OR paused_reason IN ('failure_rate', 'template_unavailable')),
  ADD CONSTRAINT whatsapp_broadcast_params CHECK (cardinality(params) <= 10);
ALTER TABLE "whatsapp_broadcast_recipient"
  ADD CONSTRAINT whatsapp_broadcast_recipient_state_value CHECK (state IN ('waiting', 'sent', 'skipped', 'failed')),
  ADD CONSTRAINT whatsapp_broadcast_recipient_reason_length CHECK (char_length(coalesce(reason, '')) <= 100);

-- Tags, quick replies and keyword replies are soft-deleted (ADR 0004): the runtime role never deletes them. A tag on a
-- chat and a member's read mark are links, which it may remove. Scheduled sends and broadcasts end in a status, never a
-- delete (an erasure, which runs as the platform, removes a customer's).
REVOKE DELETE ON TABLE "inbox_tag", "inbox_quick_reply", "inbox_keyword_reply" FROM app_runtime;
REVOKE DELETE ON TABLE "scheduled_message", "inbox_automation", "whatsapp_broadcast", "whatsapp_broadcast_tag",
  "whatsapp_broadcast_recipient" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('inbox_tag');
SELECT app_enable_org_rls('conversation_tag');
SELECT app_enable_org_rls('inbox_quick_reply');
SELECT app_enable_org_rls('conversation_read');
SELECT app_enable_org_rls('scheduled_message');
SELECT app_enable_org_rls('inbox_automation');
SELECT app_enable_org_rls('inbox_keyword_reply');
SELECT app_enable_org_rls('whatsapp_broadcast');
SELECT app_enable_org_rls('whatsapp_broadcast_tag');
SELECT app_enable_org_rls('whatsapp_broadcast_recipient');
