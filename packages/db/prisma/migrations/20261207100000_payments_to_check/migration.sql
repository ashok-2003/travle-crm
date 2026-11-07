-- Payments to check (plan 3 of 4): a customer's payment screenshot waits for a person to match it; an AI booking knows its
-- quote and the advance it asks; the agency's payment messages live in booking settings.
ALTER TABLE "ai_booking" ADD COLUMN "quote_id" UUID,
ADD COLUMN "expected_paise" BIGINT;

ALTER TABLE "ai_booking" ADD CONSTRAINT "ai_booking_organization_id_quote_id_fkey" FOREIGN KEY ("organization_id", "quote_id") REFERENCES "quote"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ai_booking" ADD CONSTRAINT ai_booking_expected_range CHECK (expected_paise BETWEEN 0 AND 10000000000);

ALTER TABLE "booking_settings"
  ADD COLUMN "payment_confirmed_text" TEXT NOT NULL DEFAULT 'Thank you {name}! We have received {amount} for {trip} on {date}. Your booking is confirmed.',
  ADD COLUMN "payment_not_found_text" TEXT NOT NULL DEFAULT 'Hi {name}, we could not find your payment of {amount} yet. Could you send the transaction reference or a clearer screenshot?',
  ADD COLUMN "payment_confirmed_template_id" UUID,
  ADD COLUMN "payment_confirmed_params" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "payment_not_found_template_id" UUID,
  ADD COLUMN "payment_not_found_params" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "payment_proof" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "lead_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_proof_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_proof_organization_id_id_key" ON "payment_proof"("organization_id", "id");
CREATE UNIQUE INDEX "payment_proof_message" ON "payment_proof"("organization_id", "message_id");
CREATE INDEX "payment_proof_pending" ON "payment_proof"("organization_id", "created_at" DESC) WHERE (status = 'pending');

ALTER TABLE "payment_proof" ADD CONSTRAINT "payment_proof_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "payment_proof" ADD CONSTRAINT "payment_proof_organization_id_conversation_id_fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "whatsapp_conversation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "payment_proof" ADD CONSTRAINT "payment_proof_organization_id_message_id_fkey" FOREIGN KEY ("organization_id", "message_id") REFERENCES "whatsapp_message"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "payment_proof" ADD CONSTRAINT "payment_proof_organization_id_lead_id_fkey" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "lead"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "payment_proof" ADD CONSTRAINT payment_proof_status_value CHECK (status IN ('pending', 'dismissed', 'matched'));

-- A proof is decided, never deleted: the runtime role deletes none (a customer's erasure and the purge, the platform's, do).
REVOKE DELETE ON TABLE "payment_proof" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('payment_proof');
