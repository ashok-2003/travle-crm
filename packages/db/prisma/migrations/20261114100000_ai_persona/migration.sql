-- What the AI is for (the owner, 2026-10-28): a sales agent, or a natural conversation as the person whose way of talking
-- it copies, for the agency and per chat; and, for a chat, what an imported chat export says the two talked about before.
-- Only adds columns.
ALTER TABLE "ai_settings" ADD COLUMN "persona" TEXT NOT NULL DEFAULT 'sales';
ALTER TABLE "ai_settings" ADD CONSTRAINT ai_settings_persona_value CHECK (persona IN ('sales', 'natural'));

ALTER TABLE "ai_chat"
  ADD COLUMN "persona" TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN "voice_context" TEXT;
ALTER TABLE "ai_chat"
  ADD CONSTRAINT ai_chat_persona_value CHECK (persona IN ('default', 'sales', 'natural')),
  ADD CONSTRAINT ai_chat_voice_context_length CHECK (char_length(COALESCE(voice_context, '')) <= 4000);
