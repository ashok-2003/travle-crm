-- CreateTable
CREATE TABLE "data_export" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'making',
    "filter" JSONB NOT NULL,
    "failure_reason" TEXT,
    "rows_total" INTEGER NOT NULL DEFAULT 0,
    "rows_done" INTEGER NOT NULL DEFAULT 0,
    "file_attachment_id" UUID,
    "requested_by" UUID NOT NULL,
    "impersonated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "data_export_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batch" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploading',
    "file_attachment_id" UUID,
    "file_name" TEXT NOT NULL,
    "file_kind" TEXT NOT NULL,
    "file_sha256" BYTEA,
    "sheet_name" TEXT,
    "sheet_count" INTEGER,
    "unreadable_reason" TEXT,
    "failure_reason" TEXT,
    "rows_total" INTEGER NOT NULL DEFAULT 0,
    "rows_to_add" INTEGER NOT NULL DEFAULT 0,
    "rows_done" INTEGER NOT NULL DEFAULT 0,
    "rows_added" INTEGER NOT NULL DEFAULT 0,
    "rows_new_stage" INTEGER NOT NULL DEFAULT 0,
    "default_stage" TEXT NOT NULL DEFAULT 'new',
    "default_owner_user_id" UUID,
    "budget_basis" TEXT,
    "default_role_key" TEXT,
    "add_blocked" BOOLEAN NOT NULL DEFAULT false,
    "add_already_imported" BOOLEAN NOT NULL DEFAULT false,
    "stop_requested" BOOLEAN NOT NULL DEFAULT false,
    "report_attachment_id" UUID,
    "started_by" UUID NOT NULL,
    "impersonated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_at" TIMESTAMPTZ(6),
    "add_requested_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "keep_until" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_column" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "header" TEXT NOT NULL,
    "samples" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "distinct_values" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "distinct_counts" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "field" TEXT,

    CONSTRAINT "import_column_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_value_match" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "rows" INTEGER,
    "target" TEXT,
    "matched_by" TEXT NOT NULL,

    CONSTRAINT "import_value_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_row" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "plan" TEXT NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "noted" BOOLEAN NOT NULL DEFAULT false,
    "new_destination" TEXT,
    "outcome" TEXT,
    "lead_id" UUID,
    "person_id" UUID,
    "member_id" UUID,
    "fingerprint" BYTEA,
    "password_hash" TEXT,
    "example_name" TEXT,
    "example_value" TEXT,

    CONSTRAINT "import_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_header_match" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "header_key" TEXT NOT NULL,
    "field" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "import_header_match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_export_by_requester" ON "data_export"("organization_id", "requested_by", "id" DESC);

-- CreateIndex
CREATE INDEX "data_export_due" ON "data_export"("expires_at") WHERE (status <> 'expired'::text);

-- CreateIndex
CREATE UNIQUE INDEX "data_export_organization_id_id_key" ON "data_export"("organization_id", "id");

-- CreateIndex
CREATE INDEX "import_batch_recent" ON "import_batch"("organization_id", "kind", "id" DESC);

-- CreateIndex
CREATE INDEX "import_batch_file" ON "import_batch"("organization_id", "file_sha256");

-- CreateIndex
CREATE INDEX "import_batch_due" ON "import_batch"("keep_until") WHERE (status <> 'expired'::text);

-- CreateIndex
CREATE UNIQUE INDEX "import_batch_organization_id_id_key" ON "import_batch"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "import_batch_one_adding" ON "import_batch"("organization_id") WHERE (status = 'adding'::text);

-- CreateIndex
CREATE UNIQUE INDEX "import_column_organization_id_id_key" ON "import_column"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "import_column_position" ON "import_column"("organization_id", "batch_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "import_value_match_organization_id_id_key" ON "import_value_match"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "import_value_match_value" ON "import_value_match"("organization_id", "batch_id", "field", "value");

-- CreateIndex
CREATE INDEX "import_row_by_plan" ON "import_row"("organization_id", "batch_id", "plan");

-- CreateIndex
CREATE INDEX "import_row_fingerprint" ON "import_row"("organization_id", "fingerprint") WHERE (fingerprint IS NOT NULL);

-- CreateIndex
CREATE INDEX "import_row_person" ON "import_row"("organization_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_row_organization_id_id_key" ON "import_row"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "import_row_number" ON "import_row"("organization_id", "batch_id", "row_number");

-- CreateIndex
CREATE UNIQUE INDEX "import_header_match_organization_id_id_key" ON "import_header_match"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "import_header_match_key" ON "import_header_match"("organization_id", "kind", "header_key");

-- AddForeignKey
ALTER TABLE "data_export" ADD CONSTRAINT "data_export_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "data_export" ADD CONSTRAINT "data_export_organization_id_file_attachment_id_fkey" FOREIGN KEY ("organization_id", "file_attachment_id") REFERENCES "attachment"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_organization_id_file_attachment_id_fkey" FOREIGN KEY ("organization_id", "file_attachment_id") REFERENCES "attachment"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_organization_id_report_attachment_id_fkey" FOREIGN KEY ("organization_id", "report_attachment_id") REFERENCES "attachment"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "import_column" ADD CONSTRAINT "import_column_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "import_column" ADD CONSTRAINT "import_column_organization_id_batch_id_fkey" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "import_batch"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "import_value_match" ADD CONSTRAINT "import_value_match_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "import_value_match" ADD CONSTRAINT "import_value_match_organization_id_batch_id_fkey" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "import_batch"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "import_row" ADD CONSTRAINT "import_row_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "import_row" ADD CONSTRAINT "import_row_organization_id_batch_id_fkey" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "import_batch"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "import_header_match" ADD CONSTRAINT "import_header_match_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- An import's fixed values stay within their lists (spec 5), its reason fits its status, and its counts never go below
-- zero. The default stage is an open stage, Won or Lost: an import never adds into Not a lead (B17).
ALTER TABLE "import_batch"
  ADD CONSTRAINT import_batch_kind_value CHECK (kind IN ('leads', 'staff')),
  ADD CONSTRAINT import_batch_status_value CHECK (status IN (
    'uploading', 'reading', 'unreadable', 'matching', 'checking', 'checked', 'adding', 'done', 'stopped', 'failed',
    'cancelled', 'expired')),
  ADD CONSTRAINT import_batch_file_kind_value CHECK (file_kind IN ('csv', 'xlsx')),
  ADD CONSTRAINT import_batch_unreadable_reason_value CHECK (unreadable_reason IN (
    'not_a_spreadsheet', 'protected', 'old_excel', 'no_column_names', 'no_rows', 'too_many_rows', 'too_many_columns',
    'too_large_unpacked')),
  ADD CONSTRAINT import_batch_unreadable_pair CHECK ((status = 'unreadable') = (unreadable_reason IS NOT NULL)),
  ADD CONSTRAINT import_batch_failure_reason_value CHECK (failure_reason IN (
    'no_longer_a_member', 'lost_permission', 'organization_cannot_change', 'file_withdrawn', 'row_changed',
    'over_seat_limit')),
  ADD CONSTRAINT import_batch_default_stage_value CHECK (
    default_stage IN ('new', 'contacted', 'quote_sent', 'booking_requested', 'won', 'lost')),
  ADD CONSTRAINT import_batch_budget_basis_value CHECK (budget_basis IN ('per_person', 'for_everyone')),
  ADD CONSTRAINT import_batch_counts CHECK (
    rows_total >= 0 AND rows_to_add >= 0 AND rows_done >= 0 AND rows_added >= 0 AND rows_new_stage >= 0
    AND sheet_count >= 1),
  ADD CONSTRAINT import_batch_text_lengths CHECK (
    char_length(file_name) BETWEEN 1 AND 200 AND char_length(sheet_name) <= 100
    AND char_length(default_role_key) BETWEEN 1 AND 64);

-- A column's field is one of both kinds' fields (contracts' leadImportFields and staffImportFields); it keeps three
-- samples at most, and at most fifty listed values each with its count (B11).
ALTER TABLE "import_column"
  ADD CONSTRAINT import_column_field_value CHECK (field IN (
    'name', 'phone', 'email', 'instagram', 'destination', 'travel_from', 'travel_to', 'travel_month', 'adults',
    'children_ages', 'children_count', 'budget', 'budget_basis', 'departure_city', 'trip_type', 'hotel_category',
    'food', 'room_type', 'stage', 'owner', 'enquiry_date', 'their_source', 'note', 'username', 'role')),
  ADD CONSTRAINT import_column_header_length CHECK (char_length(header) BETWEEN 1 AND 200),
  ADD CONSTRAINT import_column_samples CHECK (samples IS NOT NULL AND cardinality(samples) <= 3),
  ADD CONSTRAINT import_column_values CHECK (
    distinct_values IS NOT NULL AND distinct_counts IS NOT NULL AND cardinality(distinct_values) <= 50
    AND cardinality(distinct_counts) = cardinality(distinct_values)),
  ADD CONSTRAINT import_column_position_range CHECK (position BETWEEN 0 AND 49);

-- A value match is an Owner, Stage or Role value, short enough to index (longer values aren't listed).
ALTER TABLE "import_value_match"
  ADD CONSTRAINT import_value_match_field_value CHECK (field IN ('owner', 'stage', 'role')),
  ADD CONSTRAINT import_value_match_matched_by_value CHECK (
    matched_by IN ('name', 'username', 'email', 'first_name', 'word', 'chosen', 'none')),
  ADD CONSTRAINT import_value_match_value_length CHECK (char_length(value) BETWEEN 1 AND 200),
  ADD CONSTRAINT import_value_match_rows CHECK (rows >= 0);

-- A row's plan and outcome stay within their lists; only a row the add saved keeps a fingerprint (B33), and a staff
-- row's password hash goes once the row has an outcome (B46, B47).
ALTER TABLE "import_row"
  ADD CONSTRAINT import_row_plan_value CHECK (
    plan IN ('new', 'returning', 'enquiry', 'blocked', 'already_imported', 'not_added')),
  ADD CONSTRAINT import_row_outcome_value CHECK (outcome IN ('added', 'merged', 'left_out', 'not_added')),
  ADD CONSTRAINT import_row_reasons CHECK (reasons IS NOT NULL AND cardinality(reasons) <= 20),
  ADD CONSTRAINT import_row_fingerprint_added CHECK (
    fingerprint IS NULL OR (outcome IS NOT NULL AND outcome IN ('added', 'merged'))),
  ADD CONSTRAINT import_row_password_before_outcome CHECK (password_hash IS NULL OR outcome IS NULL),
  ADD CONSTRAINT import_row_text_lengths CHECK (
    char_length(example_name) <= 120 AND char_length(example_value) <= 120
    AND char_length(new_destination) BETWEEN 1 AND 80);

ALTER TABLE "import_header_match"
  ADD CONSTRAINT import_header_match_kind_value CHECK (kind IN ('leads', 'staff')),
  ADD CONSTRAINT import_header_match_field_value CHECK (field IN (
    'name', 'phone', 'email', 'instagram', 'destination', 'travel_from', 'travel_to', 'travel_month', 'adults',
    'children_ages', 'children_count', 'budget', 'budget_basis', 'departure_city', 'trip_type', 'hotel_category',
    'food', 'room_type', 'stage', 'owner', 'enquiry_date', 'their_source', 'note', 'username', 'role')),
  ADD CONSTRAINT import_header_match_key_length CHECK (char_length(header_key) BETWEEN 1 AND 200);

ALTER TABLE "data_export"
  ADD CONSTRAINT data_export_kind_value CHECK (kind IN ('leads', 'staff')),
  ADD CONSTRAINT data_export_format_value CHECK (format IN ('xlsx', 'csv')),
  ADD CONSTRAINT data_export_status_value CHECK (status IN ('making', 'ready', 'failed', 'expired')),
  ADD CONSTRAINT data_export_failure_reason_value CHECK (
    failure_reason IN ('no_longer_a_member', 'lost_permission', 'too_many_rows')),
  ADD CONSTRAINT data_export_counts CHECK (rows_total >= 0 AND rows_done >= 0);

-- The runtime role deletes rows and value matches when a check runs again, never a batch, a column, a remembered
-- header or an export: the sweep marks those expired, and only the platform role's purge removes them.
REVOKE DELETE ON TABLE "import_batch", "import_column", "import_header_match", "data_export" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('import_batch');
SELECT app_enable_org_rls('import_column');
SELECT app_enable_org_rls('import_value_match');
SELECT app_enable_org_rls('import_row');
SELECT app_enable_org_rls('import_header_match');
SELECT app_enable_org_rls('data_export');
