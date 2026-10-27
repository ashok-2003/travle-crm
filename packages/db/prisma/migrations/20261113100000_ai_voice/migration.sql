-- The AI writes as a real person writes (the owner, 2026-10-28): from a WhatsApp chat export, the way one person talks
-- (a style guide and a few of their own messages), for the whole agency or for one chat. Only adds columns.
ALTER TABLE "ai_settings"
  ADD COLUMN "voice_name" TEXT,
  ADD COLUMN "voice_profile" TEXT,
  ADD COLUMN "voice_examples" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ai_chat"
  ADD COLUMN "voice_name" TEXT,
  ADD COLUMN "voice_profile" TEXT,
  ADD COLUMN "voice_examples" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ai_settings"
  ADD CONSTRAINT ai_settings_voice_lengths CHECK (char_length(COALESCE(voice_name, '')) <= 80 AND char_length(COALESCE(voice_profile, '')) <= 4000 AND cardinality(voice_examples) <= 40);
ALTER TABLE "ai_chat"
  ADD CONSTRAINT ai_chat_voice_lengths CHECK (char_length(COALESCE(voice_name, '')) <= 80 AND char_length(COALESCE(voice_profile, '')) <= 4000 AND cardinality(voice_examples) <= 40);
