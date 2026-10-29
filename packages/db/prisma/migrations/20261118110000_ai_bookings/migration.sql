-- The AI takes bookings (the owner, 2026-10-29): the agency's payment details, sent exactly as written when a customer
-- wants to book, rules the agent always follows, and each booking it took, with the customer's payment proof. Only adds.

ALTER TABLE "ai_settings" ADD COLUMN "payment_details" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ai_settings" ADD COLUMN "strict_rules" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ai_settings"
  ADD CONSTRAINT ai_settings_payment_details_length CHECK (char_length(payment_details) <= 2000),
  ADD CONSTRAINT ai_settings_strict_rules_length CHECK (char_length(strict_rules) <= 4000);

-- CreateTable
CREATE TABLE "ai_booking" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'awaiting_payment',
    "proof_message_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_booking_by_lead" ON "ai_booking"("organization_id", "lead_id");

-- CreateIndex
CREATE INDEX "ai_booking_by_chat" ON "ai_booking"("organization_id", "conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_booking_organization_id_id_key" ON "ai_booking"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "ai_booking" ADD CONSTRAINT "ai_booking_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_booking" ADD CONSTRAINT "ai_booking_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ai_booking"
  ADD CONSTRAINT ai_booking_status_value CHECK (status IN ('awaiting_payment', 'proof_received', 'confirmed', 'cancelled')),
  ADD CONSTRAINT ai_booking_summary_length CHECK (char_length(summary) BETWEEN 1 AND 300),
  ADD CONSTRAINT ai_booking_details_object CHECK (jsonb_typeof(details) = 'object');

-- A booking is confirmed or cancelled, never deleted by the runtime role; a customer's erasure and purge do.
REVOKE DELETE ON TABLE "ai_booking" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('ai_booking');
