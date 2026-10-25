-- AlterTable
ALTER TABLE "whatsapp_conversation" ADD COLUMN     "archived_at" TIMESTAMPTZ(6),
ADD COLUMN     "pinned_at" TIMESTAMPTZ(6);

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

-- Fixed values and sizes (sales inbox spec, section 5).
ALTER TABLE "inbox_tag"
  ADD CONSTRAINT inbox_tag_name_length CHECK (char_length(name) BETWEEN 1 AND 40);
ALTER TABLE "inbox_quick_reply"
  ADD CONSTRAINT inbox_quick_reply_shortcut_format CHECK (shortcut ~ '^[a-z0-9][a-z0-9-]{0,29}$'),
  ADD CONSTRAINT inbox_quick_reply_text_lengths CHECK (
    char_length(title) BETWEEN 1 AND 80 AND char_length(body) BETWEEN 1 AND 4096);

-- Tags and quick replies are soft-deleted (ADR 0004): the runtime role never deletes them. A tag on a chat and a member's
-- read mark are links, which it may remove.
REVOKE DELETE ON TABLE "inbox_tag", "inbox_quick_reply" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('inbox_tag');
SELECT app_enable_org_rls('conversation_tag');
SELECT app_enable_org_rls('inbox_quick_reply');
SELECT app_enable_org_rls('conversation_read');
