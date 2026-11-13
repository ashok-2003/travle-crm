-- The lite agent's suggestions to mark a lead Lost or Not a lead; a person says yes or no (plan 3b, task 6).
-- CreateTable
CREATE TABLE "lead_ai_suggestion" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "conversation_id" UUID,
    "kind" TEXT NOT NULL,
    "lost_reason" TEXT,
    "reason" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),

    CONSTRAINT "lead_ai_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_ai_suggestion_organization_id_id_key" ON "lead_ai_suggestion"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_ai_suggestion_one_open" ON "lead_ai_suggestion"("organization_id", "lead_id") WHERE state = 'open';

-- CreateIndex
CREATE INDEX "lead_ai_suggestion_open_list" ON "lead_ai_suggestion"("organization_id", "state", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "lead_ai_suggestion" ADD CONSTRAINT "lead_ai_suggestion_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_ai_suggestion" ADD CONSTRAINT "lead_ai_suggestion_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_ai_suggestion" ADD CONSTRAINT "lead_ai_suggestion_organization_id_conversation_id_fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "whatsapp_conversation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "lead_ai_suggestion"
  ADD CONSTRAINT lead_ai_suggestion_kind_value CHECK (kind IN ('lost', 'not_a_lead')),
  ADD CONSTRAINT lead_ai_suggestion_lost_reason_value CHECK (lost_reason IS NULL OR lost_reason IN ('price', 'dates', 'competitor', 'no_reply', 'changed_plans', 'other')),
  ADD CONSTRAINT lead_ai_suggestion_state_value CHECK (state IN ('open', 'accepted', 'declined')),
  ADD CONSTRAINT lead_ai_suggestion_reason_length CHECK (char_length(reason) <= 200);

-- A suggestion moves from open to accepted or declined and stays as the record of what was decided: the runtime role
-- deletes none. A customer's erasure and the purge, the platform's, do.
REVOKE DELETE ON TABLE "lead_ai_suggestion" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('lead_ai_suggestion');
