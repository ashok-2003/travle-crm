-- A trace of every lite agent turn (plan 3b): an index row here, the whole trace as a gzip file in object storage.
-- Only adds a table.
CREATE TABLE "ai_turn_trace" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "lead_id" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "kind" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "move" TEXT,
    "sale_stage" TEXT,
    "model" TEXT,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "prompt_versions" JSONB NOT NULL,
    "file_key" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_turn_trace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_turn_trace_organization_id_id_key" ON "ai_turn_trace"("organization_id", "id");
CREATE INDEX "ai_turn_trace_conversation" ON "ai_turn_trace"("organization_id", "conversation_id", "started_at" DESC);
CREATE INDEX "ai_turn_trace_expiry" ON "ai_turn_trace"("expires_at");

ALTER TABLE "ai_turn_trace" ADD CONSTRAINT "ai_turn_trace_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ai_turn_trace" ADD CONSTRAINT "ai_turn_trace_organization_id_conversation_id_fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "whatsapp_conversation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

ALTER TABLE "ai_turn_trace"
  ADD CONSTRAINT ai_turn_trace_kind_value CHECK (kind IN ('reply', 'nudge')),
  ADD CONSTRAINT ai_turn_trace_outcome_length CHECK (char_length(outcome) <= 40),
  ADD CONSTRAINT ai_turn_trace_reason_length CHECK (char_length(reason) <= 60),
  ADD CONSTRAINT ai_turn_trace_move_length CHECK (char_length(move) <= 40),
  ADD CONSTRAINT ai_turn_trace_numbers CHECK (input_tokens >= 0 AND output_tokens >= 0 AND duration_ms >= 0),
  ADD CONSTRAINT ai_turn_trace_versions_object CHECK (jsonb_typeof(prompt_versions) = 'object');

-- A trace is written once; only the platform role (the expiry sweep, an erasure) changes or deletes it.
REVOKE UPDATE, DELETE ON TABLE "ai_turn_trace" FROM app_runtime;

SELECT app_enable_org_rls('ai_turn_trace');
