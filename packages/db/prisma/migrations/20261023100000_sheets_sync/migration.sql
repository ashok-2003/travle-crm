-- CreateTable
CREATE TABLE "sheet_connection" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connecting',
    "step" TEXT NOT NULL DEFAULT 'share',
    "existing_rows" TEXT,
    "spreadsheet_id" TEXT NOT NULL,
    "tab_gid" TEXT NOT NULL,
    "tab_title" TEXT NOT NULL,
    "sheet_title" TEXT NOT NULL,
    "sheet_locale" TEXT NOT NULL,
    "sheet_time_zone" TEXT NOT NULL,
    "service_account_index" INTEGER NOT NULL,
    "cursor_row" INTEGER NOT NULL DEFAULT 1,
    "rows_seen" INTEGER NOT NULL DEFAULT 0,
    "header_hash" BYTEA,
    "connected_by" UUID NOT NULL,
    "impersonated_by" UUID,
    "claim_id" UUID,
    "rows_added" INTEGER NOT NULL DEFAULT 0,
    "rows_merged" INTEGER NOT NULL DEFAULT 0,
    "rows_duplicate" INTEGER NOT NULL DEFAULT 0,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "attention_since" TIMESTAMPTZ(6),
    "last_checked_at" TIMESTAMPTZ(6),
    "last_ok_at" TIMESTAMPTZ(6),
    "last_full_read_at" TIMESTAMPTZ(6),
    "check_started_at" TIMESTAMPTZ(6),
    "hold_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "touched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connected_at" TIMESTAMPTZ(6),
    "disconnected_at" TIMESTAMPTZ(6),

    CONSTRAINT "sheet_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_column" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "header_key" TEXT NOT NULL,
    "header" TEXT NOT NULL,
    "field" TEXT,
    "is_new" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sheet_column_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_value_match" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "target" UUID,
    "matched_by" TEXT NOT NULL,

    CONSTRAINT "sheet_value_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_row" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "raw_hash" BYTEA NOT NULL,
    "occurrence" SMALLINT NOT NULL DEFAULT 1,
    "row_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fingerprint" BYTEA,
    "lead_id" UUID,
    "person_id" UUID,
    "example_name" TEXT,
    "example_value" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "sheet_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_erased_contact" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "contact_hash" BYTEA NOT NULL,
    "erased_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sheet_erased_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_check_schedule" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "service_account_index" INTEGER NOT NULL,
    "next_check_at" TIMESTAMPTZ(6) NOT NULL,
    "claimed_until" TIMESTAMPTZ(6),

    CONSTRAINT "sheet_check_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_spreadsheet_claim" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "spreadsheet_hash" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sheet_spreadsheet_claim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sheet_connection_recent" ON "sheet_connection"("organization_id", "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "sheet_connection_organization_id_id_key" ON "sheet_connection"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_connection_live" ON "sheet_connection"("organization_id", "spreadsheet_id", "tab_gid") WHERE (status <> 'disconnected'::text);

-- CreateIndex
CREATE UNIQUE INDEX "sheet_column_organization_id_id_key" ON "sheet_column"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_column_key" ON "sheet_column"("organization_id", "connection_id", "header_key");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_value_match_organization_id_id_key" ON "sheet_value_match"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_value_match_value" ON "sheet_value_match"("organization_id", "connection_id", "field", "value");

-- CreateIndex
CREATE INDEX "sheet_row_fingerprint" ON "sheet_row"("organization_id", "fingerprint") WHERE (fingerprint IS NOT NULL);

-- CreateIndex
CREATE INDEX "sheet_row_problems" ON "sheet_row"("organization_id", "connection_id", "row_number") WHERE ((status = 'not_added'::text) AND (resolved_at IS NULL));

-- CreateIndex
CREATE INDEX "sheet_row_pending" ON "sheet_row"("organization_id", "connection_id", "row_number") WHERE (status = 'pending'::text);

-- CreateIndex
CREATE INDEX "sheet_row_person" ON "sheet_row"("organization_id", "person_id") WHERE (person_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "sheet_row_organization_id_id_key" ON "sheet_row"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_row_hash" ON "sheet_row"("organization_id", "connection_id", "raw_hash", "occurrence");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_erased_contact_organization_id_id_key" ON "sheet_erased_contact"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_erased_contact_hash" ON "sheet_erased_contact"("organization_id", "contact_hash");

-- CreateIndex
CREATE INDEX "sheet_check_schedule_due" ON "sheet_check_schedule"("next_check_at");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_spreadsheet_claim_hash" ON "sheet_spreadsheet_claim"("spreadsheet_hash");

-- AddForeignKey
ALTER TABLE "sheet_connection" ADD CONSTRAINT "sheet_connection_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sheet_column" ADD CONSTRAINT "sheet_column_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sheet_column" ADD CONSTRAINT "sheet_column_organization_id_connection_id_fkey" FOREIGN KEY ("organization_id", "connection_id") REFERENCES "sheet_connection"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sheet_value_match" ADD CONSTRAINT "sheet_value_match_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sheet_value_match" ADD CONSTRAINT "sheet_value_match_organization_id_connection_id_fkey" FOREIGN KEY ("organization_id", "connection_id") REFERENCES "sheet_connection"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sheet_row" ADD CONSTRAINT "sheet_row_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sheet_row" ADD CONSTRAINT "sheet_row_organization_id_connection_id_fkey" FOREIGN KEY ("organization_id", "connection_id") REFERENCES "sheet_connection"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sheet_erased_contact" ADD CONSTRAINT "sheet_erased_contact_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sheet_check_schedule" ADD CONSTRAINT "sheet_check_schedule_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sheet_spreadsheet_claim" ADD CONSTRAINT "sheet_spreadsheet_claim_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- A connection's fixed values stay within their lists (spec 5), its counts never go below zero, and the spreadsheet id
-- has the shape of a Google id (S3).
ALTER TABLE "sheet_connection"
  ADD CONSTRAINT sheet_connection_status_value CHECK (status IN (
    'connecting', 'running', 'paused', 'lost_access', 'tab_missing', 'columns_missing', 'needs_manager',
    'disconnected')),
  ADD CONSTRAINT sheet_connection_step_value CHECK (step IN ('share', 'tab', 'columns', 'existing', 'done')),
  ADD CONSTRAINT sheet_connection_existing_rows_value CHECK (existing_rows IN ('only_new', 'check')),
  ADD CONSTRAINT sheet_connection_counts CHECK (
    rows_seen >= 0 AND rows_added >= 0 AND rows_merged >= 0 AND rows_duplicate >= 0 AND consecutive_failures >= 0
    AND service_account_index >= 0),
  ADD CONSTRAINT sheet_connection_cursor_row CHECK (cursor_row >= 1),
  ADD CONSTRAINT sheet_connection_spreadsheet_id_format CHECK (spreadsheet_id ~ '^[A-Za-z0-9_-]{20,80}$'),
  ADD CONSTRAINT sheet_connection_text_lengths CHECK (
    char_length(tab_gid) BETWEEN 1 AND 20 AND char_length(tab_title) BETWEEN 1 AND 100
    AND char_length(sheet_title) <= 200 AND char_length(sheet_locale) <= 20 AND char_length(sheet_time_zone) <= 64);

-- A column's field is one of the lead import's fields without stage (contracts' sheetFields).
ALTER TABLE "sheet_column"
  ADD CONSTRAINT sheet_column_field_value CHECK (field IN (
    'name', 'phone', 'email', 'instagram', 'destination', 'travel_from', 'travel_to', 'travel_month', 'adults',
    'children_ages', 'children_count', 'budget', 'budget_basis', 'departure_city', 'trip_type', 'hotel_category',
    'food', 'room_type', 'owner', 'enquiry_date', 'their_source', 'note')),
  ADD CONSTRAINT sheet_column_text_lengths CHECK (
    char_length(header_key) BETWEEN 1 AND 200 AND char_length(header) BETWEEN 1 AND 200);

-- Only a hand-made Owner match is kept (S22); a value longer than 200 characters isn't listed, so it is never matched.
ALTER TABLE "sheet_value_match"
  ADD CONSTRAINT sheet_value_match_field_value CHECK (field IN ('owner')),
  ADD CONSTRAINT sheet_value_match_matched_by_value CHECK (matched_by IN ('chosen')),
  ADD CONSTRAINT sheet_value_match_value_length CHECK (char_length(value) BETWEEN 1 AND 200);

-- A ledger row's status and reasons stay within their lists; a hash is 32 bytes; only a row that was added, merged,
-- found a duplicate or was erased keeps a fingerprint (S23); a problem's examples are short (S27).
ALTER TABLE "sheet_row"
  ADD CONSTRAINT sheet_row_status_value CHECK (status IN (
    'before_connect', 'pending', 'added', 'merged', 'duplicate', 'not_added', 'erased')),
  ADD CONSTRAINT sheet_row_reasons_value CHECK (
    reasons IS NOT NULL AND cardinality(reasons) <= 10
    AND reasons <@ ARRAY['no_name', 'no_contact', 'notes_too_long', 'blocked', 'erased']::text[]),
  ADD CONSTRAINT sheet_row_hash_length CHECK (
    octet_length(raw_hash) = 32 AND (fingerprint IS NULL OR octet_length(fingerprint) = 32)),
  ADD CONSTRAINT sheet_row_fingerprint_status CHECK (
    fingerprint IS NULL OR status IN ('added', 'merged', 'duplicate', 'erased')),
  ADD CONSTRAINT sheet_row_example_lengths CHECK (
    char_length(example_name) <= 120 AND char_length(example_value) <= 120),
  ADD CONSTRAINT sheet_row_occurrence_positive CHECK (occurrence >= 1),
  ADD CONSTRAINT sheet_row_row_number_positive CHECK (row_number >= 1);

ALTER TABLE "sheet_erased_contact"
  ADD CONSTRAINT sheet_erased_contact_hash_length CHECK (octet_length(contact_hash) = 32);

ALTER TABLE "sheet_check_schedule"
  ADD CONSTRAINT sheet_check_schedule_account CHECK (service_account_index >= 0);

ALTER TABLE "sheet_spreadsheet_claim"
  ADD CONSTRAINT sheet_spreadsheet_claim_hash_length CHECK (octet_length(spreadsheet_hash) = 32);

-- The runtime role deletes a connection's rows, columns and value matches (disconnecting forgets the ledger, S42), never
-- the connection, which stays as the record of what the sheet did, nor an erased customer's tombstone: only the platform
-- role's purge removes those. A claim is taken and released but never changed.
REVOKE DELETE ON TABLE "sheet_connection", "sheet_erased_contact" FROM app_runtime;
REVOKE UPDATE ON TABLE "sheet_spreadsheet_claim" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration). The check schedule and the spreadsheet claim
-- carry organization_id but have none: they hold ids, times and a keyed hash only, and are reached through
-- @travel-crm/db/sheet-schedule inside db.withoutOrg() (ADR 0031).
SELECT app_enable_org_rls('sheet_connection');
SELECT app_enable_org_rls('sheet_column');
SELECT app_enable_org_rls('sheet_value_match');
SELECT app_enable_org_rls('sheet_row');
SELECT app_enable_org_rls('sheet_erased_contact');
