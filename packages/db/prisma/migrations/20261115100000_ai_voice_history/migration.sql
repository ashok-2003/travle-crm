-- A chat's imported WhatsApp export, kept as its last messages from both sides (the owner, 2026-10-28: the AI must know
-- what the two said and how they talk to each other), read with every reply. Only adds a column.
ALTER TABLE "ai_chat" ADD COLUMN "voice_history" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "ai_chat"
  ADD CONSTRAINT ai_chat_voice_history_shape CHECK (jsonb_typeof(voice_history) = 'array' AND jsonb_array_length(voice_history) <= 120);
