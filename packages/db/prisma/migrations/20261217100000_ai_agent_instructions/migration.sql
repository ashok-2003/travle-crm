-- The owner's own instructions to the AI agent on how to talk ("no emojis", "never repeat yourself"), one per row. They
-- shape the words only; code's rules still win. Only adds.

CREATE TABLE "ai_agent_instruction" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_agent_instruction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_agent_instruction_organization_id_id_key" ON "ai_agent_instruction"("organization_id", "id");
CREATE INDEX "ai_agent_instruction_in_order" ON "ai_agent_instruction"("organization_id", "created_at", "id");

ALTER TABLE "ai_agent_instruction" ADD CONSTRAINT "ai_agent_instruction_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ai_agent_instruction"
  ADD CONSTRAINT ai_agent_instruction_text_length CHECK (char_length(text) BETWEEN 1 AND 200);

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('ai_agent_instruction');
