-- A chat's own way of talking (the owner, 2026-10-29: Ayush's per-chat voice and history): from an imported WhatsApp export,
-- the person to copy, a style guide, a few of their own messages, what the two talked about before and the chat's last
-- messages from both sides, read with every reply in that chat. Only adds columns with defaults to ai_chat (additive: the
-- running version never reads them).
ALTER TABLE "ai_chat"
  ADD COLUMN "voice_name" TEXT,
  ADD COLUMN "voice_profile" TEXT,
  ADD COLUMN "voice_examples" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "voice_context" TEXT,
  ADD COLUMN "voice_history" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "ai_chat"
  ADD CONSTRAINT ai_chat_voice_lengths CHECK (
    char_length(COALESCE(voice_name, '')) <= 80 AND char_length(COALESCE(voice_profile, '')) <= 4000 AND cardinality(voice_examples) <= 40
  ),
  ADD CONSTRAINT ai_chat_voice_context_length CHECK (char_length(COALESCE(voice_context, '')) <= 4000),
  ADD CONSTRAINT ai_chat_voice_history_shape CHECK (jsonb_typeof(voice_history) = 'array' AND jsonb_array_length(voice_history) <= 120);
