-- The one agent (spec 12.3): an agency's agent and a turn trace may now be 'one'. This only widens two checks, so the
-- release before keeps working while it applies.
ALTER TABLE "ai_autopilot" DROP CONSTRAINT ai_autopilot_agent_value,
  ADD CONSTRAINT ai_autopilot_agent_value CHECK (agent IN ('lite', 'natural', 'one'));
ALTER TABLE "ai_turn_trace" DROP CONSTRAINT ai_turn_trace_agent_value,
  ADD CONSTRAINT ai_turn_trace_agent_value CHECK (agent IN ('lite', 'natural', 'one'));
