-- The agency's answers to the AI agent's fixed questions, by topic: facts the owner typed.
ALTER TABLE "ai_autopilot" ADD COLUMN "answers" JSONB NOT NULL DEFAULT '{}';
