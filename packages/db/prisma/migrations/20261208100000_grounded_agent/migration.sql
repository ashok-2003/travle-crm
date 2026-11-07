-- The grounded turn's switch per agency, and the facts it keeps per chat (customer words: erased with the chat's row).
ALTER TABLE "ai_autopilot" ADD COLUMN "grounded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_chat" ADD COLUMN "facts" JSONB NOT NULL DEFAULT '{}';
