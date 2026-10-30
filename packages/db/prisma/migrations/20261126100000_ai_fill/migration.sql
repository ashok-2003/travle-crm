-- "Fill it for me" (release ai2a): the forms the AI filled in for a member (ids, paths and hashes, never words), the lead
-- fields it suggested from a new WhatsApp lead's opening messages, and the agency's switch for that. Additive: two new tables
-- and a column with a default; nothing the running version reads changes.

ALTER TABLE "ai_settings" ADD COLUMN "fill_leads" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ai_fill" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "target" TEXT NOT NULL,
    "subject_type" TEXT,
    "subject_id" UUID,
    "requested_by" UUID NOT NULL,
    "input_kind" TEXT NOT NULL,
    "input_attachment_id" UUID,
    "model" TEXT NOT NULL,
    "proposal_hash" TEXT NOT NULL,
    "fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "field_hashes" JSONB NOT NULL DEFAULT '{}',
    "applied_at" TIMESTAMPTZ(6),
    "applied_by" UUID,
    "applied_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "changed_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_fill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_ai_field" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'suggested',
    "value_hash" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL DEFAULT '',
    "message_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lead_ai_field_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_fill_organization_id_id_key" ON "ai_fill"("organization_id", "id");

-- CreateIndex
CREATE INDEX "ai_fill_subject" ON "ai_fill"("organization_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_ai_field_organization_id_id_key" ON "lead_ai_field"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_ai_field_one_per_field" ON "lead_ai_field"("organization_id", "lead_id", "field");

-- AddForeignKey
ALTER TABLE "ai_fill" ADD CONSTRAINT "ai_fill_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_ai_field" ADD CONSTRAINT "lead_ai_field_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_ai_field" ADD CONSTRAINT "lead_ai_field_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ai_fill"
  ADD CONSTRAINT ai_fill_target_value CHECK (target IN ('lead', 'lead_edit', 'quote', 'call_note')),
  ADD CONSTRAINT ai_fill_input_kind_value CHECK (input_kind IN ('text', 'voice', 'image', 'chat')),
  ADD CONSTRAINT ai_fill_field_hashes_object CHECK (jsonb_typeof(field_hashes) = 'object');
ALTER TABLE "lead_ai_field"
  ADD CONSTRAINT lead_ai_field_field_value CHECK (field IN ('destination', 'when', 'adults', 'children_ages', 'budget', 'departure_city', 'trip_type', 'hotel_category', 'food', 'room_type')),
  ADD CONSTRAINT lead_ai_field_state_value CHECK (state IN ('suggested', 'confirmed', 'dismissed')),
  ADD CONSTRAINT lead_ai_field_excerpt_length CHECK (char_length(excerpt) <= 200);

-- A fill is used once and kept as the audit's evidence, a suggestion moves from suggested to confirmed or dismissed: the
-- runtime role deletes neither. A customer's erasure and the purge, the platform's, do.
REVOKE DELETE ON TABLE "ai_fill", "lead_ai_field" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('ai_fill');
SELECT app_enable_org_rls('lead_ai_field');
