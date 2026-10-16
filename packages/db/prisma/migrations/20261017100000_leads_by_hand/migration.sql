-- Trigram search (R5) and, for step 3's exclusion constraints, btree_gist (ADR 0028). Both are trusted extensions, so
-- the migrator may create them; sql/bootstrap.sql creates them too, as a superuser, where a database is made.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateTable
CREATE TABLE "destination" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "merged_into_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone_e164" TEXT,
    "email" TEXT,
    "instagram_handle" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "erased_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'new',
    "reopen_stage" TEXT,
    "stage_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_reply_at" TIMESTAMPTZ(6),
    "returning" BOOLEAN NOT NULL DEFAULT false,
    "owner_user_id" UUID,
    "destination_id" UUID,
    "travel_kind" TEXT NOT NULL DEFAULT 'unknown',
    "travel_start" DATE,
    "travel_end" DATE,
    "travel_month" DATE,
    "adults" INTEGER,
    "children_ages" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "budget_paise" BIGINT,
    "budget_basis" TEXT,
    "departure_city" TEXT,
    "trip_type" TEXT,
    "hotel_category" TEXT,
    "food" TEXT,
    "room_type" TEXT,
    "source" TEXT NOT NULL,
    "source_detail" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_timeline_entry" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID,
    "record_type" TEXT,
    "record_id" UUID,
    "stage" TEXT,
    "owner_user_id" UUID,

    CONSTRAINT "lead_timeline_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_note" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_enquiry" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "destination_id" UUID,
    "travel_kind" TEXT NOT NULL DEFAULT 'unknown',
    "travel_start" DATE,
    "travel_end" DATE,
    "travel_month" DATE,
    "adults" INTEGER,
    "children_ages" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "budget_paise" BIGINT,
    "budget_basis" TEXT,
    "departure_city" TEXT,
    "trip_type" TEXT,
    "hotel_category" TEXT,
    "food" TEXT,
    "room_type" TEXT,
    "source" TEXT NOT NULL,
    "source_detail" TEXT,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_contact" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "blocked_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "blocked_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "first_due_at" TIMESTAMPTZ(6) NOT NULL,
    "assignee_user_id" UUID,
    "record_type" TEXT,
    "record_id" UUID,
    "done_at" TIMESTAMPTZ(6),
    "done_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "destination_name_trgm" ON "destination" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "destination_organization_id_id_key" ON "destination"("organization_id", "id");

-- CreateIndex
CREATE INDEX "person_name_trgm" ON "person" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "person_phone_trgm" ON "person" USING GIN ("phone_e164" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "person_organization_id_id_key" ON "person"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "person_phone_live" ON "person"("organization_id", "phone_e164") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "person_email_live" ON "person"("organization_id", "email") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "person_instagram_live" ON "person"("organization_id", "instagram_handle") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE INDEX "lead_open_by_owner" ON "lead"("organization_id", "owner_user_id", "id" DESC) WHERE ((deleted_at IS NULL) AND (stage = ANY (ARRAY['new'::text, 'contacted'::text, 'quote_sent'::text, 'booking_requested'::text])));

-- CreateIndex
CREATE INDEX "lead_open" ON "lead"("organization_id", "id" DESC) WHERE ((deleted_at IS NULL) AND (stage = ANY (ARRAY['new'::text, 'contacted'::text, 'quote_sent'::text, 'booking_requested'::text])));

-- CreateIndex
CREATE INDEX "lead_open_stage_counts" ON "lead"("organization_id", "stage", "owner_user_id") WHERE ((deleted_at IS NULL) AND (stage = ANY (ARRAY['new'::text, 'contacted'::text, 'quote_sent'::text, 'booking_requested'::text])));

-- CreateIndex
CREATE INDEX "lead_new_by_owner" ON "lead"("organization_id", "owner_user_id", "id") WHERE ((deleted_at IS NULL) AND (stage = 'new'::text));

-- CreateIndex
CREATE INDEX "lead_live" ON "lead"("organization_id", "id" DESC) WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE INDEX "lead_live_by_owner" ON "lead"("organization_id", "owner_user_id", "id" DESC) WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE INDEX "lead_person" ON "lead"("organization_id", "person_id");

-- CreateIndex
CREATE INDEX "lead_destination" ON "lead"("organization_id", "destination_id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_organization_id_id_key" ON "lead"("organization_id", "id");

-- CreateIndex
CREATE INDEX "lead_timeline_entry_by_lead" ON "lead_timeline_entry"("organization_id", "lead_id", "id" DESC);

-- CreateIndex
CREATE INDEX "lead_note_by_lead" ON "lead_note"("organization_id", "lead_id");

-- CreateIndex
CREATE INDEX "lead_enquiry_by_lead" ON "lead_enquiry"("organization_id", "lead_id");

-- CreateIndex
CREATE INDEX "blocked_contact_list" ON "blocked_contact"("organization_id", "id" DESC) WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "blocked_contact_live" ON "blocked_contact"("organization_id", "kind", "value") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE INDEX "task_open_by_assignee" ON "task"("organization_id", "assignee_user_id", "due_at", "id") WHERE ((done_at IS NULL) AND (cancelled_at IS NULL));

-- CreateIndex
CREATE INDEX "task_open_by_record" ON "task"("organization_id", "record_type", "record_id", "due_at") WHERE ((done_at IS NULL) AND (cancelled_at IS NULL));

-- CreateIndex
CREATE INDEX "task_by_record" ON "task"("organization_id", "record_type", "record_id");

-- AddForeignKey
ALTER TABLE "destination" ADD CONSTRAINT "destination_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "destination" ADD CONSTRAINT "destination_organization_id_merged_into_id_fkey" FOREIGN KEY ("organization_id", "merged_into_id") REFERENCES "destination"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_organization_id_person_id_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "person"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_organization_id_destination_id_fkey" FOREIGN KEY ("organization_id", "destination_id") REFERENCES "destination"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_timeline_entry" ADD CONSTRAINT "lead_timeline_entry_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_timeline_entry" ADD CONSTRAINT "lead_timeline_entry_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_note" ADD CONSTRAINT "lead_note_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_note" ADD CONSTRAINT "lead_note_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_enquiry" ADD CONSTRAINT "lead_enquiry_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_enquiry" ADD CONSTRAINT "lead_enquiry_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_enquiry" ADD CONSTRAINT "lead_enquiry_organization_id_destination_id_fkey" FOREIGN KEY ("organization_id", "destination_id") REFERENCES "destination"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "blocked_contact" ADD CONSTRAINT "blocked_contact_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('person');
SELECT app_enable_org_rls('lead');
SELECT app_enable_org_rls('lead_timeline_entry');
SELECT app_enable_org_rls('lead_note');
SELECT app_enable_org_rls('lead_enquiry');
SELECT app_enable_org_rls('blocked_contact');
SELECT app_enable_org_rls('destination');
SELECT app_enable_org_rls('task');

-- A person has a name and at least one contact until erased, and each contact is stored the one way lookups use:
-- E.164, a lower-case email, a handle without "@" in lower case.
ALTER TABLE "person"
  ADD CONSTRAINT person_has_contact CHECK (
    erased_at IS NOT NULL OR phone_e164 IS NOT NULL OR email IS NOT NULL OR instagram_handle IS NOT NULL),
  ADD CONSTRAINT person_name_length CHECK (
    char_length(name) BETWEEN 1 AND 120 OR (erased_at IS NOT NULL AND name = '')),
  ADD CONSTRAINT person_phone_format CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  ADD CONSTRAINT person_email_lower CHECK (email = lower(email)),
  ADD CONSTRAINT person_email_length CHECK (char_length(email) BETWEEN 3 AND 254),
  ADD CONSTRAINT person_instagram_format CHECK (instagram_handle ~ '^[a-z0-9._]{1,30}$');

-- A lead's values stay within the fixed lists (one set for every agency, so reports compare), its travel fits its kind,
-- and its budget is a positive amount with its basis. Sources are wide enough for later releases'.
ALTER TABLE "lead"
  ADD CONSTRAINT lead_stage_value CHECK (
    stage IN ('new', 'contacted', 'quote_sent', 'booking_requested', 'won', 'lost', 'not_a_lead')),
  ADD CONSTRAINT lead_reopen_stage_open CHECK (reopen_stage IN ('new', 'contacted', 'quote_sent', 'booking_requested')),
  ADD CONSTRAINT lead_travel_kind_value CHECK (travel_kind IN ('dates', 'month', 'flexible', 'unknown')),
  ADD CONSTRAINT lead_travel_fits_kind CHECK (CASE travel_kind
    WHEN 'dates' THEN travel_start IS NOT NULL AND travel_end IS NOT NULL AND travel_end >= travel_start
      AND travel_month IS NULL
    WHEN 'month' THEN travel_month IS NOT NULL AND EXTRACT(DAY FROM travel_month) = 1
      AND travel_start IS NULL AND travel_end IS NULL
    ELSE travel_start IS NULL AND travel_end IS NULL AND travel_month IS NULL
  END),
  ADD CONSTRAINT lead_adults_range CHECK (adults BETWEEN 1 AND 99),
  ADD CONSTRAINT lead_children_ages CHECK (
    children_ages IS NOT NULL AND cardinality(children_ages) <= 20 AND array_position(children_ages, NULL) IS NULL
    AND 0 <= ALL (children_ages) AND 17 >= ALL (children_ages)),
  ADD CONSTRAINT lead_budget_pair CHECK ((budget_paise IS NULL) = (budget_basis IS NULL)),
  ADD CONSTRAINT lead_budget_positive CHECK (budget_paise BETWEEN 1 AND 100000000000),
  ADD CONSTRAINT lead_budget_basis_value CHECK (budget_basis IN ('per_person', 'for_everyone')),
  ADD CONSTRAINT lead_trip_type_value CHECK (
    trip_type IN ('family', 'honeymoon', 'friends', 'solo', 'corporate', 'pilgrimage', 'trek')),
  ADD CONSTRAINT lead_hotel_category_value CHECK (hotel_category IN ('3_star', '4_star', '5_star', 'any')),
  ADD CONSTRAINT lead_food_value CHECK (food IN ('veg', 'jain', 'non_veg')),
  ADD CONSTRAINT lead_source_value CHECK (source IN (
    'phone_call', 'walk_in', 'referral', 'instagram', 'facebook', 'website', 'other',
    'google_sheet', 'bulk_upload', 'web_form', 'integration', 'meta_lead_ad', 'whatsapp', 'package_page')),
  ADD CONSTRAINT lead_text_lengths CHECK (
    char_length(departure_city) BETWEEN 1 AND 120 AND char_length(room_type) BETWEEN 1 AND 120
    AND char_length(source_detail) BETWEEN 1 AND 120);

-- A repeat enquiry keeps the lead's own trip rules (R8).
ALTER TABLE "lead_enquiry"
  ADD CONSTRAINT lead_enquiry_travel_kind_value CHECK (travel_kind IN ('dates', 'month', 'flexible', 'unknown')),
  ADD CONSTRAINT lead_enquiry_travel_fits_kind CHECK (CASE travel_kind
    WHEN 'dates' THEN travel_start IS NOT NULL AND travel_end IS NOT NULL AND travel_end >= travel_start
      AND travel_month IS NULL
    WHEN 'month' THEN travel_month IS NOT NULL AND EXTRACT(DAY FROM travel_month) = 1
      AND travel_start IS NULL AND travel_end IS NULL
    ELSE travel_start IS NULL AND travel_end IS NULL AND travel_month IS NULL
  END),
  ADD CONSTRAINT lead_enquiry_adults_range CHECK (adults BETWEEN 1 AND 99),
  ADD CONSTRAINT lead_enquiry_children_ages CHECK (
    children_ages IS NOT NULL AND cardinality(children_ages) <= 20 AND array_position(children_ages, NULL) IS NULL
    AND 0 <= ALL (children_ages) AND 17 >= ALL (children_ages)),
  ADD CONSTRAINT lead_enquiry_budget_pair CHECK ((budget_paise IS NULL) = (budget_basis IS NULL)),
  ADD CONSTRAINT lead_enquiry_budget_positive CHECK (budget_paise BETWEEN 1 AND 100000000000),
  ADD CONSTRAINT lead_enquiry_budget_basis_value CHECK (budget_basis IN ('per_person', 'for_everyone')),
  ADD CONSTRAINT lead_enquiry_trip_type_value CHECK (
    trip_type IN ('family', 'honeymoon', 'friends', 'solo', 'corporate', 'pilgrimage', 'trek')),
  ADD CONSTRAINT lead_enquiry_hotel_category_value CHECK (hotel_category IN ('3_star', '4_star', '5_star', 'any')),
  ADD CONSTRAINT lead_enquiry_food_value CHECK (food IN ('veg', 'jain', 'non_veg')),
  ADD CONSTRAINT lead_enquiry_source_value CHECK (source IN (
    'phone_call', 'walk_in', 'referral', 'instagram', 'facebook', 'website', 'other',
    'google_sheet', 'bulk_upload', 'web_form', 'integration', 'meta_lead_ad', 'whatsapp', 'package_page')),
  ADD CONSTRAINT lead_enquiry_text_lengths CHECK (
    char_length(departure_city) BETWEEN 1 AND 120 AND char_length(room_type) BETWEEN 1 AND 120
    AND char_length(source_detail) BETWEEN 1 AND 120),
  ADD CONSTRAINT lead_enquiry_note_length CHECK (char_length(note) BETWEEN 1 AND 4000);

-- The timeline's kinds, and what an entry points to: a note, an enquiry or a task, with its id.
ALTER TABLE "lead_timeline_entry"
  ADD CONSTRAINT lead_timeline_entry_kind_value CHECK (kind IN (
    'created', 'note', 'stage-changed', 'reassigned', 'follow-up-added', 'follow-up-done', 'follow-up-cancelled',
    'repeat-enquiry', 'trip-edited')),
  ADD CONSTRAINT lead_timeline_entry_record_pair CHECK ((record_type IS NULL) = (record_id IS NULL)),
  ADD CONSTRAINT lead_timeline_entry_record_type_value CHECK (record_type IN ('lead_note', 'lead_enquiry', 'task')),
  ADD CONSTRAINT lead_timeline_entry_stage_value CHECK (
    stage IN ('new', 'contacted', 'quote_sent', 'booking_requested', 'won', 'lost', 'not_a_lead'));

ALTER TABLE "lead_note"
  ADD CONSTRAINT lead_note_body_length CHECK (char_length(body) BETWEEN 1 AND 4000);

ALTER TABLE "blocked_contact"
  ADD CONSTRAINT blocked_contact_kind_value CHECK (kind IN ('phone', 'email', 'instagram')),
  ADD CONSTRAINT blocked_contact_value_length CHECK (char_length(value) BETWEEN 1 AND 254);

ALTER TABLE "destination"
  ADD CONSTRAINT destination_name_length CHECK (char_length(name) BETWEEN 1 AND 80 AND name = btrim(name));

-- A task is a follow-up (always on a record) or a task; it points at a whole record or none; it ends done or
-- cancelled, never both. An empty title comes only from erasure: the contracts refuse one.
ALTER TABLE "task"
  ADD CONSTRAINT task_kind_value CHECK (kind IN ('follow-up', 'task')),
  ADD CONSTRAINT task_title_length CHECK (char_length(title) <= 200),
  ADD CONSTRAINT task_record_pair CHECK ((record_type IS NULL) = (record_id IS NULL)),
  ADD CONSTRAINT task_record_type_format CHECK (record_type ~ '^[a-z][a-z_]{1,39}$'),
  ADD CONSTRAINT task_follow_up_has_record CHECK (kind <> 'follow-up' OR record_id IS NOT NULL),
  ADD CONSTRAINT task_done_or_cancelled CHECK (done_at IS NULL OR cancelled_at IS NULL),
  ADD CONSTRAINT task_done_by_when_done CHECK (done_by IS NULL OR done_at IS NOT NULL);

-- A destination's name is unique among the organization's live destinations, whatever its case (R2). Prisma models
-- no expression index, and its drift check leaves this one alone.
CREATE UNIQUE INDEX destination_name_live ON "destination" (organization_id, lower(name)) WHERE deleted_at IS NULL;

-- Soft-deleted (ADR 0004): only the platform role's purge and erasure remove rows.
REVOKE DELETE ON TABLE "person", "lead", "destination", "blocked_contact" FROM app_runtime;

-- The timeline records what happened (R7): only the platform's erasure removes entries.
REVOKE UPDATE, DELETE ON TABLE "lead_timeline_entry" FROM app_runtime;
