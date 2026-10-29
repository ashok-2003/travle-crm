-- The AI writes notes on leads and sends the agency's media (the owner, 2026-10-29), and the owner chooses who on the
-- team hears what: email for some members, a copy of every team alert for others. Only adds.

ALTER TABLE "ai_settings" ADD COLUMN "lead_notes" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ai_settings" ADD COLUMN "send_media" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "lead_note" ADD COLUMN "by_ai" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ai_media" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "when_to_send" TEXT NOT NULL DEFAULT '',
    "attachment_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "ai_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_routing" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "email_user_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "copy_user_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_routing_pkey" PRIMARY KEY ("organization_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_media_organization_id_id_key" ON "ai_media"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "ai_media" ADD CONSTRAINT "ai_media_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification_routing" ADD CONSTRAINT "notification_routing_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ai_media"
  ADD CONSTRAINT ai_media_title_length CHECK (char_length(title) BETWEEN 1 AND 120),
  ADD CONSTRAINT ai_media_when_to_send_length CHECK (char_length(when_to_send) <= 400);

-- Media is soft-deleted and the routing replaced: the runtime role deletes neither. Purge, the platform's, does.
REVOKE DELETE ON TABLE "ai_media", "notification_routing" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('ai_media');
SELECT app_enable_org_rls('notification_routing');
