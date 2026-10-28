-- CreateTable
CREATE TABLE "ai_settings" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "instructions" TEXT NOT NULL DEFAULT '',
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_draft" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "drafted_by" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "text_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_draft_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "lead_ai_insight" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fake" BOOLEAN NOT NULL DEFAULT false,
    "fake_reason" TEXT,
    "next_step" TEXT NOT NULL DEFAULT '',
    "facts" JSONB NOT NULL DEFAULT '{}',
    "model" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lead_ai_insight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_knowledge_organization_id_id_key" ON "ai_knowledge"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_ai_insight_organization_id_id_key" ON "lead_ai_insight"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_ai_insight_one_per_lead" ON "lead_ai_insight"("organization_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_organization_id_id_key" ON "ai_usage"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_month_key" ON "ai_usage"("organization_id", "month");

-- CreateIndex
CREATE INDEX "ai_draft_conversation" ON "ai_draft"("organization_id", "conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_draft_organization_id_id_key" ON "ai_draft"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_knowledge" ADD CONSTRAINT "ai_knowledge_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_ai_insight" ADD CONSTRAINT "lead_ai_insight_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_ai_insight" ADD CONSTRAINT "lead_ai_insight_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_draft" ADD CONSTRAINT "ai_draft_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_draft" ADD CONSTRAINT "ai_draft_organization_id_conversation_id_fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "whatsapp_conversation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Fixed values and sizes (suggest reply).
ALTER TABLE "ai_settings"
  ADD CONSTRAINT ai_settings_instructions_length CHECK (char_length(instructions) <= 1500);
ALTER TABLE "ai_usage"
  ADD CONSTRAINT ai_usage_calls_positive CHECK (calls >= 0);
ALTER TABLE "ai_knowledge"
  ADD CONSTRAINT ai_knowledge_kind_value CHECK (kind IN ('text', 'file')),
  ADD CONSTRAINT ai_knowledge_status_value CHECK (status IN ('ready', 'reading', 'failed')),
  ADD CONSTRAINT ai_knowledge_title_length CHECK (char_length(title) BETWEEN 1 AND 120),
  ADD CONSTRAINT ai_knowledge_body_length CHECK (char_length(body) <= 60000);
ALTER TABLE "lead_ai_insight"
  ADD CONSTRAINT lead_ai_insight_score CHECK (score BETWEEN 0 AND 100),
  ADD CONSTRAINT lead_ai_insight_label_value CHECK (label IN ('hot', 'warm', 'cold')),
  ADD CONSTRAINT lead_ai_insight_facts_object CHECK (jsonb_typeof(facts) = 'object');

-- The AI suggestions are a module a plan can include: the module checks know it.
ALTER TABLE "plan" DROP CONSTRAINT plan_modules_known;
ALTER TABLE "plan"
  ADD CONSTRAINT plan_modules_known CHECK (modules IS NOT NULL AND modules <@
    ARRAY['crm', 'inbox', 'catalog', 'quotes', 'bookings', 'departures', 'suppliers', 'accounts', 'reports', 'ai']::text[]);
ALTER TABLE "subscription" DROP CONSTRAINT subscription_extra_modules_known;
ALTER TABLE "subscription"
  ADD CONSTRAINT subscription_extra_modules_known CHECK (extra_modules IS NOT NULL AND extra_modules <@
    ARRAY['crm', 'inbox', 'catalog', 'quotes', 'bookings', 'departures', 'suppliers', 'accounts', 'reports', 'ai']::text[]);

-- Settings are replaced and usage is counted, not deleted; a draft's row (ids and a hash) is the audit trail of a sent reply
-- and is never changed but to mark it used. Erasure and purge, the platform's, delete them all.
REVOKE DELETE ON TABLE "ai_settings", "ai_usage", "ai_draft", "ai_knowledge", "lead_ai_insight" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('ai_settings');
SELECT app_enable_org_rls('ai_usage');
SELECT app_enable_org_rls('ai_draft');
SELECT app_enable_org_rls('ai_knowledge');
SELECT app_enable_org_rls('lead_ai_insight');
