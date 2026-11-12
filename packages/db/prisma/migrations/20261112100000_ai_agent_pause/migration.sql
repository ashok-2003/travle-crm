-- The WhatsApp AI agent's pause (lite agent spec, N8): platform staff pause it for every agency (the policy's row) or
-- for one (its subscription). The runtime reads them; the table-level REVOKE keeps writing to the platform role.
ALTER TABLE "subscription_policy"
  ADD COLUMN "ai_agent_paused_at" TIMESTAMPTZ(6),
  ADD COLUMN "ai_agent_paused_by" UUID,
  ADD CONSTRAINT subscription_policy_agent_pause CHECK ((ai_agent_paused_at IS NULL) = (ai_agent_paused_by IS NULL));
ALTER TABLE "subscription"
  ADD COLUMN "ai_agent_paused_at" TIMESTAMPTZ(6),
  ADD COLUMN "ai_agent_paused_by" UUID,
  ADD CONSTRAINT subscription_agent_pause CHECK ((ai_agent_paused_at IS NULL) = (ai_agent_paused_by IS NULL));
