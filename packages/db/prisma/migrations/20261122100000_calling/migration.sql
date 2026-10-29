-- Release 5, calling and the daily rhythm: a call written up on a lead, a person's morning summary push, and the Done
-- of an opened quote on Today. Additive: two new tables and one new nullable column; nothing the running version reads changes.

-- CreateTable
CREATE TABLE "lead_call" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "outcome" TEXT NOT NULL,
    "note" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "lead_call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "morning_push_setting" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "user_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "local_time" TEXT NOT NULL DEFAULT '09:00',
    "last_sent_on" DATE,

    CONSTRAINT "morning_push_setting_pkey" PRIMARY KEY ("organization_id","user_id")
);

-- AlterTable
ALTER TABLE "lead_signal" ADD COLUMN "dismissed_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE UNIQUE INDEX "lead_call_organization_id_id_key" ON "lead_call"("organization_id", "id");

-- CreateIndex
CREATE INDEX "lead_call_by_lead" ON "lead_call"("organization_id", "lead_id", "occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "lead_call" ADD CONSTRAINT "lead_call_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_call" ADD CONSTRAINT "lead_call_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "morning_push_setting" ADD CONSTRAINT "morning_push_setting_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "lead_call"
  ADD CONSTRAINT lead_call_outcome_value CHECK (outcome IN ('spoke', 'no_answer', 'busy', 'wrong_number')),
  ADD CONSTRAINT lead_call_note_length CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 2000);
ALTER TABLE "morning_push_setting"
  ADD CONSTRAINT morning_push_setting_time_format CHECK (local_time ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$');

-- A signal is kept as it came; the one thing a person does to it is mark it seen, so that column alone is theirs to change.
GRANT UPDATE ("dismissed_at") ON TABLE "lead_signal" TO app_runtime;

-- A call is soft-deleted (ADR 0004) and a setting is replaced: the runtime role deletes neither. Erasure and purge, the
-- platform's, do.
REVOKE DELETE ON TABLE "lead_call", "morning_push_setting" FROM app_runtime;

-- The timeline gains the entry for a call.
ALTER TABLE "lead_timeline_entry"
  DROP CONSTRAINT lead_timeline_entry_kind_value,
  ADD CONSTRAINT lead_timeline_entry_kind_value CHECK (kind IN (
    'created', 'note', 'call', 'stage-changed', 'reassigned', 'follow-up-added', 'follow-up-done', 'follow-up-cancelled',
    'repeat-enquiry', 'trip-edited', 'whatsapp-contact'));
-- ... and may point at the call.
ALTER TABLE "lead_timeline_entry"
  DROP CONSTRAINT lead_timeline_entry_record_type_value,
  ADD CONSTRAINT lead_timeline_entry_record_type_value CHECK (record_type IN ('lead_note', 'lead_call', 'lead_enquiry', 'task'));

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('lead_call');
SELECT app_enable_org_rls('morning_push_setting');
