-- CreateTable
CREATE TABLE "ai_settings" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "autopilot" BOOLEAN NOT NULL DEFAULT false,
    "scoring" BOOLEAN NOT NULL DEFAULT true,
    "agent_name" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "follow_up_hours" INTEGER NOT NULL DEFAULT 4,
    "max_replies_per_day" INTEGER NOT NULL DEFAULT 25,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "ai_knowledge" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'text',
    "attachment_id" UUID,
    "file_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "ai_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_chat" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'default',
    "handed_off_at" TIMESTAMPTZ(6),
    "handoff_reason" TEXT,
    "memory" TEXT NOT NULL DEFAULT '',
    "last_reply_at" TIMESTAMPTZ(6),
    "replies_on" DATE,
    "replies_count" INTEGER NOT NULL DEFAULT 0,
    "last_nudge_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_ai_insight" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fake" BOOLEAN NOT NULL DEFAULT false,
    "fake_reason" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "next_step" TEXT NOT NULL DEFAULT '',
    "facts" JSONB NOT NULL DEFAULT '{}',
    "model" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lead_ai_insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_knowledge_organization_id_id_key" ON "ai_knowledge"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_chat_organization_id_id_key" ON "ai_chat"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_chat_one_per_chat" ON "ai_chat"("organization_id", "conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_ai_insight_organization_id_id_key" ON "lead_ai_insight"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_ai_insight_one_per_lead" ON "lead_ai_insight"("organization_id", "lead_id");

-- CreateIndex
CREATE INDEX "ai_usage_created" ON "ai_usage"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_organization_id_id_key" ON "ai_usage"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_knowledge" ADD CONSTRAINT "ai_knowledge_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_chat" ADD CONSTRAINT "ai_chat_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_chat" ADD CONSTRAINT "ai_chat_organization_id_conversation_id_fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "whatsapp_conversation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_ai_insight" ADD CONSTRAINT "lead_ai_insight_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_ai_insight" ADD CONSTRAINT "lead_ai_insight_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Fixed values and sizes (the AI sales agent).
ALTER TABLE "ai_settings"
  ADD CONSTRAINT ai_settings_follow_up_hours CHECK (follow_up_hours BETWEEN 0 AND 23),
  ADD CONSTRAINT ai_settings_max_replies CHECK (max_replies_per_day BETWEEN 1 AND 200),
  ADD CONSTRAINT ai_settings_instructions_length CHECK (char_length(instructions) <= 4000);
ALTER TABLE "ai_knowledge"
  ADD CONSTRAINT ai_knowledge_kind_value CHECK (kind IN ('text', 'file')),
  ADD CONSTRAINT ai_knowledge_status_value CHECK (status IN ('ready', 'reading', 'failed')),
  ADD CONSTRAINT ai_knowledge_title_length CHECK (char_length(title) BETWEEN 1 AND 120),
  ADD CONSTRAINT ai_knowledge_body_length CHECK (char_length(body) <= 60000);
ALTER TABLE "ai_chat"
  ADD CONSTRAINT ai_chat_mode_value CHECK (mode IN ('default', 'on', 'off')),
  ADD CONSTRAINT ai_chat_replies_count CHECK (replies_count >= 0);
ALTER TABLE "lead_ai_insight"
  ADD CONSTRAINT lead_ai_insight_score CHECK (score BETWEEN 0 AND 100),
  ADD CONSTRAINT lead_ai_insight_label_value CHECK (label IN ('hot', 'warm', 'cold')),
  ADD CONSTRAINT lead_ai_insight_facts_object CHECK (jsonb_typeof(facts) = 'object');
ALTER TABLE "ai_usage"
  ADD CONSTRAINT ai_usage_kind_value CHECK (kind IN ('reply', 'nudge', 'insight', 'suggest', 'test'));

-- Settings are replaced, knowledge soft-deleted, a chat's state and a lead's insight updated, usage a log: the runtime
-- role deletes none of them, nor changes usage. Erasure and purge, the platform's, do.
REVOKE DELETE ON TABLE "ai_settings", "ai_knowledge", "ai_chat", "lead_ai_insight", "ai_usage" FROM app_runtime;
REVOKE UPDATE ON TABLE "ai_usage" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('ai_settings');
SELECT app_enable_org_rls('ai_knowledge');
SELECT app_enable_org_rls('ai_chat');
SELECT app_enable_org_rls('lead_ai_insight');
SELECT app_enable_org_rls('ai_usage');
