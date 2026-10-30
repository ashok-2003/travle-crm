-- Release 6, bookings and the trip: an accepted quote made into a booking the agency confirms, collects money on and gives
-- the traveller one trip page for; travellers' own details, stays and vouchers, payment claims, reminders, feedback, and a
-- cancellation with a refund worked out from the agency's policy. Additive: new tables, one new nullable column on the
-- lead timeline, and wider CHECKs. Money stays on the quote; nothing the running version reads changes meaning.

-- AlterTable
ALTER TABLE "ai_booking" ADD COLUMN     "booking_id" UUID;

-- AlterTable
ALTER TABLE "lead_timeline_entry" ADD COLUMN     "booking_event" TEXT;

-- CreateTable
CREATE TABLE "booking" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "start_date" DATE,
    "end_date" DATE,
    "level" TEXT NOT NULL DEFAULT 'basic',
    "reporting_time" TEXT,
    "reporting_place" TEXT NOT NULL DEFAULT '',
    "driver_name" TEXT NOT NULL DEFAULT '',
    "driver_phone" TEXT NOT NULL DEFAULT '',
    "emergency_name" TEXT NOT NULL DEFAULT '',
    "emergency_phone" TEXT NOT NULL DEFAULT '',
    "policy_snapshot" JSONB,
    "sends_reminders" BOOLEAN NOT NULL DEFAULT true,
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmed_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "charge_paise" BIGINT,
    "quote_placeholder" BOOLEAN NOT NULL DEFAULT false,
    "proof_message_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "confirm_task_id" UUID,
    "reminders_paused_at" TIMESTAMPTZ(6),
    "feedback_requested_at" TIMESTAMPTZ(6),
    "trip_pdf_document_id" UUID,
    "trip_pdf_fingerprint" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_stay" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "map_url" TEXT NOT NULL DEFAULT '',
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "voucher_document_id" UUID,
    "voucher_fingerprint" TEXT,

    CONSTRAINT "booking_stay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_traveller" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "date_of_birth" DATE,
    "gender" TEXT,
    "phone" TEXT NOT NULL DEFAULT '',
    "emergency_name" TEXT NOT NULL DEFAULT '',
    "emergency_phone" TEXT NOT NULL DEFAULT '',
    "medical_notes" TEXT NOT NULL DEFAULT '',
    "complete_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "booking_traveller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_traveller_identity" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "traveller_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issued_on" DATE,
    "expires_on" DATE,
    "nationality" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_traveller_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_claim" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "installment_id" UUID,
    "amount_paise" BIGINT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "screenshot_file_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reject_reason" TEXT,
    "payment_id" UUID,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "task_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_refund" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'due',
    "refunded_on" DATE,
    "method" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "recorded_by" UUID,
    "task_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_reminder" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "installment_id" UUID,
    "key" TEXT NOT NULL,
    "send_at" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "note" TEXT,
    "message_id" UUID,
    "task_id" UUID,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_feedback" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "overall" INTEGER NOT NULL,
    "hotel" INTEGER,
    "transport" INTEGER,
    "guide" INTEGER,
    "comment" TEXT NOT NULL DEFAULT '',
    "may_share" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellation_policy_rule" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "days_before_min" INTEGER NOT NULL,
    "charge_basis_points" INTEGER NOT NULL,

    CONSTRAINT "cancellation_policy_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_settings" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "advance_basis_points" INTEGER NOT NULL DEFAULT 3000,
    "balance_days_before" INTEGER NOT NULL DEFAULT 15,
    "details_cutoff_days" INTEGER NOT NULL DEFAULT 3,
    "default_level" TEXT NOT NULL DEFAULT 'basic',
    "balance_reminder_days" INTEGER[] DEFAULT ARRAY[3, 0]::INTEGER[],
    "details_reminder_days" INTEGER NOT NULL DEFAULT 10,
    "balance_template_id" UUID,
    "balance_params" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "details_template_id" UUID,
    "details_params" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reporting_template_id" UUID,
    "reporting_params" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "feedback_template_id" UUID,
    "feedback_params" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "packing_list" TEXT NOT NULL DEFAULT '',
    "emergency_name" TEXT NOT NULL DEFAULT '',
    "emergency_phone" TEXT NOT NULL DEFAULT '',
    "bank_details" TEXT NOT NULL DEFAULT '',
    "cancellation_notes" TEXT NOT NULL DEFAULT '',
    "google_review_url" TEXT NOT NULL DEFAULT '',
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booking_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateIndex
CREATE INDEX "booking_lead" ON "booking"("organization_id", "lead_id");

-- CreateIndex
CREATE INDEX "booking_by_status" ON "booking"("organization_id", "status", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "booking_organization_id_id_key" ON "booking"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_organization_id_number_key" ON "booking"("organization_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "booking_live_quote" ON "booking"("organization_id", "quote_id") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE INDEX "booking_stay_booking" ON "booking_stay"("organization_id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_stay_organization_id_id_key" ON "booking_stay"("organization_id", "id");

-- CreateIndex
CREATE INDEX "booking_traveller_booking" ON "booking_traveller"("organization_id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_traveller_organization_id_id_key" ON "booking_traveller"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_traveller_live_position" ON "booking_traveller"("organization_id", "booking_id", "position") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "booking_traveller_identity_organization_id_id_key" ON "booking_traveller_identity"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_traveller_identity_once" ON "booking_traveller_identity"("organization_id", "traveller_id");

-- CreateIndex
CREATE INDEX "payment_claim_booking" ON "payment_claim"("organization_id", "booking_id");

-- CreateIndex
CREATE INDEX "payment_claim_by_status" ON "payment_claim"("organization_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_claim_organization_id_id_key" ON "payment_claim"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_refund_organization_id_id_key" ON "booking_refund"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_refund_once" ON "booking_refund"("organization_id", "booking_id");

-- CreateIndex
CREATE INDEX "booking_reminder_due" ON "booking_reminder"("organization_id", "status", "send_at");

-- CreateIndex
CREATE UNIQUE INDEX "booking_reminder_organization_id_id_key" ON "booking_reminder"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_reminder_once" ON "booking_reminder"("organization_id", "booking_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "booking_feedback_organization_id_id_key" ON "booking_feedback"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_feedback_once" ON "booking_feedback"("organization_id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "cancellation_policy_rule_organization_id_id_key" ON "cancellation_policy_rule"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cancellation_policy_rule_days" ON "cancellation_policy_rule"("organization_id", "days_before_min");

-- AddForeignKey
ALTER TABLE "ai_booking" ADD CONSTRAINT "ai_booking_organization_id_booking_id_fkey" FOREIGN KEY ("organization_id", "booking_id") REFERENCES "booking"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_organization_id_quote_id_fkey" FOREIGN KEY ("organization_id", "quote_id") REFERENCES "quote"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_organization_id_trip_pdf_document_id_fkey" FOREIGN KEY ("organization_id", "trip_pdf_document_id") REFERENCES "issued_document"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking_stay" ADD CONSTRAINT "booking_stay_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking_stay" ADD CONSTRAINT "booking_stay_organization_id_booking_id_fkey" FOREIGN KEY ("organization_id", "booking_id") REFERENCES "booking"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking_stay" ADD CONSTRAINT "booking_stay_organization_id_voucher_document_id_fkey" FOREIGN KEY ("organization_id", "voucher_document_id") REFERENCES "issued_document"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking_traveller" ADD CONSTRAINT "booking_traveller_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking_traveller" ADD CONSTRAINT "booking_traveller_organization_id_booking_id_fkey" FOREIGN KEY ("organization_id", "booking_id") REFERENCES "booking"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking_traveller_identity" ADD CONSTRAINT "booking_traveller_identity_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking_traveller_identity" ADD CONSTRAINT "booking_traveller_identity_organization_id_traveller_id_fkey" FOREIGN KEY ("organization_id", "traveller_id") REFERENCES "booking_traveller"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_claim" ADD CONSTRAINT "payment_claim_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_claim" ADD CONSTRAINT "payment_claim_organization_id_booking_id_fkey" FOREIGN KEY ("organization_id", "booking_id") REFERENCES "booking"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_claim" ADD CONSTRAINT "payment_claim_organization_id_installment_id_fkey" FOREIGN KEY ("organization_id", "installment_id") REFERENCES "quote_installment"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_claim" ADD CONSTRAINT "payment_claim_organization_id_payment_id_fkey" FOREIGN KEY ("organization_id", "payment_id") REFERENCES "quote_payment"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking_refund" ADD CONSTRAINT "booking_refund_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking_refund" ADD CONSTRAINT "booking_refund_organization_id_booking_id_fkey" FOREIGN KEY ("organization_id", "booking_id") REFERENCES "booking"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking_reminder" ADD CONSTRAINT "booking_reminder_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking_reminder" ADD CONSTRAINT "booking_reminder_organization_id_booking_id_fkey" FOREIGN KEY ("organization_id", "booking_id") REFERENCES "booking"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking_reminder" ADD CONSTRAINT "booking_reminder_organization_id_installment_id_fkey" FOREIGN KEY ("organization_id", "installment_id") REFERENCES "quote_installment"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking_feedback" ADD CONSTRAINT "booking_feedback_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking_feedback" ADD CONSTRAINT "booking_feedback_organization_id_booking_id_fkey" FOREIGN KEY ("organization_id", "booking_id") REFERENCES "booking"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cancellation_policy_rule" ADD CONSTRAINT "cancellation_policy_rule_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking_settings" ADD CONSTRAINT "booking_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Fixed values and sizes (bookings).
ALTER TABLE "booking"
  ADD CONSTRAINT booking_status_value CHECK (status IN ('requested', 'confirmed', 'cancelled', 'completed')),
  ADD CONSTRAINT booking_level_value CHECK (level IN ('basic', 'detailed', 'international')),
  ADD CONSTRAINT booking_number_format CHECK (number ~ '^BK-[0-9]{4}-[0-9]{4,}$'),
  ADD CONSTRAINT booking_reporting_time_format CHECK (reporting_time IS NULL OR reporting_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT booking_text_lengths CHECK (
    char_length(reporting_place) <= 300 AND char_length(driver_name) <= 120 AND char_length(driver_phone) <= 40
    AND char_length(emergency_name) <= 120 AND char_length(emergency_phone) <= 40 AND char_length(coalesce(cancel_reason, '')) <= 500),
  ADD CONSTRAINT booking_dates_order CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  ADD CONSTRAINT booking_cancelled_together CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  ADD CONSTRAINT booking_charge_value CHECK (charge_paise IS NULL OR charge_paise >= 0),
  ADD CONSTRAINT booking_policy_snapshot_object CHECK (policy_snapshot IS NULL OR jsonb_typeof(policy_snapshot) = 'object');
ALTER TABLE "booking_stay"
  ADD CONSTRAINT booking_stay_name_length CHECK (char_length(name) BETWEEN 1 AND 120),
  ADD CONSTRAINT booking_stay_text_lengths CHECK (char_length(address) <= 400 AND char_length(map_url) <= 500 AND char_length(notes) <= 500),
  ADD CONSTRAINT booking_stay_dates_order CHECK (check_out >= check_in);
ALTER TABLE "booking_traveller"
  ADD CONSTRAINT booking_traveller_position_value CHECK (position >= 0),
  ADD CONSTRAINT booking_traveller_gender_value CHECK (gender IS NULL OR gender IN ('female', 'male', 'other')),
  ADD CONSTRAINT booking_traveller_text_lengths CHECK (
    char_length(name) <= 120 AND char_length(phone) <= 40 AND char_length(emergency_name) <= 120
    AND char_length(emergency_phone) <= 40 AND char_length(medical_notes) <= 1000);
ALTER TABLE "booking_traveller_identity"
  ADD CONSTRAINT booking_traveller_identity_kind_value CHECK (kind IN ('passport', 'other_id')),
  ADD CONSTRAINT booking_traveller_identity_text_lengths CHECK (char_length(number) BETWEEN 1 AND 40 AND char_length(nationality) <= 60);
ALTER TABLE "payment_claim"
  ADD CONSTRAINT payment_claim_amount_positive CHECK (amount_paise > 0),
  ADD CONSTRAINT payment_claim_status_value CHECK (status IN ('pending', 'confirmed', 'rejected')),
  ADD CONSTRAINT payment_claim_reject_reason_value CHECK (reject_reason IS NULL OR reject_reason IN ('not_found', 'wrong_amount', 'other')),
  ADD CONSTRAINT payment_claim_rejected_with_reason CHECK ((status = 'rejected') = (reject_reason IS NOT NULL)),
  ADD CONSTRAINT payment_claim_decided_together CHECK ((status = 'pending') = (decided_at IS NULL)),
  ADD CONSTRAINT payment_claim_confirmed_with_payment CHECK (status <> 'confirmed' OR payment_id IS NOT NULL),
  ADD CONSTRAINT payment_claim_reference_length CHECK (char_length(reference) <= 60);
ALTER TABLE "booking_refund"
  ADD CONSTRAINT booking_refund_amount_positive CHECK (amount_paise > 0),
  ADD CONSTRAINT booking_refund_status_value CHECK (status IN ('due', 'refunded')),
  ADD CONSTRAINT booking_refund_method_value CHECK (method IS NULL OR method IN ('upi', 'bank', 'cash', 'card', 'other')),
  ADD CONSTRAINT booking_refund_refunded_together CHECK ((status = 'refunded') = (refunded_on IS NOT NULL)),
  ADD CONSTRAINT booking_refund_reference_length CHECK (char_length(reference) <= 60);
ALTER TABLE "booking_reminder"
  ADD CONSTRAINT booking_reminder_kind_value CHECK (kind IN ('balance', 'details', 'reporting')),
  ADD CONSTRAINT booking_reminder_status_value CHECK (status IN ('scheduled', 'sent', 'by_hand', 'skipped')),
  ADD CONSTRAINT booking_reminder_key_length CHECK (char_length(key) BETWEEN 1 AND 120);
ALTER TABLE "booking_feedback"
  ADD CONSTRAINT booking_feedback_stars CHECK (
    overall BETWEEN 1 AND 5 AND (hotel IS NULL OR hotel BETWEEN 1 AND 5) AND (transport IS NULL OR transport BETWEEN 1 AND 5)
    AND (guide IS NULL OR guide BETWEEN 1 AND 5)),
  ADD CONSTRAINT booking_feedback_comment_length CHECK (char_length(comment) <= 2000);
ALTER TABLE "cancellation_policy_rule"
  ADD CONSTRAINT cancellation_policy_rule_days_value CHECK (days_before_min BETWEEN 0 AND 3650),
  ADD CONSTRAINT cancellation_policy_rule_charge_value CHECK (charge_basis_points BETWEEN 0 AND 10000);
ALTER TABLE "booking_settings"
  ADD CONSTRAINT booking_settings_advance_value CHECK (advance_basis_points BETWEEN 0 AND 10000),
  ADD CONSTRAINT booking_settings_days_value CHECK (
    balance_days_before BETWEEN 0 AND 365 AND details_cutoff_days BETWEEN 0 AND 60 AND details_reminder_days BETWEEN 0 AND 60),
  ADD CONSTRAINT booking_settings_level_value CHECK (default_level IN ('basic', 'detailed', 'international')),
  ADD CONSTRAINT booking_settings_text_lengths CHECK (
    char_length(packing_list) <= 2000 AND char_length(emergency_name) <= 120 AND char_length(emergency_phone) <= 40
    AND char_length(bank_details) <= 500 AND char_length(cancellation_notes) <= 1000 AND char_length(google_review_url) <= 500);

-- A booking and a traveller are soft-deleted (ADR 0004); a claim, a refund, feedback and the settings are kept and changed;
-- an identity is replaced in place. The runtime role deletes none of them; erasure and purge, the platform's, do.
-- A stay, a reminder not yet sent and a policy step are plain data and may be removed.
REVOKE DELETE ON TABLE "booking", "booking_traveller", "booking_traveller_identity", "payment_claim", "booking_refund",
  "booking_feedback", "booking_settings" FROM app_runtime;

-- The lead timeline gains the booking's steps, and the consent ledger the trip updates a traveller agrees to at Accept.
ALTER TABLE "lead_timeline_entry"
  DROP CONSTRAINT lead_timeline_entry_kind_value,
  ADD CONSTRAINT lead_timeline_entry_kind_value CHECK (kind IN (
    'created', 'note', 'call', 'stage-changed', 'reassigned', 'follow-up-added', 'follow-up-done', 'follow-up-cancelled',
    'repeat-enquiry', 'trip-edited', 'whatsapp-contact', 'booking-event'));
ALTER TABLE "lead_timeline_entry"
  DROP CONSTRAINT lead_timeline_entry_record_type_value,
  ADD CONSTRAINT lead_timeline_entry_record_type_value CHECK (record_type IN ('lead_note', 'lead_call', 'lead_enquiry', 'task', 'booking')),
  ADD CONSTRAINT lead_timeline_entry_booking_event_value CHECK (booking_event IS NULL OR booking_event IN (
    'created', 'confirmed', 'payment-claimed', 'payment-confirmed', 'payment-rejected', 'voucher-issued', 'trip-pdf-prepared',
    'details-complete', 'reminder-sent', 'reminder-by-hand', 'feedback-requested', 'feedback-received', 'cancelled', 'refunded'));
ALTER TABLE "person_consent"
  DROP CONSTRAINT person_consent_purpose_value,
  DROP CONSTRAINT person_consent_source_value,
  ADD CONSTRAINT person_consent_purpose_value CHECK (purpose IN ('marketing', 'whatsapp', 'trip_updates')),
  ADD CONSTRAINT person_consent_source_value CHECK (source IN ('web_form', 'staff', 'customer', 'quote_accept'));

-- Bookings, vouchers and the trip PDF are numbered apart from invoices, so no agency may choose their prefixes for its invoices.
-- NOT VALID: a live agency that already chose one must not fail the deploy; every new or changed prefix is checked.
ALTER TABLE "organization_profile" DROP CONSTRAINT organization_profile_invoice_prefix_not_reserved;
ALTER TABLE "organization_profile"
  ADD CONSTRAINT organization_profile_invoice_prefix_not_reserved CHECK (invoice_prefix NOT IN ('SMPL', 'DOC', 'QT', 'RCT', 'BK', 'VCH', 'ITN')) NOT VALID;

-- The pilot's accepted quotes become bookings (owner, 2026-10-29): Confirmed, or Completed when the trip is over, numbered from
-- the organization's counter in the order they were accepted, with no task, notification or reminder, and no travellers.
-- Their money stays on the quote; their payment reminders stay the sales automation's (sends_reminders false).
WITH accepted AS (
  SELECT q.organization_id, q.id AS quote_id, q.lead_id, q.accepted_at, q.start_date,
         CASE WHEN q.start_date IS NULL THEN NULL
              ELSE q.start_date + GREATEST(jsonb_array_length(q.days) - 1, 0) END AS end_date,
         EXTRACT(YEAR FROM q.accepted_at AT TIME ZONE o.time_zone)::int AS year,
         (now() AT TIME ZONE o.time_zone)::date AS today
  FROM quote q JOIN organization o ON o.id = q.organization_id
  WHERE q.status = 'accepted' AND q.deleted_at IS NULL AND q.accepted_at IS NOT NULL
), numbered AS (
  SELECT *, row_number() OVER (PARTITION BY organization_id, year ORDER BY accepted_at, quote_id) AS n FROM accepted
)
INSERT INTO "booking" ("organization_id", "id", "quote_id", "lead_id", "number", "status", "start_date", "end_date",
                       "sends_reminders", "confirmed_at", "created_at", "updated_at")
SELECT organization_id, uuidv7(), quote_id, lead_id, 'BK-' || year || '-' || lpad(n::text, 4, '0'),
       CASE WHEN COALESCE(end_date, start_date) < today THEN 'completed' ELSE 'confirmed' END,
       start_date, end_date, false, accepted_at, accepted_at, now()
FROM numbered;
INSERT INTO "org_counter" ("organization_id", "key", "value")
SELECT b.organization_id, 'BK-' || split_part(b.number, '-', 2), max(split_part(b.number, '-', 3)::int)
FROM "booking" b GROUP BY b.organization_id, split_part(b.number, '-', 2)
ON CONFLICT ("organization_id", "key") DO UPDATE SET "value" = GREATEST("org_counter"."value", EXCLUDED."value");

-- A salesperson confirms the bookings of their own leads (the "Confirm booking" task is theirs). ADR 0005 changes no existing
-- role by itself, so every organization's Sales role is given it here, once; its view stays the lead's owner's. Custom roles
-- are left to their Owners.
INSERT INTO role_permission (organization_id, role_id, permission, scope)
SELECT organization_id, id, 'bookings:edit', NULL
FROM role
WHERE key = 'sales' AND deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('booking');
SELECT app_enable_org_rls('booking_stay');
SELECT app_enable_org_rls('booking_traveller');
SELECT app_enable_org_rls('booking_traveller_identity');
SELECT app_enable_org_rls('payment_claim');
SELECT app_enable_org_rls('booking_refund');
SELECT app_enable_org_rls('booking_reminder');
SELECT app_enable_org_rls('booking_feedback');
SELECT app_enable_org_rls('cancellation_policy_rule');
SELECT app_enable_org_rls('booking_settings');
