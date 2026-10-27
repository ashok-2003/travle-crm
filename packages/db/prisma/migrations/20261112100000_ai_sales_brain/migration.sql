-- The AI sales agent grows up (the owner, 2026-10-28): how it speaks (language, style, emojis, tone), when it hands a
-- chat to a person (never by itself, only when asked, or carefully), follow-ups it times itself, and what it learns from
-- the agency's chats. Only adds: columns with defaults, one table, a wider check.

ALTER TABLE "ai_settings"
  ADD COLUMN "language" TEXT NOT NULL DEFAULT 'customer',
  ADD COLUMN "language_other" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "style" TEXT NOT NULL DEFAULT 'human',
  ADD COLUMN "emojis" TEXT NOT NULL DEFAULT 'few',
  ADD COLUMN "tone" TEXT NOT NULL DEFAULT 'friendly',
  ADD COLUMN "handoff" TEXT NOT NULL DEFAULT 'alert',
  ADD COLUMN "smart_follow_up" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "learning" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "learned_at" TIMESTAMPTZ(6);

ALTER TABLE "ai_settings"
  ADD CONSTRAINT ai_settings_language_value CHECK (language IN ('customer', 'english', 'hindi', 'hinglish', 'other')),
  ADD CONSTRAINT ai_settings_language_other_length CHECK (char_length(language_other) <= 40),
  ADD CONSTRAINT ai_settings_style_value CHECK (style IN ('human', 'short', 'points')),
  ADD CONSTRAINT ai_settings_emojis_value CHECK (emojis IN ('none', 'few', 'many')),
  ADD CONSTRAINT ai_settings_tone_value CHECK (tone IN ('friendly', 'professional', 'enthusiastic')),
  ADD CONSTRAINT ai_settings_handoff_value CHECK (handoff IN ('alert', 'asked', 'careful'));

-- A chat's next follow-up as the agent planned it, and what it flagged for the team without stepping back.
ALTER TABLE "ai_chat"
  ADD COLUMN "follow_up_at" TIMESTAMPTZ(6),
  ADD COLUMN "follow_up_reason" TEXT,
  ADD COLUMN "attention_reason" TEXT,
  ADD COLUMN "attention_at" TIMESTAMPTZ(6);

ALTER TABLE "ai_usage" DROP CONSTRAINT ai_usage_kind_value;
ALTER TABLE "ai_usage"
  ADD CONSTRAINT ai_usage_kind_value CHECK (kind IN ('reply', 'nudge', 'insight', 'suggest', 'test', 'learn'));

-- What the agent learned from the agency's chats: general lessons, never about one person.
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

CREATE UNIQUE INDEX "ai_learning_organization_id_id_key" ON "ai_learning"("organization_id", "id");
CREATE INDEX "ai_learning_state" ON "ai_learning"("organization_id", "state");

ALTER TABLE "ai_learning" ADD CONSTRAINT "ai_learning_organization_id_fkey" FOREIGN KEY ("organization_id")
  REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ai_learning"
  ADD CONSTRAINT ai_learning_kind_value CHECK (kind IN ('need', 'winning', 'objection', 'style', 'faq')),
  ADD CONSTRAINT ai_learning_state_value CHECK (state IN ('active', 'off', 'dismissed')),
  ADD CONSTRAINT ai_learning_text_length CHECK (char_length(text) BETWEEN 1 AND 400),
  ADD CONSTRAINT ai_learning_evidence CHECK (evidence >= 1);

REVOKE DELETE ON TABLE "ai_learning" FROM app_runtime;

SELECT app_enable_org_rls('ai_learning');
