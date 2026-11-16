-- The natural agent, plan 2: which agent answers an agency, and what a turn trace says about its agent. This only adds
-- or widens (a column with a default, a wider check), so the release before keeps working while it applies; it is applied
-- by hand before the release deploys.

-- AlterTable
ALTER TABLE "ai_autopilot" ADD COLUMN "agent" TEXT NOT NULL DEFAULT 'lite';

-- AlterTable
ALTER TABLE "ai_turn_trace" ADD COLUMN "agent" TEXT NOT NULL DEFAULT 'lite',
ADD COLUMN "cached_tokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "failed_checks" SMALLINT NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

ALTER TABLE "ai_autopilot"
  ADD CONSTRAINT ai_autopilot_agent_value CHECK (agent IN ('lite', 'natural'));

ALTER TABLE "ai_turn_trace"
  DROP CONSTRAINT ai_turn_trace_kind_value,
  ADD CONSTRAINT ai_turn_trace_kind_value CHECK (kind IN ('reply', 'nudge', 'replay')),
  ADD CONSTRAINT ai_turn_trace_agent_value CHECK (agent IN ('lite', 'natural')),
  ADD CONSTRAINT ai_turn_trace_cached_tokens_value CHECK (cached_tokens >= 0),
  ADD CONSTRAINT ai_turn_trace_failed_checks_value CHECK (failed_checks >= 0);
