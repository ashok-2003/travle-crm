-- AI step 2: the autopilot (the AI answering WhatsApp chats by itself), its per-chat state, the lessons it learns, and the
-- tokens each month's calls used. Additive: three new tables and two columns with defaults; nothing the running version
-- reads changes. Off until an Owner or Admin turns it on.

-- AlterTable
ALTER TABLE "ai_usage" ADD COLUMN     "input_tokens" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "output_tokens" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ai_autopilot" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "autopilot" BOOLEAN NOT NULL DEFAULT false,
    "agent_name" TEXT NOT NULL DEFAULT '',
    "follow_up_hours" INTEGER NOT NULL DEFAULT 4,
    "max_replies_per_day" INTEGER NOT NULL DEFAULT 25,
    "language" TEXT NOT NULL DEFAULT 'customer',
    "language_other" TEXT NOT NULL DEFAULT '',
    "style" TEXT NOT NULL DEFAULT 'human',
    "emojis" TEXT NOT NULL DEFAULT 'few',
    "tone" TEXT NOT NULL DEFAULT 'friendly',
    "handoff" TEXT NOT NULL DEFAULT 'alert',
    "smart_follow_up" BOOLEAN NOT NULL DEFAULT true,
    "learning" BOOLEAN NOT NULL DEFAULT false,
    "learned_at" TIMESTAMPTZ(6),
    "voice_name" TEXT,
    "voice_profile" TEXT,
    "voice_examples" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "persona" TEXT NOT NULL DEFAULT 'sales',
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_autopilot_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "ai_chat" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'default',
    "handed_off_at" TIMESTAMPTZ(6),
    "handoff_reason" TEXT,
    "memory" TEXT NOT NULL DEFAULT '',
    "last_reply_at" TIMESTAMPTZ(6),
    "replies_on" DATE,
    "replies_count" INTEGER NOT NULL DEFAULT 0,
    "last_nudge_at" TIMESTAMPTZ(6),
    "turn_state" TEXT,
    "turn_at" TIMESTAMPTZ(6),
    "follow_up_at" TIMESTAMPTZ(6),
    "follow_up_reason" TEXT,
    "attention_reason" TEXT,
    "attention_at" TIMESTAMPTZ(6),
    "resumed_at" TIMESTAMPTZ(6),
    "persona" TEXT NOT NULL DEFAULT 'default',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_learning" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "evidence" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_learning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_chat_follow_up" ON "ai_chat"("organization_id", "follow_up_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_chat_organization_id_id_key" ON "ai_chat"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_chat_one_per_chat" ON "ai_chat"("organization_id", "conversation_id");

-- CreateIndex
CREATE INDEX "ai_learning_state" ON "ai_learning"("organization_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "ai_learning_organization_id_id_key" ON "ai_learning"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "ai_autopilot" ADD CONSTRAINT "ai_autopilot_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_chat" ADD CONSTRAINT "ai_chat_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_chat" ADD CONSTRAINT "ai_chat_organization_id_conversation_id_fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "whatsapp_conversation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_learning" ADD CONSTRAINT "ai_learning_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ai_autopilot"
  ADD CONSTRAINT ai_autopilot_language_value CHECK (language IN ('customer', 'english', 'hindi', 'hinglish', 'other')),
  ADD CONSTRAINT ai_autopilot_style_value CHECK (style IN ('human', 'short', 'points')),
  ADD CONSTRAINT ai_autopilot_emojis_value CHECK (emojis IN ('none', 'few', 'many')),
  ADD CONSTRAINT ai_autopilot_tone_value CHECK (tone IN ('friendly', 'professional', 'enthusiastic')),
  ADD CONSTRAINT ai_autopilot_handoff_value CHECK (handoff IN ('alert', 'asked', 'careful')),
  ADD CONSTRAINT ai_autopilot_persona_value CHECK (persona IN ('sales', 'natural')),
  ADD CONSTRAINT ai_autopilot_follow_up_hours CHECK (follow_up_hours BETWEEN 0 AND 20),
  ADD CONSTRAINT ai_autopilot_max_replies CHECK (max_replies_per_day BETWEEN 1 AND 200),
  ADD CONSTRAINT ai_autopilot_text_lengths CHECK (
    char_length(agent_name) <= 80 AND char_length(language_other) <= 60 AND char_length(voice_profile) <= 4000
  );
ALTER TABLE "ai_chat"
  ADD CONSTRAINT ai_chat_mode_value CHECK (mode IN ('default', 'on', 'off')),
  ADD CONSTRAINT ai_chat_persona_value CHECK (persona IN ('default', 'sales', 'natural')),
  ADD CONSTRAINT ai_chat_turn_state_value CHECK (turn_state IS NULL OR turn_state IN ('queued', 'thinking')),
  ADD CONSTRAINT ai_chat_memory_length CHECK (char_length(memory) <= 2000);
ALTER TABLE "ai_learning"
  ADD CONSTRAINT ai_learning_kind_value CHECK (kind IN ('need', 'winning', 'objection', 'style', 'faq')),
  ADD CONSTRAINT ai_learning_state_value CHECK (state IN ('active', 'off', 'dismissed')),
  ADD CONSTRAINT ai_learning_text_length CHECK (char_length(text) BETWEEN 1 AND 400);

-- Settings are replaced and a chat's state is kept: the runtime role deletes neither, nor a lesson (the owner dismisses it).
-- Erasure and purge, the platform's, delete them.
REVOKE DELETE ON TABLE "ai_autopilot", "ai_chat", "ai_learning" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('ai_autopilot');
SELECT app_enable_org_rls('ai_chat');
SELECT app_enable_org_rls('ai_learning');
