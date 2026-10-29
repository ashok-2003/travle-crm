-- The AI settings as the contributor designed them: a switch for scoring leads, a summary line on a lead's insight, longer
-- instructions (4000 characters) and follow-ups up to 23 hours. Additive: two columns with defaults, and two limits widened.
ALTER TABLE "ai_settings" ADD COLUMN "scoring" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "lead_ai_insight" ADD COLUMN "summary" TEXT NOT NULL DEFAULT '';

ALTER TABLE "ai_settings"
  DROP CONSTRAINT ai_settings_instructions_length,
  ADD CONSTRAINT ai_settings_instructions_length CHECK (char_length(instructions) <= 4000);
ALTER TABLE "ai_autopilot"
  DROP CONSTRAINT ai_autopilot_follow_up_hours,
  ADD CONSTRAINT ai_autopilot_follow_up_hours CHECK (follow_up_hours BETWEEN 0 AND 23);
ALTER TABLE "lead_ai_insight"
  ADD CONSTRAINT lead_ai_insight_summary_length CHECK (char_length(summary) <= 400);
