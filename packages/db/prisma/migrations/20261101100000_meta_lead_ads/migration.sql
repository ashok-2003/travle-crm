-- AlterTable
ALTER TABLE "import_batch" ADD COLUMN     "source_meta_form_id" UUID;

-- CreateTable
CREATE TABLE "meta_page" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "page_id" TEXT NOT NULL,
    "page_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connecting',
    "token_ciphertext" BYTEA,
    "token_nonce" BYTEA,
    "token_key_version" INTEGER,
    "token_kind" TEXT,
    "token_expires_at" TIMESTAMPTZ(6),
    "meta_user_id" TEXT NOT NULL,
    "connected_by" UUID NOT NULL,
    "impersonated_by" UUID,
    "subscribed_at" TIMESTAMPTZ(6),
    "forms_read_at" TIMESTAMPTZ(6),
    "last_checked_at" TIMESTAMPTZ(6),
    "last_ok_at" TIMESTAMPTZ(6),
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "attention_since" TIMESTAMPTZ(6),
    "leads_added" INTEGER NOT NULL DEFAULT 0,
    "leads_merged" INTEGER NOT NULL DEFAULT 0,
    "leads_duplicate" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnected_at" TIMESTAMPTZ(6),

    CONSTRAINT "meta_page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_form" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "meta_page_id" UUID NOT NULL,
    "form_id" TEXT NOT NULL,
    "form_name" TEXT NOT NULL,
    "meta_status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "state" TEXT NOT NULL DEFAULT 'not_brought_in',
    "catchup_cursor" BIGINT,
    "skipped_leads" INTEGER NOT NULL DEFAULT 0,
    "questions_hash" BYTEA,
    "brought_in_at" TIMESTAMPTZ(6),
    "notice_sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "meta_form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_form_question" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "form_row_id" UUID NOT NULL,
    "question_key" TEXT NOT NULL,
    "question_type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field" TEXT,

    CONSTRAINT "meta_form_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_lead" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "meta_lead_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lead_id" UUID,
    "person_id" UUID,
    "created_at_meta" TIMESTAMPTZ(6),
    "platform" TEXT,
    "example_name" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "meta_lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_page_route" (
    "id" UUID NOT NULL,
    "page_id" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "meta_user_id" TEXT NOT NULL,
    "next_catchup_at" TIMESTAMPTZ(6) NOT NULL,
    "claimed_until" TIMESTAMPTZ(6),

    CONSTRAINT "meta_page_route_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meta_page_recent" ON "meta_page"("organization_id", "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "meta_page_organization_id_id_key" ON "meta_page"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_page_live" ON "meta_page"("organization_id", "page_id") WHERE (status <> 'disconnected'::text);

-- CreateIndex
CREATE INDEX "meta_form_page" ON "meta_form"("organization_id", "meta_page_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_form_organization_id_id_key" ON "meta_form"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_form_key" ON "meta_form"("organization_id", "form_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_form_question_organization_id_id_key" ON "meta_form_question"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_form_question_key" ON "meta_form_question"("organization_id", "form_row_id", "question_key");

-- CreateIndex
CREATE INDEX "meta_lead_problems" ON "meta_lead"("organization_id", "form_id", "first_seen_at") WHERE ((status = 'not_added'::text) AND (resolved_at IS NULL));

-- CreateIndex
CREATE INDEX "meta_lead_person" ON "meta_lead"("organization_id", "person_id") WHERE (person_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "meta_lead_pending" ON "meta_lead"("organization_id", "first_seen_at") WHERE (status = 'pending'::text);

-- CreateIndex
CREATE UNIQUE INDEX "meta_lead_organization_id_id_key" ON "meta_lead"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_lead_key" ON "meta_lead"("organization_id", "meta_lead_id");

-- CreateIndex
CREATE INDEX "meta_page_route_due" ON "meta_page_route"("next_catchup_at");

-- CreateIndex
CREATE INDEX "meta_page_route_user" ON "meta_page_route"("meta_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_page_route_page" ON "meta_page_route"("page_id");

-- AddForeignKey
ALTER TABLE "meta_page" ADD CONSTRAINT "meta_page_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "meta_form" ADD CONSTRAINT "meta_form_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "meta_form" ADD CONSTRAINT "meta_form_organization_id_meta_page_id_fkey" FOREIGN KEY ("organization_id", "meta_page_id") REFERENCES "meta_page"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "meta_form_question" ADD CONSTRAINT "meta_form_question_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "meta_form_question" ADD CONSTRAINT "meta_form_question_organization_id_form_row_id_fkey" FOREIGN KEY ("organization_id", "form_row_id") REFERENCES "meta_form"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "meta_lead" ADD CONSTRAINT "meta_lead_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "meta_page_route" ADD CONSTRAINT "meta_page_route_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- A Page's fixed values stay within their lists (spec 5), its counts never go below zero, and its token fields come as a
-- set: ciphertext, nonce (12 bytes for AES-GCM) and key version together or all empty, and a running or paused Page
-- always has one (M1).
ALTER TABLE "meta_page"
  ADD CONSTRAINT meta_page_status_value CHECK (status IN (
    'connecting', 'running', 'paused', 'needs_reconnect', 'disconnected')),
  ADD CONSTRAINT meta_page_token_kind_value CHECK (token_kind IN ('user_long_lived', 'system_user')),
  ADD CONSTRAINT meta_page_token_set CHECK (
    (token_ciphertext IS NULL) = (token_nonce IS NULL) AND (token_ciphertext IS NULL) = (token_key_version IS NULL)
    AND (token_ciphertext IS NULL) = (token_kind IS NULL)
    AND (token_nonce IS NULL OR octet_length(token_nonce) = 12)
    AND (token_ciphertext IS NULL OR octet_length(token_ciphertext) BETWEEN 17 AND 2048)),
  ADD CONSTRAINT meta_page_running_has_token CHECK (status NOT IN ('running', 'paused') OR token_ciphertext IS NOT NULL),
  ADD CONSTRAINT meta_page_counts CHECK (
    consecutive_failures >= 0 AND leads_added >= 0 AND leads_merged >= 0 AND leads_duplicate >= 0),
  ADD CONSTRAINT meta_page_text_lengths CHECK (
    char_length(page_id) BETWEEN 1 AND 64 AND char_length(page_name) <= 200 AND char_length(meta_user_id) BETWEEN 1 AND 64);

-- A form's state stays within its list, a brought-in form has a cursor, and its counts never go below zero.
ALTER TABLE "meta_form"
  ADD CONSTRAINT meta_form_state_value CHECK (state IN ('not_brought_in', 'running', 'paused', 'needs_attention')),
  ADD CONSTRAINT meta_form_cursor CHECK (catchup_cursor >= 0 AND (state = 'not_brought_in' OR catchup_cursor IS NOT NULL)),
  ADD CONSTRAINT meta_form_skipped_count CHECK (skipped_leads >= 0),
  ADD CONSTRAINT meta_form_hash_length CHECK (questions_hash IS NULL OR octet_length(questions_hash) = 32),
  ADD CONSTRAINT meta_form_text_lengths CHECK (
    char_length(form_id) BETWEEN 1 AND 64 AND char_length(form_name) <= 200 AND char_length(meta_status) <= 40);

-- A question's type is one of Meta's, and its field is the note or one of the lead import's fields without stage
-- (contracts' sheetFields, as Sheets' columns have them).
ALTER TABLE "meta_form_question"
  ADD CONSTRAINT meta_form_question_type_value CHECK (question_type IN (
    'full_name', 'first_name', 'last_name', 'email', 'phone', 'city', 'state', 'zip', 'custom', 'other')),
  ADD CONSTRAINT meta_form_question_field_value CHECK (field IN (
    'name', 'phone', 'email', 'instagram', 'destination', 'travel_from', 'travel_to', 'travel_month', 'adults',
    'children_ages', 'children_count', 'budget', 'budget_basis', 'departure_city', 'trip_type', 'hotel_category',
    'food', 'room_type', 'owner', 'enquiry_date', 'their_source', 'note')),
  ADD CONSTRAINT meta_form_question_text_lengths CHECK (
    char_length(question_key) BETWEEN 1 AND 200 AND char_length(label) <= 500);

-- A ledger row's status, reasons and platform stay within their lists; a problem's example is short (spec 5).
ALTER TABLE "meta_lead"
  ADD CONSTRAINT meta_lead_status_value CHECK (status IN (
    'pending', 'added', 'merged', 'duplicate', 'not_added', 'erased')),
  ADD CONSTRAINT meta_lead_reasons_value CHECK (
    reasons IS NOT NULL AND cardinality(reasons) <= 10
    AND reasons <@ ARRAY['no_name', 'no_contact', 'phone_invalid', 'notes_too_long', 'blocked', 'erased', 'could_not_add',
      'lead_not_found', 'lead_not_allowed']::text[]),
  ADD CONSTRAINT meta_lead_platform_value CHECK (platform IN ('facebook', 'instagram', 'other')),
  ADD CONSTRAINT meta_lead_example_length CHECK (char_length(example_name) <= 120),
  ADD CONSTRAINT meta_lead_text_lengths CHECK (char_length(meta_lead_id) BETWEEN 1 AND 64 AND char_length(form_id) BETWEEN 1 AND 64);

ALTER TABLE "meta_page_route"
  ADD CONSTRAINT meta_page_route_text_lengths CHECK (
    char_length(page_id) BETWEEN 1 AND 64 AND char_length(meta_user_id) BETWEEN 1 AND 64);

-- The runtime role never deletes a Page, a form or a ledger row: a disconnected Page keeps its forms, matches and ledger
-- so connecting it again resumes, and a ledger row is what stops a Meta lead coming back after an erasure. Only the
-- platform role's purge removes them. Questions are replaced when a form's match changes.
REVOKE DELETE ON TABLE "meta_page", "meta_form", "meta_lead" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration). The Page route carries organization_id but
-- has none: it holds ids and times only, and is reached through @travel-crm/db/meta-routes inside db.withoutOrg()
-- (ADR 0034).
SELECT app_enable_org_rls('meta_page');
SELECT app_enable_org_rls('meta_form');
SELECT app_enable_org_rls('meta_form_question');
SELECT app_enable_org_rls('meta_lead');
