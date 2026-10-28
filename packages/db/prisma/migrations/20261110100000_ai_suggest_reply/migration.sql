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
    "suggestions" INTEGER NOT NULL DEFAULT 0,

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
ALTER TABLE "ai_draft" ADD CONSTRAINT "ai_draft_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_draft" ADD CONSTRAINT "ai_draft_organization_id_conversation_id_fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "whatsapp_conversation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Fixed values and sizes (suggest reply).
ALTER TABLE "ai_settings"
  ADD CONSTRAINT ai_settings_instructions_length CHECK (char_length(instructions) <= 1500);
ALTER TABLE "ai_usage"
  ADD CONSTRAINT ai_usage_suggestions_positive CHECK (suggestions >= 0);

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
REVOKE DELETE ON TABLE "ai_settings", "ai_usage", "ai_draft" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('ai_settings');
SELECT app_enable_org_rls('ai_usage');
SELECT app_enable_org_rls('ai_draft');
