-- When someone on the team gave a chat back to the AI ("Let AI answer now"): their own messages before it no longer keep
-- the AI waiting. Only adds a column.
ALTER TABLE "ai_chat" ADD COLUMN "resumed_at" TIMESTAMPTZ(6);
