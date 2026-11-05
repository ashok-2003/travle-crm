-- Every call to the AI model, for the console's AI usage (the owner, 2026-11-02): the feature, the model, the tokens, the
-- time it took and how it ended. No words of a chat. Only adds.

CREATE TABLE "ai_call" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_call_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_call_organization_id_id_key" ON "ai_call"("organization_id", "id");
CREATE INDEX "ai_call_newest" ON "ai_call"("organization_id", "occurred_at" DESC);
CREATE INDEX "ai_call_when" ON "ai_call"("occurred_at");

ALTER TABLE "ai_call" ADD CONSTRAINT "ai_call_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ai_call"
  ADD CONSTRAINT ai_call_outcome_value
    CHECK (outcome IN ('ok', 'rate_limited', 'unavailable', 'refused', 'not_configured')),
  ADD CONSTRAINT ai_call_feature_length CHECK (char_length(feature) BETWEEN 1 AND 40),
  ADD CONSTRAINT ai_call_model_length CHECK (char_length(model) <= 120),
  ADD CONSTRAINT ai_call_counts CHECK (input_tokens >= 0 AND output_tokens >= 0 AND duration_ms >= 0);

-- A log: the runtime role adds rows and reads them, never changes or removes one. The console prunes old ones.
REVOKE UPDATE, DELETE ON TABLE "ai_call" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('ai_call');
