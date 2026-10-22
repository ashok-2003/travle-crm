-- CreateTable
CREATE TABLE "person_consent" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "wording" TEXT NOT NULL,
    "wording_version" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "source_form_id" UUID,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" UUID,

    CONSTRAINT "person_consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_form" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "key_secret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "allow_embed" BOOLEAN NOT NULL DEFAULT true,
    "email_mode" TEXT NOT NULL DEFAULT 'optional',
    "destination_mode" TEXT NOT NULL DEFAULT 'optional',
    "travel_month_mode" TEXT NOT NULL DEFAULT 'optional',
    "travellers_mode" TEXT NOT NULL DEFAULT 'optional',
    "budget_mode" TEXT NOT NULL DEFAULT 'off',
    "message_mode" TEXT NOT NULL DEFAULT 'optional',
    "offers_tickbox" BOOLEAN NOT NULL DEFAULT false,
    "heading" TEXT,
    "introduction" TEXT,
    "thank_you_message" TEXT,
    "website_url" TEXT,
    "website_button_text" TEXT,
    "privacy_url" TEXT,
    "key_changed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "website_form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_form_submission" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "lead_id" UUID,
    "person_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_form_submission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "person_consent_latest" ON "person_consent"("organization_id", "person_id", "recorded_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "website_form_organization_id_id_key" ON "website_form"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "website_form_one_per_organization" ON "website_form"("organization_id");

-- CreateIndex
CREATE INDEX "website_form_submission_counts" ON "website_form_submission"("organization_id", "form_id", "created_at");

-- CreateIndex
CREATE INDEX "website_form_submission_person" ON "website_form_submission"("organization_id", "person_id", "created_at") WHERE (person_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "website_form_submission_organization_id_submission_id_key" ON "website_form_submission"("organization_id", "submission_id");

-- CreateIndex
CREATE INDEX "website_form_submission_sweep" ON "website_form_submission"("created_at");

-- CreateIndex
CREATE INDEX "lead_offered_destinations" ON "lead"("organization_id", "destination_id") WHERE ((deleted_at IS NULL) AND (destination_id IS NOT NULL));

-- AddForeignKey
ALTER TABLE "person_consent" ADD CONSTRAINT "person_consent_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "person_consent" ADD CONSTRAINT "person_consent_organization_id_person_id_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "person"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "website_form" ADD CONSTRAINT "website_form_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "website_form_submission" ADD CONSTRAINT "website_form_submission_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "website_form_submission" ADD CONSTRAINT "website_form_submission_organization_id_form_id_fkey" FOREIGN KEY ("organization_id", "form_id") REFERENCES "website_form"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "website_form_submission" ADD CONSTRAINT "website_form_submission_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "website_form_submission" ADD CONSTRAINT "website_form_submission_organization_id_person_id_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "person"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- The form's key is 16 characters from A-Za-z0-9_- (96 bits, spec W4); every field mode is off, optional or required;
-- the agency's words are cut to their lengths and its two links are https only (a link is shown to visitors).
ALTER TABLE "website_form"
  ADD CONSTRAINT website_form_key_secret_shape CHECK (key_secret ~ '^[A-Za-z0-9_-]{16}$'),
  ADD CONSTRAINT website_form_modes_value CHECK (
    email_mode IN ('off', 'optional', 'required')
    AND destination_mode IN ('off', 'optional', 'required')
    AND travel_month_mode IN ('off', 'optional', 'required')
    AND travellers_mode IN ('off', 'optional', 'required')
    AND budget_mode IN ('off', 'optional', 'required')
    AND message_mode IN ('off', 'optional', 'required')
  ),
  ADD CONSTRAINT website_form_text_lengths CHECK (
    (heading IS NULL OR char_length(heading) BETWEEN 1 AND 80)
    AND (introduction IS NULL OR char_length(introduction) BETWEEN 1 AND 200)
    AND (thank_you_message IS NULL OR char_length(thank_you_message) BETWEEN 1 AND 500)
    AND (website_button_text IS NULL OR char_length(website_button_text) BETWEEN 1 AND 40)
    AND (website_url IS NULL OR char_length(website_url) <= 300)
    AND (privacy_url IS NULL OR char_length(privacy_url) <= 300)
  ),
  ADD CONSTRAINT website_form_urls_https CHECK (
    (website_url IS NULL OR website_url ~ '^https://')
    AND (privacy_url IS NULL OR privacy_url ~ '^https://')
  );

-- The ledger holds outcome names only (spec 7.2): the checks that ask the visitor to retry never reach it.
ALTER TABLE "website_form_submission"
  ADD CONSTRAINT website_form_submission_outcome_value CHECK (
    outcome IN ('new_lead', 'repeat_enquiry', 'blocked', 'duplicate', 'spam')
  ),
  ADD CONSTRAINT website_form_submission_reason_value CHECK (
    reason IS NULL OR (reason = 'honeypot' AND outcome = 'spam')
  );

ALTER TABLE "person_consent"
  ADD CONSTRAINT person_consent_purpose_value CHECK (purpose = 'marketing'),
  ADD CONSTRAINT person_consent_action_value CHECK (action IN ('granted', 'withdrawn')),
  ADD CONSTRAINT person_consent_source_value CHECK (source IN ('web_form', 'staff')),
  ADD CONSTRAINT person_consent_wording_length CHECK (char_length(wording) BETWEEN 1 AND 300),
  ADD CONSTRAINT person_consent_wording_version_positive CHECK (wording_version >= 1);

-- The public form's visitors are recorded in the organization's log with source "public"; every other rule of the log
-- stays (as the platform migration did for "platform").
-- Like the worker's, a visitor's entry names no user: the "actor named" check lets 'public' go without one.
ALTER TABLE "audit_entry"
  DROP CONSTRAINT audit_entry_source_value,
  DROP CONSTRAINT audit_entry_actor_named,
  ADD CONSTRAINT audit_entry_source_value CHECK (source IN ('web', 'api', 'job', 'impersonation', 'platform', 'public')),
  ADD CONSTRAINT audit_entry_actor_named CHECK (source IN ('job', 'public') OR actor_user_id IS NOT NULL);

-- Both ledgers are append only for the api and the worker. The platform role keeps its default rights: the console's
-- hourly sweep deletes submissions older than 90 days, and erasing a customer removes their consent rows.
REVOKE UPDATE, DELETE ON TABLE "website_form_submission", "person_consent" FROM app_runtime;

-- The form is never deleted by the app: it turns off (enabled = false). Only the platform role's purge removes it.
REVOKE DELETE ON TABLE "website_form" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('website_form');
SELECT app_enable_org_rls('website_form_submission');
SELECT app_enable_org_rls('person_consent');
