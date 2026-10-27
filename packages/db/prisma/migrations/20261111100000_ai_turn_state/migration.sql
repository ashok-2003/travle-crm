-- The AI agent's turn in a chat, so the inbox can say what it is doing: queued (waiting a few seconds for the customer's
-- next line), thinking (asking the model), or nothing. Only adds columns.
ALTER TABLE "ai_chat" ADD COLUMN "turn_state" TEXT;
ALTER TABLE "ai_chat" ADD COLUMN "turn_at" TIMESTAMPTZ(6);
ALTER TABLE "ai_chat" ADD CONSTRAINT "ai_chat_turn_state_value" CHECK ("turn_state" IS NULL OR "turn_state" IN ('queued', 'thinking'));
